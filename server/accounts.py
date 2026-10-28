"""Email/Google authentication, recovery and withdrawal; NAS PBKDF2 compatible."""
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import time
import urllib.request
from urllib.parse import urlencode, urlsplit

from flask import Blueprint, current_app, jsonify, request
from werkzeug.exceptions import HTTPException

from .core import (b64, cookie, csrf, db, error, form_input, go, identity,
                   member_profile, now, one, read_signed, rows, safe_path, scalar,
                   sign, transaction)

bp = Blueprint('accounts', __name__)


def email_address(value):
    if not isinstance(value, str):
        return None
    value = value.strip().lower()
    if len(value) > 254 or '@' not in value:
        return None
    local = value.split('@')[0]
    if len(local) > 64 or local.startswith('.') or local.endswith('.') or '..' in local:
        return None
    return value if re.fullmatch(r"[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+", value) else None


def password_valid(value):
    return isinstance(value, str) and bool(re.fullmatch(r'(?=.*[A-Za-z])(?=.*[0-9])(?=.*[^A-Za-z0-9])[\x21-\x7e]{8,16}', value))


def password_hash(password):
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), 600000).hex()
    return 'pbkdf2_sha256$600000$' + salt + '$' + digest


def password_verify(password, stored):
    if not isinstance(password, str) or len(password) > 128:
        return False
    parts = (stored or '').split('$')
    valid = len(parts) == 4 and parts[:2] == ['pbkdf2_sha256', '600000'] and re.fullmatch('[a-f0-9]{32}', parts[2]) and re.fullmatch('[a-f0-9]{64}', parts[3])
    actual = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(parts[2] if valid else '0' * 32), 600000).hex()
    return hmac.compare_digest(actual, parts[3] if valid else '0' * 64) and bool(valid)


def account_for(actor):
    existing = one('SELECT * FROM auth_credentials WHERE user_id=?', (actor['userId'],))
    if existing:
        return existing
    email = email_address(actor['email'])
    if email:
        db().execute('INSERT OR IGNORE INTO auth_credentials(email,user_id,google_user_id,updated_at) SELECT ?,?,?,? WHERE (SELECT count(*) FROM members WHERE lower(trim(email))=?)=1',
                     (email, actor['userId'], actor['userId'] if actor['userId'].startswith('google:') else None, now(), email))
    return one('SELECT * FROM auth_credentials WHERE user_id=?', (actor['userId'],))


def recent_google(actor):
    return bool(actor and actor.get('authMethod') == 'google' and isinstance(actor.get('authenticatedAt'), (float, int)) and time.time() - 600 < actor['authenticatedAt'] <= time.time() + 30)


def rate(key, limit=8):
    # Bound per-IP and per-account traffic without trusting X-Forwarded-For.
    stamp = int(time.time())
    with transaction() as connection:
        connection.execute('DELETE FROM auth_rate_limits WHERE expires_at<=?', (stamp,))
        connection.execute('INSERT OR IGNORE INTO auth_rate_limits(key,count,expires_at) VALUES(?,0,?)', (key, stamp + 900))
        return connection.execute('UPDATE auth_rate_limits SET count=count+1 WHERE key=? AND count<?', (key, limit)).rowcount > 0


def password_session(user_id, email, name):
    version = scalar('SELECT session_version FROM auth_credentials WHERE user_id=?', (user_id,))
    cookie('argo_session', sign(dict(type='session', userId=user_id, email=email, displayName=name,
                                    authMethod='password', sessionVersion=version,
                                    authenticatedAt=int(time.time()), exp=int(time.time()) + 604800)))


def fail(action, message):
    mode = {'register': 'signup', 'password': 'manage', 'forgot': 'forgot'}.get(action, 'login')
    go('/login?' + urlencode(dict(mode=mode, error=message)))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def https_json(url, data=None, bearer=None, as_form=False):
    if urlsplit(url).scheme != 'https':
        raise ValueError('HTTPS required')
    headers = {'Accept': 'application/json'}
    if bearer:
        headers['Authorization'] = 'Bearer ' + bearer
    payload = None
    if data is not None:
        headers['Content-Type'] = 'application/x-www-form-urlencoded' if as_form else 'application/json'
        payload = (urlencode(data) if as_form else json.dumps(data, ensure_ascii=False)).encode()
    req = urllib.request.Request(url, data=payload, headers=headers)
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=15) as response:
        raw = response.read(1000001)
        if len(raw) > 1000000:
            raise ValueError('Remote response too large')
        return json.loads(raw)


