"""Page-context adapter for the preserved React screens."""
from flask import Blueprint, jsonify, request
from .core import csrf, identity, master, member_profile, one, pagination, rows, scalar
from .accounts import google_ready
from .community import mask, rules
from .members import admin_data, paid_requests
from .resources import get_resource, listing

bp = Blueprint('pages', __name__)


def posts(kind, page, actor=None, member=None):
    where, args = 'kind=?', [kind]
    if kind == 'qna' and not master(member):
        where += ' AND user_id=?'
        args.append(actor['userId'] if actor else '')
    result, offset = pagination(scalar('SELECT count(*) FROM posts WHERE ' + where, args), page)
    result['items'] = rows('SELECT id,kind,user_id AS userId,author,title,body,created_at AS createdAt,answer,answered_at AS answeredAt,answered_by AS answeredBy FROM posts WHERE ' + where + ' ORDER BY id DESC LIMIT 10 OFFSET ?', args + [offset])
    return result


@bp.get('/api/page')
def page_context():
    from flask import current_app
    actor = identity()
    member = member_profile(actor)
    if actor:
        actor = dict(actor, role=member['role'] if member else 'preliminary')
    page = request.args.get('page', 1)
    path = request.args.get('path', '/')
    empty = dict(items=[], total=0, pages=1, current=1)
    entries = empty
    if path == '/guestbook':
        entries, offset = pagination(scalar('SELECT count(*) FROM guestbook'), page)
        entries['items'] = rows('SELECT id,author,body,created_at AS createdAt FROM guestbook ORDER BY id DESC LIMIT 10 OFFSET ?', (offset,))
    content = posts('community', page) if path == '/community' else posts('qna', page, actor, member) if path == '/qna' and member else empty
    selected = None
    if path == '/community':
        raw_id = request.args.get('post', '')
        selected = one("SELECT id,kind,user_id AS userId,author,title,body,created_at AS createdAt FROM posts WHERE kind='community' AND id=?", (raw_id if raw_id.isdigit() else 0,))
        filters = rules()
        for item in content['items'] + ([selected] if selected else []):
            for key in ('author', 'title', 'body'):
                item[key] = mask(item[key], filters)
    return jsonify(user=actor, member=member, entries=entries, posts=content, selected=selected,
                   googleReady=google_ready(), mapKey=current_app.config.get('NAVER_MAP_CLIENT_ID', ''), csrf=csrf(),
                   resources=listing(page, request.args.get('q', ''), request.args.get('category', '')) if path == '/resources/safety-forms' else empty,
                   resourceSelected=get_resource(request.args.get('post', '')) if path == '/resources/safety-forms' else None,
                   paidRequests=paid_requests(actor['userId']) if actor else [],
                   adminData=admin_data(page, request.args.get('q', ''), request.args.get('role', '')) if path == '/admin/members' and master(member) else None)


@bp.get('/api/health')
def health():
    checks = dict(connection=False, guestbook=False, community=False)
    try:
        scalar('SELECT 1')
        checks['connection'] = True
        rows('SELECT id,author,body,created_at FROM guestbook LIMIT 1')
        checks['guestbook'] = True
        rows("SELECT id,author,title,body,created_at FROM posts WHERE kind='community' LIMIT 1")
        checks['community'] = True
    except Exception:
        return jsonify(status='unavailable', runtime='python', checks=checks), 503
    return jsonify(status='ok', runtime='python', checks=checks)
