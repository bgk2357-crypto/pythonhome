import base64
import hashlib
import io
import json
import os
import secrets
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch

from flask_app import create_app
from server.core import db, now, one, rows, scalar, sign
from server.accounts import google_account, password_hash, password_verify
from server.community import filter_valid, mask
from server.news import parse, snapshot
from server.workspace import clean_asset, hierarchy

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'http://localhost'
PASSWORD = 'Testing12!'


class ApplicationTest(unittest.TestCase):
    def setUp(self):
        (ROOT / '.sites-runtime').mkdir(exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / '.sites-runtime')
        self.app = create_app(dict(AUTH_SECRET='test-secret-' * 6, APP_ORIGIN=ORIGIN,
                                  DATA_DIR=self.temp.name, MASTER_EMAIL='owner@example.com', TESTING=True))
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp.cleanup()

    def csrf(self, client=None):
        return (client or self.client).get('/api/account').json['csrf']

    def form(self, path, data, client=None):
        client = client or self.client
        return client.post(path, data=dict(data, _csrf=self.csrf(client)), headers={'Origin': ORIGIN})

    def register(self, email='member@example.com', role=None, client=None):
        client = client or self.client
        result = self.form('/auth/email/register', dict(email=email, password=PASSWORD, confirmPassword=PASSWORD, displayName='테스트회원', consent='yes'), client)
        self.assertEqual(result.status_code, 303, result.data)
        self.assertIn('saved=registered', result.location)
        with self.app.app_context():
            uid = scalar('SELECT user_id FROM auth_credentials WHERE email=?', (email,))
            if role:
                db().execute("UPDATE members SET role=?,business_name='회사',business_size='5~19인',contact_name='담당',job_title='직책',phone='01012345678' WHERE user_id=?", (role, uid))
        return uid

    def json_post(self, path, body, client=None, header=False):
        client = client or self.client
        csrf = self.csrf(client)
        return client.post(path, json=body if header else dict(body, csrf=csrf), headers=dict(Origin=ORIGIN, **({'X-CSRF-Token': csrf} if header else {})))

    def test_health_and_pages(self):
        response = self.client.get('/api/health')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['runtime'], 'python')
        self.assertTrue(all(response.json['checks'].values()))
        for path in ('/', '/login', '/members', '/community', '/qna', '/resources/safety-forms', '/resources/msds', '/admin/members'):
            response = self.client.get(path)
            self.assertEqual(response.status_code, 200, path)
            response.close()
            self.assertEqual(self.client.get('/api/page', query_string={'path': path}).status_code, 200, path)
        self.assertEqual(self.client.get('/api/unknown').status_code, 404)
        self.assertEqual(self.client.get('/auth/unknown').status_code, 404)
        self.assertEqual(self.client.get('/assets/missing.js').status_code, 404)
        self.assertEqual(self.client.post('/api/health').status_code, 405)

    def test_database_migrations_are_repeatable(self):
        for _ in range(2):
            with self.app.app_context():
                self.assertEqual(scalar('PRAGMA integrity_check'), 'ok')
                self.assertEqual(scalar('SELECT count(*) FROM _argo_migrations'), 8)
                self.assertEqual(rows('PRAGMA foreign_key_check'), [])
                self.assertEqual(scalar('SELECT count(*) FROM safety_posts'), 3)

    def test_existing_nas_hash_compatible(self):
        # NAS uses hex salt bytes and lowercase SHA256 hex, not Django's salt encoding.
        salt = bytes.fromhex('00112233445566778899aabbccddeeff')
        expected = hashlib.pbkdf2_hmac('sha256', PASSWORD.encode(), salt, 600000).hex()
        legacy = 'pbkdf2_sha256$600000$00112233445566778899aabbccddeeff$' + expected
        self.assertTrue(password_verify(PASSWORD, legacy))
        self.assertFalse(password_verify('Wrong12!', legacy))
        self.assertFalse(password_verify(PASSWORD, 'invalid'))
        self.assertTrue(password_verify(PASSWORD, password_hash(PASSWORD)))

    def test_email_registration_login_and_logout(self):
        self.register()
        status = self.client.get('/api/account').json
        self.assertTrue(status['authenticated'])
        self.assertTrue(status['passwordConfigured'])
        self.assertFalse(status['resetReady'])
        self.assertEqual(self.client.get('/api/page?path=/members').json['member']['role'], 'preliminary')
        self.client.get('/auth/logout')
        self.assertFalse(self.client.get('/api/account').json['authenticated'])
        bad = self.form('/auth/email/login', dict(email='member@example.com', password='Wrong12!'))
        self.assertIn('error=credentials', bad.location)
        good = self.form('/auth/email/login', dict(email='member@example.com', password=PASSWORD, return_to='//evil.test/'))
        self.assertEqual(good.location, '/')
        self.assertTrue(self.client.get('/api/account').json['authenticated'])
        duplicate = self.form('/auth/email/register', dict(email='MEMBER@example.com', password=PASSWORD, confirmPassword=PASSWORD, consent='yes'))
        self.assertIn('error=duplicate', duplicate.location)

    def test_origin_csrf_host_and_request_limits(self):
        token = self.csrf()
        for headers in ({}, {'Origin': 'https://evil.test'}):
            self.assertEqual(self.client.post('/actions/guestbook', data={'_csrf': token, 'author': 'a', 'body': 'b'}, headers=headers).status_code, 403)
        self.assertEqual(self.client.post('/actions/guestbook', data={'_csrf': 'wrong'}, headers={'Origin': ORIGIN}).status_code, 403)
        self.assertEqual(self.client.get('/api/health', headers={'Host': 'evil.test'}).status_code, 400)
        self.assertEqual(self.client.post('/api/community', data='x' * 16001, content_type='application/json', headers={'Origin': ORIGIN}).status_code, 413)
        self.assertEqual(self.client.post('/auth/email/login', data='x' * 8193, content_type='application/x-www-form-urlencoded', headers={'Origin': ORIGIN}).status_code, 413)
        for path in ('/.env', '/server/core.py', '/flask_app.py', '/.data/argo.sqlite', '/outputs/private.zip', '/../.env'):
            self.assertEqual(self.client.get(path).status_code, 404, path)

    def test_guestbook_owner_and_cross_client_delete(self):
        created = self.form('/actions/guestbook', dict(author='방문자', body='인사드립니다'))
        self.assertIn('saved=1', created.location)
        row = self.client.get('/api/page?path=/guestbook').json['entries']['items'][0]
        own = self.client.get('/api/content', query_string=dict(kind='guestbook', id=row['id'])).json
        self.assertTrue(own['canDelete'])
        other = self.app.test_client()
        denied = self.json_post('/api/content', dict(kind='guestbook', id=row['id']), other)
        self.assertEqual(denied.status_code, 403)
        self.assertEqual(self.json_post('/api/content', dict(kind='guestbook', id=row['id'])).status_code, 200)

    def test_profile_completion_and_paid_request(self):
        self.register()
        self.assertEqual(self.form('/actions/qna', dict(title='문의', body='내용')).status_code, 403)
        result = self.form('/actions/member-profile', dict(displayName='회원', businessName='회사', businessSize='5~19인', contactName='담당자', jobTitle='팀장', phone='010-1234-5678', consent='yes'))
        self.assertIn('saved=profile', result.location)
        self.assertEqual(self.client.get('/api/page?path=/members').json['member']['role'], 'general')
        self.assertIn('saved=request', self.form('/actions/paid-request', dict(note='승인 요청', consent='yes')).location)
        self.form('/actions/paid-request', dict(note='중복', consent='yes'))
        data = self.client.get('/api/page?path=/members').json
        self.assertEqual(len(data['paidRequests']), 1)
        self.form('/actions/paid-cancel', dict(requestId=data['paidRequests'][0]['id']))
        self.assertEqual(self.client.get('/api/page?path=/members').json['paidRequests'][0]['status'], 'cancelled')

    def test_admin_grade_payment_confirmation_and_stale(self):
        admin = self.register('admin@example.com', 'master')
        second = self.app.test_client()
        uid = self.register('second@example.com', 'general', second)
        data = self.client.get('/api/page?path=/admin/members').json['adminData']
        target = next(row for row in data['members'] if row['userId'] == uid)
        values = dict(userId=uid, version=str(target['version']), reason='입금 확인', role='paid')
        self.assertIn('error=payment', self.form('/actions/admin-grade', values).location)
        self.assertIn('saved=1', self.form('/actions/admin-grade', dict(values, paymentConfirmed='yes', amount='10000', paymentReference='입금확인번호')).location)
        self.assertIn('error=stale', self.form('/actions/admin-grade', dict(values, role='general')).location)
        self.assertEqual(self.form('/actions/admin-grade', values, second).status_code, 403)
        self.assertIsNone(second.get('/api/page?path=/admin/members').json['adminData'])

    def test_qna_visibility_and_master_answer(self):
        uid = self.register(role='general')
        self.form('/actions/qna', dict(title='비공개 문의', body='내 문의'))
        own = self.client.get('/api/page?path=/qna').json['posts']['items']
        other = self.app.test_client()
        self.register('other@example.com', 'general', other)
        self.assertEqual(other.get('/api/page?path=/qna').json['posts']['total'], 0)
        with self.app.app_context():
            db().execute("UPDATE members SET role='master' WHERE user_id=?", (uid,))
        self.form('/actions/qna-answer', dict(postId=str(own[0]['id']), answer='답변 내용'))
        self.assertEqual(self.client.get('/api/page?path=/qna').json['posts']['items'][0]['answer'], '답변 내용')

    def test_community_comments_filters_ownership_and_versions(self):
        self.register(role='general')
        response = self.json_post('/api/community', dict(action='create', title='씨발 필터 확인', body='본문'))
        self.assertEqual(response.status_code, 200, response.data)
        pid = response.json['id']
        item = self.client.get('/api/community', query_string={'post': pid}).json['selected']
        self.assertNotIn('씨발', item['title'])
        self.assertIn('씨발', item['editable']['title'])
        comment = self.json_post('/api/community', dict(action='comment-create', postId=pid, body='댓글'))
        self.assertEqual(comment.status_code, 200)
        stranger = self.app.test_client()
        self.register('stranger@example.com', 'general', stranger)
        self.assertEqual(self.json_post('/api/community', dict(action='delete', id=pid, version=1), stranger).status_code, 409)
        self.assertEqual(self.json_post('/api/community', dict(action='update', id=pid, version=1, title='수정', body='내용')).status_code, 200)
        self.assertEqual(self.json_post('/api/community', dict(action='update', id=pid, version=1, title='오래된 수정', body='내용')).status_code, 409)
        self.assertEqual(self.json_post('/api/community', dict(action='delete', id=pid, version=2)).status_code, 200)
        with self.app.app_context():
            self.assertEqual(scalar('SELECT count(*) FROM community_comments'), 0)

    def test_moderation_patterns_are_bounded(self):
        self.assertTrue(filter_valid('regex', r'[씨시][\s._-]{0,3}[발빨팔]'))
        self.assertEqual(mask('씨 . 발', [{'kind': 'regex', 'expression': r'[씨시][\s._-]{0,3}[발빨팔]'}]), '*****')
        for pattern in ('(a+)+', 'a*', 'a{0,100000}', '(?=a)', r'\1', 'a{0,2}'):
            self.assertFalse(filter_valid('regex', pattern), pattern)
        self.register(role='master')
        self.assertEqual(self.json_post('/api/community', dict(action='rule-add', kind='regex', expression='(a+)+')).status_code, 400)
        self.assertEqual(self.json_post('/api/community', dict(action='rule-add', kind='keyword', expression='금칙어')).status_code, 200)

    def test_resource_upload_download_and_cascade_delete(self):
        self.register(role='general')
        data = dict(title='첨부자료', body='본문', category='서식', consent='public', files=(io.BytesIO('한글 자료'.encode()), '자료.txt'), _csrf=self.csrf())
        response = self.client.post('/actions/safety-resources', data=data, headers={'Origin': ORIGIN}, content_type='multipart/form-data')
        self.assertEqual(response.status_code, 303, response.data)
        listing = self.client.get('/api/page?path=/resources/safety-forms').json['resources']['items']
        post = next(item for item in listing if item['title'] == '첨부자료')
        download = self.client.get('/api/safety-files', query_string={'file': post['files'][0]['id']})
        self.assertEqual(download.data, '한글 자료'.encode())
        self.assertIn('attachment', download.headers['Content-Disposition'])
        self.assertEqual(self.json_post('/api/content', dict(kind='resource', id=post['id'])).status_code, 200)
        self.assertEqual(self.client.get('/api/safety-files', query_string={'file': post['files'][0]['id']}).status_code, 404)
        with self.app.app_context():
            self.assertEqual(scalar('SELECT count(*) FROM safety_file_chunks'), 0)

    def test_bad_resource_file_rejected(self):
        self.register(role='general')
        for name, data in [('fake.pdf', b'not pdf'), ('script.html', b'<script>'), ('bad.txt', b'\xff')]:
            response = self.client.post('/actions/safety-resources', data=dict(title='제목', body='본문', category='서식', consent='public', files=(io.BytesIO(data), name), _csrf=self.csrf()), headers={'Origin': ORIGIN}, content_type='multipart/form-data')
            self.assertIn('error=file', response.location)

    def test_workspace_paid_access(self):
        self.assertEqual(self.client.get('/api/workspace').status_code, 401)
        self.register(role='general')
        self.assertEqual(self.client.get('/api/workspace').status_code, 403)

    def test_workspace_save_download_ownership_history_and_stale(self):
        self.register(role='paid')
        settings = dict(businessName='사업장', notice='', categories=[], hierarchy=[dict(id='dept', parentId='', level=1, name='부서')])
        response = self.json_post('/api/workspace', dict(action='settings', version=0, settings=settings), header=True)
        self.assertEqual(response.status_code, 200, response.data)
        item = dict(id='asset-1', fileName='원본.txt', product='제품', categoryId='dept', reviewed=True, published=True,
                    managementEntries=[dict(id='entry-1', categoryId='dept', notes='관리요령')])
        file = dict(name='원본.txt', data=base64.b64encode('원본 파일'.encode()).decode())
        response = self.json_post('/api/workspace', dict(action='save', version=0, item=item, file=file), header=True)
        self.assertEqual(response.status_code, 200, response.data)
        workspace = self.client.get('/api/workspace').json
        self.assertEqual(workspace['items'][0]['department'], '부서')
        self.assertEqual(workspace['items'][0]['managementEntries'][0]['notes'], '관리요령')
        self.assertEqual(workspace['history'][0]['action'], 'publish')
        self.assertEqual(self.client.get('/api/workspace?file=asset-1').data, '원본 파일'.encode())
        self.assertEqual(self.json_post('/api/workspace', dict(action='save', version=0, item=item), header=True).status_code, 409)
        self.assertEqual(self.json_post('/api/workspace', dict(action='settings', version=1, settings=dict(settings, hierarchy=[])), header=True).status_code, 409)
        stranger = self.app.test_client()
        self.register('stranger@example.com', 'paid', stranger)
        self.assertEqual(stranger.get('/api/workspace?file=asset-1').status_code, 404)
        self.assertEqual(stranger.get('/api/workspace').json['items'], [])
        self.assertEqual(self.json_post('/api/workspace', dict(action='delete', version=1, id='asset-1'), stranger, True).status_code, 404)
        self.assertEqual(self.json_post('/api/workspace', dict(action='delete', version=1, id='asset-1'), header=True).status_code, 200)
        with self.app.app_context():
            self.assertEqual(scalar('SELECT count(*) FROM msds_original_chunks'), 0)

    def test_hierarchy_and_asset_validation(self):
        self.assertIsNone(hierarchy([dict(id='a', parentId='b', level=1, name='순환')]))
        self.assertIsNone(hierarchy([dict(id='a', parentId='', level=1, name='부서'), dict(id='b', parentId='', level=1, name='부서')]))
        self.assertIsNone(clean_asset(dict(id='../bad')))
        self.assertIsNone(clean_asset(dict(id='valid', text='x' * 100001)))
        self.assertFalse(clean_asset(dict(id='valid', kind='measurement', reviewed=True, published=True))['published'])
        self.assertFalse(clean_asset(dict(id='valid', reviewed=False, published=True))['published'])

    def test_reset_single_use_and_session_invalidation(self):
        self.register()
        second = self.app.test_client()
        self.form('/auth/email/login', dict(email='member@example.com', password=PASSWORD), second)
        self.app.config.update(MAIL_TRANSPORT='api', MAIL_FROM='sender@example.com', MAIL_API_KEY='test-only', MAIL_API_URL='https://api.example.test/send')
        with patch('server.accounts.reset_send') as mail:
            self.assertIn('saved=sent', self.form('/auth/email/forgot', dict(email='member@example.com')).location)
            token = mail.call_args[0][1]
            self.assertEqual(mail.call_args[0][0], 'member@example.com')
        with self.app.app_context():
            stored = scalar('SELECT token_hash FROM auth_password_resets')
            self.assertNotEqual(stored, token)
            self.assertEqual(stored, hashlib.sha256(token.encode()).hexdigest())
        response = self.form('/auth/email/reset', dict(token=token, password='Changed12!', confirmPassword='Changed12!'))
        self.assertIn('saved=reset', response.location)
        self.assertFalse(second.get('/api/account').json['authenticated'])
        self.assertIn('error=token', self.form('/auth/email/reset', dict(token=token, password='Changed12!', confirmPassword='Changed12!')).location)

    def test_withdrawal_cleans_private_data_and_blocks_last_master(self):
        uid = self.register(role='master')
        self.assertIn('error=lastmaster', self.form('/auth/email/withdraw', dict(confirmWithdrawal='탈퇴', currentPassword=PASSWORD)).location)
        with self.app.app_context():
            db().execute("UPDATE members SET role='general' WHERE user_id=?", (uid,))
        self.form('/actions/community', dict(title='삭제될 글', body='개인 글'))
        self.assertIn('saved=withdrawn', self.form('/auth/email/withdraw', dict(confirmWithdrawal='탈퇴', currentPassword=PASSWORD)).location)
        self.assertFalse(self.client.get('/api/account').json['authenticated'])
        with self.app.app_context():
            self.assertEqual(scalar('SELECT count(*) FROM auth_credentials'), 0)
            self.assertEqual(scalar('SELECT count(*) FROM posts'), 0)
            self.assertEqual(scalar('SELECT email FROM members WHERE user_id=?', (uid,)), '')

    def test_google_state_mapping_and_no_email_auto_link(self):
        self.register()
        self.assertIn('error=configuration', self.client.get('/auth/google').location)
        self.app.config.update(GOOGLE_CLIENT_ID='test-client', GOOGLE_CLIENT_SECRET='test-secret')
        start = self.client.get('/auth/google?return_to=/members')
        self.assertIn('code_challenge_method=S256', start.location)
        self.assertIn('error=cancelled', self.client.get('/auth/google/callback?state=wrong&code=unused').location)
        with self.app.app_context():
            actor = dict(userId='google:new-user', email='member@example.com', displayName='인증회원', authMethod='google')
            with self.assertRaises(ValueError):
                google_account(actor)
            uid = scalar('SELECT user_id FROM auth_credentials WHERE email=?', ('member@example.com',))
            linked = google_account(actor, uid)
            self.assertEqual(linked['userId'], uid)
            self.assertEqual(scalar('SELECT google_user_id FROM auth_credentials WHERE user_id=?', (uid,)), 'google:new-user')

    def test_news_parse_cache_and_failure_fallback(self):
        source = dict(id='test', name='공식', kind='general', format='rss', url='https://example.com/rss')
        body = '<rss><channel><item><title>산업안전 소식</title><link>https://example.com/news?utm_source=x</link><pubDate>' + now() + '</pubDate></item></channel></rss>'
        parsed = parse(body, source)
        self.assertEqual(parsed[0]['url'], 'https://example.com/news')
        value = snapshot(source, None, None, now())
        self.assertTrue(value['failed'])
        self.assertEqual(value['items'], [])
        with patch('server.news.fetch_source', return_value=body) as fetch:
            response = self.client.get('/api/news?kind=general')
            self.assertEqual(response.status_code, 200, response.data)
            self.assertTrue(response.json['articles'])
            count = fetch.call_count
            self.client.get('/api/news?kind=general')
            self.assertEqual(fetch.call_count, count)
        self.assertEqual(self.client.get('/api/news?kind=invalid').status_code, 400)

    def test_nas_database_import_backup_and_no_overwrite(self):
        uid = self.register(role='paid')
        self.form('/actions/community', dict(title='이전할 게시글', body='기존 데이터'))
        source = Path(self.temp.name) / 'argo.sqlite'
        target_dir = Path(self.temp.name) / 'imported'
        env = dict(os.environ, AUTH_SECRET='isolated-test-' * 5, APP_ORIGIN=ORIGIN, DATA_DIR=str(target_dir))
        command = [sys.executable, str(ROOT / 'scripts/manage.py'), 'import-nas-db', '--source', str(source)]
        result = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with closing(sqlite3.connect(target_dir / 'argo.sqlite')) as connection:
            self.assertEqual(connection.execute('SELECT user_id FROM auth_credentials').fetchone()[0], uid)
            self.assertEqual(connection.execute('SELECT title FROM posts').fetchone()[0], '이전할 게시글')
            self.assertEqual(connection.execute('SELECT count(*) FROM _argo_migrations').fetchone()[0], 8)
        repeated = subprocess.run(command, cwd=ROOT, env=env, capture_output=True, text=True)
        self.assertNotEqual(repeated.returncode, 0)
        backup = Path(self.temp.name) / 'private-backup.sqlite'
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/manage.py'), 'backup-db', '--output', str(backup)], cwd=ROOT, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        with closing(sqlite3.connect(backup)) as connection:
            self.assertEqual(connection.execute('PRAGMA integrity_check').fetchone()[0], 'ok')

    def test_wsgi_import_and_secure_cookie_configuration(self):
        env = dict(os.environ, AUTH_SECRET='isolated-test-' * 5, APP_ORIGIN='https://example.test', DATA_DIR=self.temp.name)
        result = subprocess.run([sys.executable, '-c', 'from wsgi import application; print(callable(application))'], cwd=ROOT, env=env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(result.stdout.strip(), 'True')
        secure_app = create_app(dict(AUTH_SECRET='isolated-test-' * 5, APP_ORIGIN='https://example.test', DATA_DIR=self.temp.name))
        response = secure_app.test_client().get('/api/account', base_url='https://example.test')
        cookies = '; '.join(response.headers.getlist('Set-Cookie'))
        self.assertIn('Secure', cookies)
        self.assertIn('HttpOnly', cookies)
        self.assertIn('SameSite=Lax', cookies)
        with self.assertRaises(RuntimeError):
            create_app(dict(AUTH_SECRET='isolated-test-' * 5, APP_ORIGIN=ORIGIN, DATA_DIR=str(ROOT / 'web/private-db')))

    def test_email_owner_name_does_not_grant_master(self):
        self.register('owner@example.com')
        self.assertEqual(self.client.get('/api/page?path=/members').json['member']['role'], 'preliminary')
        self.assertIsNone(self.client.get('/api/page?path=/admin/members').json['adminData'])


if __name__ == '__main__':
    unittest.main()