def reset_ready():
    c = current_app.config
    return bool(c.get('MAIL_TRANSPORT') == 'api' and email_address(c.get('MAIL_FROM')) and c.get('MAIL_API_KEY') and c.get('MAIL_API_URL', '').startswith('https://'))


def reset_send(email, token):
    c = current_app.config
    link = c['APP_ORIGIN'] + '/login?' + urlencode(dict(mode='reset', token=token))
    https_json(c['MAIL_API_URL'], {'from': c['MAIL_FROM'], 'to': [email], 'subject': 'HOME 비밀번호 재설정',
               'text': '가입 이메일의 비밀번호를 재설정하려면 15분 안에 아래 링크를 여세요. 한 번만 사용할 수 있습니다. 요청하지 않았다면 무시하세요.\n' + link}, c['MAIL_API_KEY'])


@bp.get('/api/account')
def status():
    actor = identity()
    account = account_for(actor) if actor else None
    return jsonify(csrf=csrf(), authenticated=bool(actor), email=actor['email'] if actor else '',
                   passwordConfigured=bool(account and account['password_hash']), googleLinked=bool(account and account['google_user_id']),
                   resetReady=reset_ready(), recentGoogle=recent_google(actor))


def recovery(action, form):
    if action == 'forgot':
        if not reset_ready():
            fail(action, 'mail')
        email = email_address(form.get('email'))
        if not email:
            fail(action, 'email')
        if rate('forgot:' + email, 3):
            account = one('SELECT * FROM auth_credentials WHERE email=?', (email,))
            if account:
                token = secrets.token_hex(32)
                digest = hashlib.sha256(token.encode()).hexdigest()
                with transaction() as connection:
                    connection.execute('DELETE FROM auth_password_resets WHERE user_id=? OR expires_at<?', (account['user_id'], int(time.time())))
                    connection.execute('INSERT INTO auth_password_resets(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)', (digest, account['user_id'], int(time.time()) + 900, str(int(time.time()))))
                try:
                    reset_send(account['email'], token)
                except Exception:
                    db().execute('DELETE FROM auth_password_resets WHERE token_hash=?', (digest,))
                    current_app.logger.warning('Reset mail delivery failed (recipient and token omitted)')
        go('/login?mode=forgot&saved=sent')
    token = form.get('token', '')
    password = form.get('password', '')
    if not re.fullmatch('[a-f0-9]{64}', token):
        go('/login?mode=forgot&error=token')
    if not password_valid(password) or password != form.get('confirmPassword'):
        go('/login?' + urlencode(dict(mode='reset', token=token, error='password')))
    hashed = password_hash(password)
    with transaction() as connection:
        row = one('SELECT user_id FROM auth_password_resets WHERE token_hash=? AND consumed_by IS NULL AND expires_at>?', (hashlib.sha256(token.encode()).hexdigest(), int(time.time())))
        if not row:
            go('/login?mode=forgot&error=token')
        connection.execute('UPDATE auth_password_resets SET consumed_by=? WHERE token_hash=?', (secrets.token_hex(16), hashlib.sha256(token.encode()).hexdigest()))
        connection.execute('UPDATE auth_credentials SET password_hash=?,session_version=session_version+1,updated_at=? WHERE user_id=?', (hashed, now(), row['user_id']))
    cookie('argo_session', '', -1)
    go('/login?saved=reset')


def withdraw(actor, form):
    if form.get('confirmWithdrawal') != '탈퇴':
        go('/members?error=confirm')
    account = account_for(actor)
    if not recent_google(actor) and not password_verify(form.get('currentPassword', ''), account['password_hash'] if account else None):
        go('/members?error=reauth')
    uid = actor['userId']
    with transaction() as connection:
        if scalar('SELECT role FROM members WHERE user_id=?', (uid,)) == 'master' and scalar("SELECT count(*) FROM members WHERE role='master' AND deleted_at IS NULL") < 2:
            go('/members?error=lastmaster')
        connection.execute('INSERT OR IGNORE INTO auth_retired_identities(user_id) SELECT google_user_id FROM auth_credentials WHERE user_id=? AND google_user_id IS NOT NULL', (uid,))
        for table in ('auth_password_resets', 'auth_credentials', 'member_paid_requests', 'msds_publication_events', 'msds_assets', 'msds_workspace_settings', 'community_comments', 'posts', 'safety_posts', 'guestbook'):
            connection.execute('DELETE FROM ' + table + ' WHERE user_id=?', (uid,))
        connection.execute("UPDATE members SET deleted_at=?,email='',display_name='탈퇴회원',role='preliminary',business_name='',business_size='',contact_name='',job_title='',phone='',profile_completed_at=NULL,version=version+1 WHERE user_id=?", (now(), uid))
    cookie('argo_session', '', -1)
    go('/login?saved=withdrawn')


