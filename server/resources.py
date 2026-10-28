"""Public resource posts and bounded, validated attachment storage."""
import base64
import io
import re
import secrets
from pathlib import PurePosixPath

from flask import Blueprint, jsonify, redirect, request, send_file
from .core import (db, error, field, form_input, go, now, one, pagination,
                   require_member, rows, scalar, transaction)

bp = Blueprint('resources', __name__)
CATEGORIES = ('가이드', '서식', '교육자료', '사례', '기타')
FILE_LIMIT = 5 * 1024 * 1024


def filename(name):
    if not isinstance(name, str):
        return ''
    return re.sub(r'[\x00-\x1f\x7f<>:"|?*]', '_', name.replace('\\', '/').rsplit('/', 1)[-1])[:150]


def file_valid(name, data):
    if not 1 <= len(data) <= FILE_LIMIT:
        return False
    extension = PurePosixPath(name).suffix.lower().lstrip('.')
    magic = dict(pdf=b'%PDF-', png=b'\x89PNG\r\n\x1a\n', jpg=b'\xff\xd8\xff', jpeg=b'\xff\xd8\xff', hwp=b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1')
    if extension in magic:
        return data.startswith(magic[extension])
    if extension in ('hwpx', 'docx', 'xlsx', 'pptx', 'zip'):
        return data.startswith(b'PK\x03\x04')
    if extension not in ('txt', 'csv') or b'\x00' in data:
        return False
    try:
        data.decode('utf-8')
        return True
    except UnicodeError:
        return False


def files(post_id):
    return rows('SELECT id,name,size FROM safety_files WHERE post_id=? ORDER BY id', (post_id,))


def listing(page, search='', category=''):
    where, args = 'published=1', []
    if search.strip():
        where += ' AND (instr(lower(title),lower(?))>0 OR instr(lower(body),lower(?))>0)'
        args += [search.strip()[:100]] * 2
    if category in CATEGORIES:
        where += ' AND category=?'
        args.append(category)
    result, offset = pagination(scalar('SELECT count(*) FROM safety_posts WHERE ' + where, args), page)
    result['items'] = rows('SELECT id,author,category,title,body,created_at AS createdAt FROM safety_posts WHERE ' + where + ' ORDER BY created_at DESC,id DESC LIMIT 10 OFFSET ?', args + [offset])
    for item in result['items']:
        item['files'] = files(item['id'])
    return result


def get_resource(post_id):
    if not isinstance(post_id, str) or not re.fullmatch('[-a-zA-Z0-9]{1,80}', post_id):
        return None
    post = one('SELECT id,author,category,title,body,created_at AS createdAt FROM safety_posts WHERE id=? AND published=1', (post_id,))
    if post:
        post['files'] = files(post_id)
    return post


def read_chunks(table, key, row_id, size):
    if not 1 <= size <= FILE_LIMIT:
        error('file-unavailable', 500)
    data = bytearray()
    for index, row in enumerate(rows('SELECT part,data FROM ' + table + ' WHERE ' + key + '=? ORDER BY part', (row_id,))):
        try:
            chunk = base64.b64decode(row['data'], validate=True)
        except (ValueError, TypeError):
            error('file-unavailable', 500)
        if row['part'] != index or len(data) + len(chunk) > FILE_LIMIT:
            error('file-unavailable', 500)
        data.extend(chunk)
    if len(data) != size:
        error('file-unavailable', 500)
    return bytes(data)


def write_chunks(connection, table, key, row_id, data):
    connection.execute('DELETE FROM ' + table + ' WHERE ' + key + '=?', (row_id,))
    connection.executemany('INSERT INTO ' + table + '(' + key + ',part,data) VALUES(?,?,?)',
                          ((row_id, index // 32768, base64.b64encode(data[index:index + 32768]).decode()) for index in range(0, len(data), 32768)))


@bp.post('/actions/safety-resources')
def upload():
    actor, member = require_member(write=True)
    form = form_input(16 * 1024 * 1024, multipart=True)
    title, body, category = field(form, 'title', 100), field(form, 'body', 20000), field(form, 'category', 20)
    failed = '/resources/safety-forms?write=1&error='
    if title is None or body is None or category not in CATEGORIES or form.get('consent') != 'public':
        go(failed + 'invalid#resource-write')
    uploads = request.files.getlist('files') + request.files.getlist('files[]')
    if len(uploads) > 3:
        go(failed + 'file#resource-write')
    checked = []
    for file in uploads:
        if not file.filename:
            continue
        name, data = filename(file.filename), file.stream.read(FILE_LIMIT + 1)
        if not name or not file_valid(name, data):
            go(failed + 'file#resource-write')
        checked.append((name, data))
    post_id = secrets.token_hex(16)
    with transaction() as connection:
        if scalar('SELECT count(*) FROM safety_posts') >= 10000 or scalar('SELECT count(*) FROM safety_posts WHERE user_id=?', (actor['userId'],)) >= 1000:
            go(failed + 'capacity')
        connection.execute('INSERT INTO safety_posts(id,user_id,author,category,title,body,created_at,published) VALUES(?,?,?,?,?,?,?,0)', (post_id, actor['userId'], member['displayName'], category, title, body.replace('\r\n', '\n').replace('\r', '\n'), now()))
        for name, data in checked:
            file_id = secrets.token_hex(16)
            connection.execute('INSERT INTO safety_files(id,post_id,name,size) VALUES(?,?,?,?)', (file_id, post_id, name, len(data)))
            write_chunks(connection, 'safety_file_chunks', 'file_id', file_id, data)
        connection.execute('UPDATE safety_posts SET published=1 WHERE id=?', (post_id,))
    go('/resources/safety-forms?post=' + post_id + '&saved=1')


@bp.get('/api/safety-files')
def download():
    file_id = request.args.get('file', '')
    if not re.fullmatch('[-a-zA-Z0-9]{1,80}', file_id):
        error('not-found', 404)
    file = one('SELECT f.* FROM safety_files f JOIN safety_posts p ON p.id=f.post_id WHERE f.id=? AND p.published=1', (file_id,))
    if not file:
        error('not-found', 404)
    if file['static_path']:
        if file['static_path'] not in ('/safety/guide.pdf', '/safety/seven-elements.png', '/safety/seven-checklist.png'):
            error('not-found', 404)
        return redirect(file['static_path'], code=302)
    data = read_chunks('safety_file_chunks', 'file_id', file_id, file['size'])
    return send_file(io.BytesIO(data), mimetype='application/octet-stream', as_attachment=True, download_name=filename(file['name']), max_age=0)
