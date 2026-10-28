"""Shared SQLite, signed-cookie and request protections for the Python port."""
import base64
import hashlib
import hmac
import json
import math
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from flask import abort, current_app, g, jsonify, redirect, request


def now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def error(message, status=400):
    abort(current_app.make_response((jsonify(error=message), status)))


def rows(sql, args=()):
    return [dict(row) for row in db().execute(sql, args).fetchall()]


def one(sql, args=()):
    row = db().execute(sql, args).fetchone()
    return dict(row) if row else None


def scalar(sql, args=()):
    row = db().execute(sql, args).fetchone()
    return row[0] if row else None


def db():
    if 'db' not in g:
        directory = Path(current_app.config['DATA_DIR']).resolve()
        public_roots = [Path(current_app.config[key]).resolve() for key in ('PUBLIC_DIR', 'WEB_DIR')]
        if any(directory == public or public in directory.parents for public in public_roots):
            raise RuntimeError('DATA_DIR must be outside public/ and web/')
        directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        connection = sqlite3.connect(directory / 'argo.sqlite', timeout=10, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('PRAGMA journal_mode=WAL')
        connection.execute('PRAGMA busy_timeout=10000')
        g.db = connection
        try:
            migrate(connection)
        except Exception:
            g.pop('db').close()
            raise
    return g.db


def migrate(connection):
    # Use the NAS migration names and SQL, so an imported DB is upgraded once only.
    connection.execute('CREATE TABLE IF NOT EXISTS _argo_migrations(name TEXT PRIMARY KEY NOT NULL)')
    for path in sorted(Path(__file__).with_name('migrations').glob('*.sql')):
        connection.execute('BEGIN IMMEDIATE')
        try:
            if not connection.execute('SELECT 1 FROM _argo_migrations WHERE name=?', (path.name,)).fetchone():
                statement = ''
                for line in path.read_text(encoding='utf-8-sig').splitlines(True):
                    statement += line
                    if sqlite3.complete_statement(statement):
                        connection.execute(statement)
                        statement = ''
                if statement.strip() and not statement.strip().startswith('--'):
                    connection.execute(statement)
                connection.execute('INSERT INTO _argo_migrations(name) VALUES(?)', (path.name,))
            connection.execute('COMMIT')
        except Exception:
            connection.execute('ROLLBACK')
            raise


@contextmanager
def transaction():
    connection = db()
    connection.execute('BEGIN IMMEDIATE')
    try:
        yield connection
        connection.execute('COMMIT')
    except BaseException:
        connection.execute('ROLLBACK')
        raise


def b64(value):
    return base64.urlsafe_b64encode(value).decode().rstrip('=')


def sign(value):
    payload = b64(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode())
    return payload + '.' + b64(hmac.new(current_app.config['AUTH_SECRET'].encode(), payload.encode(), hashlib.sha256).digest())


def read_signed(value):
    try:
        if not isinstance(value, str) or len(value) > 6000:
            return None
        payload, signature = value.split('.')
        expected = b64(hmac.new(current_app.config['AUTH_SECRET'].encode(), payload.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(signature, expected):
            return None
        data = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        return data if isinstance(data, dict) and isinstance(data.get('exp'), (float, int)) and data['exp'] > time.time() else None
    except (ValueError, TypeError, UnicodeError):
        return None


def cookie(name, value, seconds=604800):
    g.setdefault('cookies', {})[name] = (value, seconds)


def token_cookie(name, seconds=604800):
    token = g.get(name) or request.cookies.get(name, '')
    if not re.fullmatch('[a-f0-9]{64}', token):
        token = secrets.token_hex(32)
        cookie(name, token, seconds)
    setattr(g, name, token)
    return token


def csrf():
    return token_cookie('argo_csrf')


def guest_owner():
    return hashlib.sha256(token_cookie('argo_guest_owner', 31536000).encode()).hexdigest()


def check_csrf(value):
    token = request.cookies.get('argo_csrf', '')
    if not re.fullmatch('[a-f0-9]{64}', token) or not isinstance(value, str) or not hmac.compare_digest(token, value):
        error('refresh-form', 403)


def check_origin():
    # Compare with the configured origin only; do not trust arbitrary forwarded headers.
    if request.headers.get('Origin') != current_app.config['APP_ORIGIN']:
        error('different-origin', 403)


def form_input(limit=32768, multipart=False):
    check_origin()
    if request.content_length and request.content_length > limit:
        error('too-large', 413)
    expected = 'multipart/form-data' if multipart else 'application/x-www-form-urlencoded'
    if request.mimetype != expected:
        error('invalid')
    if not multipart and len(request.get_data(cache=True)) > limit:
        error('too-large', 413)
    form = request.form
    if any(len(form.getlist(key)) != 1 for key in form):
        error('invalid')
    check_csrf(form.get('_csrf'))
    return form


def json_input(limit=16000, header_csrf=False):
    check_origin()
    if request.mimetype != 'application/json':
        error('invalid')
    raw = request.get_data(cache=True)
    if len(raw) > limit:
        error('too-large', 413)
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        error('invalid')
    check_csrf(request.headers.get('X-CSRF-Token') if header_csrf else data.get('csrf'))
    return data


def field(data, key, maximum, minimum=1):
    value = data.get(key)
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value if minimum <= len(value) <= maximum and '\x00' not in value else None


def safe_path(value):
    if not isinstance(value, str) or not value.startswith('/') or value.startswith('//') or re.search(r'[\\\x00-\x20\x7f]', value):
        return '/'
    parsed = urlsplit(value)
    if parsed.path.startswith('/auth/') or parsed.path in ('/login', '/index.php'):
        return '/'
    return value


def go(path):
    abort(redirect(path, code=303))


def page_number(value):
    return min(10000, max(1, int(value))) if str(value).isdigit() else 1


def pagination(total, page, size=10):
    pages = max(1, math.ceil(total / size))
    current = min(pages, page_number(page))
    return dict(total=total, pages=pages, current=current), (current - 1) * size


MEMBER_COLUMNS = '''user_id AS userId,display_name AS displayName,created_at AS createdAt,
email,role,business_name AS businessName,business_size AS businessSize,contact_name AS contactName,
job_title AS jobTitle,phone,profile_completed_at AS profileCompletedAt,updated_at AS updatedAt,version'''


def identity():
    if 'identity' in g:
        return g.identity
    value = read_signed(request.cookies.get('argo_session'))
    g.identity = None
    if not value or value.get('type') != 'session' or not all(isinstance(value.get(k), str) for k in ('userId', 'email', 'displayName')):
        return None
    member = one('SELECT deleted_at FROM members WHERE user_id=?', (value['userId'],))
    if not member or member['deleted_at']:
        return None
    if value.get('authMethod') == 'password':
        version = scalar('SELECT session_version FROM auth_credentials WHERE user_id=?', (value['userId'],))
        if version is None or version != value.get('sessionVersion'):
            return None
    g.identity = {k: value.get(k) for k in ('userId', 'email', 'displayName', 'fullName', 'authMethod', 'authenticatedAt')}
    return g.identity


def member_profile(actor=None):
    actor = actor or identity()
    if not actor:
        return None
    result = one('SELECT ' + MEMBER_COLUMNS + ' FROM members WHERE user_id=? AND deleted_at IS NULL', (actor['userId'],))
    if result and actor.get('authMethod') == 'google' and actor['userId'].startswith('google:') and actor['email'].lower() == current_app.config.get('MASTER_EMAIL', '').lower():
        with transaction() as connection:
            changed = connection.execute("UPDATE members SET role='master',version=version+1,updated_at=? WHERE user_id=? AND role!='master'", (now(), actor['userId'])).rowcount
            if changed:
                connection.execute("INSERT INTO member_audit(operation_id,actor_id,target_id,action,old_role,new_role,reason,created_at) VALUES(?,?,?,'bootstrap_master',?,'master','소유자가 지정한 Google 인증 계정',?)", (secrets.token_hex(16), actor['userId'], actor['userId'], result['role'], now()))
        result = one('SELECT ' + MEMBER_COLUMNS + ' FROM members WHERE user_id=?', (actor['userId'],))
    return result


def complete(member):
    return bool(member) and all(member.get(k, '').strip() for k in ('businessName', 'businessSize', 'contactName', 'jobTitle', 'phone'))


def master(member):
    return bool(member) and member['role'] == 'master'


def can_write(member):
    return master(member) or bool(member and member['role'] in ('general', 'paid') and complete(member))


def require_member(paid=False, admin=False, write=False):
    actor = identity()
    if not actor:
        error('authentication-required', 401)
    member = member_profile(actor)
    if admin and not master(member):
        error('master-required', 403)
    if paid and (not member or member['role'] not in ('paid', 'master')):
        error('paid-member-required', 403)
    if write and not can_write(member):
        error('membership-required', 403)
    return actor, member