@bp.post('/auth/email/<action>')
def email_action(action):
    if action not in ('login', 'register', 'password', 'forgot', 'reset', 'withdraw'):
        error('not-found', 404)
    form = form_input(8192)
    if not rate('ip:' + (request.remote_addr or 'unknown'), 80):
        fail(action, 'rate')
    if action in ('forgot', 'reset'):
        recovery(action, form)
    if action == 'withdraw':
        actor = identity()
        if not actor:
            fail(action, 'authentication')
        withdraw(actor, form)
    email, password = email_address(form.get('email')), form.get('password', '')
    key = action + ':' + (identity()['userId'] if action == 'password' and identity() else email or 'invalid')
    if not rate(key):
        fail(action, 'rate')
    if action == 'register':
        if not email:
            fail(action, 'email')
        if not password_valid(password) or password != form.get('confirmPassword'):
            fail(action, 'password')
        if form.get('consent') != 'yes':
            fail(action, 'consent')
        uid, name, stamp = 'local:' + secrets.token_hex(16), (form.get('displayName', '').strip() or email.split('@')[0])[:30], now()
        hashed = password_hash(password)
        try:
            with transaction() as connection:
                if scalar('SELECT 1 FROM members WHERE lower(trim(email))=?', (email,)):
                    fail(action, 'duplicate')
                connection.execute("INSERT INTO members(user_id,display_name,created_at,email,role,updated_at) VALUES(?,?,?,?,'preliminary',?)", (uid, name, stamp, email, stamp))
                connection.execute('INSERT INTO auth_credentials(email,user_id,password_hash,updated_at) VALUES(?,?,?,?)', (email, uid, hashed, stamp))
        except sqlite3.IntegrityError:
            fail(action, 'duplicate')
        password_session(uid, email, name)
        go('/members?saved=registered')
    if action == 'login':
        if not email or len(password) > 128:
            fail(action, 'credentials')
        account = one('SELECT * FROM auth_credentials WHERE email=?', (email,))
        if not password_verify(password, account['password_hash'] if account else None):
            if (not account or not account['password_hash']) and scalar('SELECT 1 FROM members WHERE lower(trim(email))=?', (email,)):
                fail(action, 'setup')
            fail(action, 'credentials')
        member = one('SELECT display_name FROM members WHERE user_id=? AND deleted_at IS NULL', (account['user_id'],))
        if not member:
            fail(action, 'credentials')
        db().execute('DELETE FROM auth_rate_limits WHERE key=?', (key,))
        password_session(account['user_id'], account['email'], member['display_name'])
        go(safe_path(form.get('return_to', '/members')))
    actor = identity()
    if not actor:
        fail(action, 'authentication')
    account = account_for(actor)
    if not account:
        fail(action, 'duplicate')
    if not password_valid(password) or password != form.get('confirmPassword'):
        fail(action, 'password')
    if not recent_google(actor) and not password_verify(form.get('currentPassword', ''), account['password_hash']):
        fail(action, 'reauth')
    db().execute('UPDATE auth_credentials SET password_hash=?,updated_at=? WHERE user_id=?', (password_hash(password), now(), actor['userId']))
    go('/login?mode=manage&saved=password')


def google_ready():
    return bool(current_app.config.get('GOOGLE_CLIENT_ID') and current_app.config.get('GOOGLE_CLIENT_SECRET'))


@bp.get('/auth/google')
def google_start():
    if not google_ready():
        go('/login?error=configuration')
    if request.host != urlsplit(current_app.config['APP_ORIGIN']).netloc:
        go('/login?error=origin')
    actor = identity()
    if request.args.get('link') == '1' and not actor:
        go('/login?error=authentication')
    state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    flow = dict(type='oauth', state=state, verifier=verifier, returnTo=safe_path(request.args.get('return_to', '/')),
                linkUserId=actor['userId'] if request.args.get('link') == '1' else None, exp=int(time.time()) + 600)
    cookie('argo_google_flow', sign(flow), 600)
    c = current_app.config
    go('https://accounts.google.com/o/oauth2/v2/auth?' + urlencode(dict(client_id=c['GOOGLE_CLIENT_ID'], redirect_uri=c['APP_ORIGIN'] + '/auth/google/callback', response_type='code', scope='openid email profile', state=state, code_challenge=b64(hashlib.sha256(verifier.encode()).digest()), code_challenge_method='S256', prompt='select_account')))


def google_account(actor, link=None):
    uid, email = actor['userId'], actor['email']
    with transaction() as connection:
        if scalar('SELECT 1 FROM auth_retired_identities WHERE user_id=?', (uid,)) or scalar('SELECT 1 FROM members WHERE user_id=? AND deleted_at IS NOT NULL', (uid,)):
            raise ValueError('Withdrawn')
        mapped = one('SELECT * FROM auth_credentials WHERE google_user_id=?', (uid,))
        if link:
            account = one('SELECT * FROM auth_credentials WHERE user_id=?', (link,))
            if not account or account['email'] != email or (mapped and mapped['user_id'] != link):
                raise ValueError('Link conflict')
            connection.execute('UPDATE auth_credentials SET google_user_id=?,updated_at=? WHERE user_id=?', (uid, now(), link))
            actor.update(userId=link, email=account['email'])
        elif mapped:
            actor.update(userId=mapped['user_id'], email=mapped['email'])
        elif scalar('SELECT 1 FROM members WHERE user_id=?', (uid,)):
            account_for(actor)
        else:
            if scalar('SELECT 1 FROM auth_credentials WHERE email=?', (email,)) or scalar('SELECT 1 FROM members WHERE lower(trim(email))=?', (email,)):
                raise ValueError('Explicit account link required')
            stamp = now()
            connection.execute("INSERT INTO members(user_id,display_name,created_at,email,role,updated_at) VALUES(?,?,?,?,'preliminary',?)", (uid, actor['displayName'][:30], stamp, email, stamp))
            connection.execute('INSERT INTO auth_credentials(email,user_id,google_user_id,updated_at) VALUES(?,?,?,?)', (email, uid, uid, stamp))
    return actor


@bp.get('/auth/google/callback')
def google_callback():
    flow = read_signed(request.cookies.get('argo_google_flow'))
    cookie('argo_google_flow', '', -1)
    if request.host != urlsplit(current_app.config['APP_ORIGIN']).netloc or not flow or flow.get('type') != 'oauth' or not request.args.get('state') or not hmac.compare_digest(flow.get('state', ''), request.args['state']) or not request.args.get('code') or request.args.get('error'):
        go('/login?error=cancelled')
    try:
        c = current_app.config
        token = https_json('https://oauth2.googleapis.com/token', dict(client_id=c['GOOGLE_CLIENT_ID'], client_secret=c['GOOGLE_CLIENT_SECRET'], code=request.args['code'], grant_type='authorization_code', redirect_uri=c['APP_ORIGIN'] + '/auth/google/callback', code_verifier=flow['verifier']), as_form=True)
        profile = https_json('https://openidconnect.googleapis.com/v1/userinfo', bearer=token['access_token'])
        if not isinstance(profile.get('sub'), str) or not profile['sub'] or profile.get('email_verified') is not True or not email_address(profile.get('email')):
            raise ValueError('Unverified Google profile')
        actor = dict(type='session', userId='google:' + profile['sub'], email=email_address(profile['email']), displayName=str(profile.get('name') or profile['email'])[:100], fullName=profile.get('name'), authMethod='google', authenticatedAt=int(time.time()), exp=int(time.time()) + 604800)
        if flow.get('linkUserId') and (not identity() or identity()['userId'] != flow['linkUserId']):
            go('/login?error=link')
        actor = google_account(actor, flow.get('linkUserId'))
        member = member_profile(actor)
    except HTTPException:
        raise
    except Exception:
        current_app.logger.warning('Google authentication failed (credentials omitted)')
        go('/login?error=link')
    cookie('argo_session', sign(actor))
    go('/members' if member['role'] == 'preliminary' and not flow.get('linkUserId') else safe_path(flow.get('returnTo', '/')))


@bp.get('/auth/logout')
def logout():
    cookie('argo_session', '', -1)
    cookie('argo_google_flow', '', -1)
    go(safe_path(request.args.get('return_to', '/')))
