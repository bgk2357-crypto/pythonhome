"""Public board, comments, moderation filters and scoped content deletion."""
import re

from flask import Blueprint, jsonify, request
from .core import (can_write, csrf, db, error, field, form_input, go, guest_owner,
                   identity, json_input, master, member_profile, now, one, pagination,
                   require_member, rows, scalar, transaction)

bp = Blueprint('community', __name__)


def filter_valid(kind, expression):
    if not isinstance(expression, str) or not expression.strip() or len(expression) > 80 or re.search(r'[\x00-\x1f\x7f~]', expression):
        return False
    if kind == 'keyword':
        return True
    if kind != 'regex':
        return False
    # Only literals, simple classes, safe escapes and small bounded repeats.
    rest = re.sub(r'\[(?:\\[sdw\-\]\\.]|[^\]\\])+\]', 'a', expression)
    rest = re.sub(r'\\[sdw.\-_]', 'a', rest)
    rest = re.sub(r'\{[0-5](?:,[0-5])?\}', '', rest)
    if re.search(r'[()\[\]{}|*+?\\]', rest):
        return False
    try:
        return re.search(expression, '', re.I) is None
    except re.error:
        return False


def rules():
    return rows('SELECT id,kind,expression FROM content_filters ORDER BY id')


def mask(text, filters=None):
    for item in filters if filters is not None else rules():
        if filter_valid(item['kind'], item['expression']):
            pattern = re.escape(item['expression']) if item['kind'] == 'keyword' else item['expression']
            text = re.sub(pattern, lambda match: '*' * len(match[0]), text, flags=re.I)
    return text


def public(row, actor, filters, detail=False, is_master=False):
    own = bool(actor and row['user_id'] == actor['userId'])
    result = dict(id=row['id'], author=mask(row['author'], filters), body=mask(row['body'], filters),
                  createdAt=row['created_at'], updatedAt=row['updated_at'], version=row['version'],
                  isOwn=own, canDelete=own or is_master, commentCount=row.get('comment_count', 0))
    if 'title' in row:
        result['title'] = mask(row['title'], filters)
    if detail and own:
        result['editable'] = dict(title=row.get('title', ''), body=row['body'])
    return result


@bp.route('/api/community', methods=['GET', 'POST'])
def community_api():
    actor = identity()
    member, filters = member_profile(actor), rules()
    is_master = master(member)
    if request.method == 'GET':
        result, offset = pagination(scalar("SELECT count(*) FROM posts WHERE kind='community'"), request.args.get('page', 1))
        posts = rows("SELECT p.*,(SELECT count(*) FROM community_comments c WHERE c.post_id=p.id) AS comment_count FROM posts p WHERE kind='community' ORDER BY id DESC LIMIT 10 OFFSET ?", (offset,))
        post_id = request.args.get('post', '')
        selected = one("SELECT * FROM posts WHERE id=? AND kind='community'", (post_id if post_id.isdigit() else 0,))
        count = scalar('SELECT count(*) FROM community_comments WHERE post_id=?', (selected['id'] if selected else 0,))
        comments, co = pagination(count, request.args.get('commentPage', 1))
        result.update(items=[public(row, actor, filters, is_master=is_master) for row in posts],
                      selected=public(selected, actor, filters, True, is_master) if selected else None,
                      comments=[public(row, actor, filters, True, is_master) for row in rows('SELECT * FROM community_comments WHERE post_id=? ORDER BY id LIMIT 10 OFFSET ?', (selected['id'] if selected else 0, co))],
                      commentTotal=count, commentPages=comments['pages'], commentCurrent=comments['current'],
                      csrf=csrf(), canWrite=can_write(member), authenticated=bool(actor), isMaster=is_master)
        if is_master:
            result['rules'] = filters
        return jsonify(result)
    body = json_input()
    if not actor:
        error('authentication', 401)
    action = body.get('action', '')
    stamp = now()
    if action in ('rule-add', 'rule-delete'):
        if not is_master:
            error('permission', 403)
        with transaction() as connection:
            if action == 'rule-add':
                expression, kind = body.get('expression'), body.get('kind')
                if not filter_valid(kind, expression) or scalar('SELECT count(*) FROM content_filters') >= 200 or scalar('SELECT 1 FROM content_filters WHERE expression=?', (expression,)):
                    error('invalid')
                connection.execute('INSERT INTO content_filters(kind,expression,created_at,created_by) VALUES(?,?,?,?)', (kind, expression, stamp, actor['userId']))
            else:
                if type(body.get('id')) is not int:
                    error('invalid')
                expression = scalar('SELECT expression FROM content_filters WHERE id=?', (body['id'],))
                if not expression:
                    error('not-found', 404)
                connection.execute('DELETE FROM content_filters WHERE id=?', (body['id'],))
            connection.execute('INSERT INTO moderation_audit(actor_id,action,expression,created_at) VALUES(?,?,?,?)', (actor['userId'], action, expression, stamp))
        return jsonify(ok=True)
    comment = action.startswith('comment-') if isinstance(action, str) else False
    table, guard = ('community_comments', '') if comment else ('posts', " AND kind='community'")
    if action in ('create', 'comment-create', 'update', 'comment-update'):
        text, title = field(body, 'body', 1000 if comment else 2000), '' if comment else field(body, 'title', 100)
        if text is None or title is None:
            error('invalid')
    if action in ('create', 'comment-create'):
        if not can_write(member):
            error('permission', 403)
        with transaction() as connection:
            if comment:
                post_id = body.get('postId')
                if type(post_id) is not int:
                    error('invalid')
                cursor = connection.execute("INSERT INTO community_comments(post_id,user_id,author,body,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM posts WHERE id=? AND kind='community') AND (SELECT count(*) FROM community_comments WHERE post_id=?)<1000", (post_id, actor['userId'], member['displayName'], text, stamp, post_id, post_id))
            else:
                cursor = connection.execute("INSERT INTO posts(kind,user_id,author,title,body,created_at) SELECT 'community',?,?,?,?,? WHERE (SELECT count(*) FROM posts WHERE kind='community')<10000", (actor['userId'], member['displayName'], title, text, stamp))
            if not cursor.rowcount:
                error('invalid')
            new_id = cursor.lastrowid
        return jsonify(ok=True, id=new_id)
    row_id, version = body.get('id'), body.get('version')
    if action not in ('update', 'delete', 'comment-update', 'comment-delete') or type(row_id) is not int or type(version) is not int:
        error('invalid')
    if action.endswith('delete'):
        args = [row_id, version] + ([] if is_master else [actor['userId']])
        changed = db().execute('DELETE FROM ' + table + ' WHERE id=? AND version=?' + ('' if is_master else ' AND user_id=?') + guard, args).rowcount
    else:
        args = ([] if comment else [title]) + [text, stamp, row_id, actor['userId'], version]
        changed = db().execute('UPDATE ' + table + ' SET ' + ('' if comment else 'title=?,') + 'body=?,updated_at=?,version=version+1 WHERE id=? AND user_id=? AND version=?' + guard, args).rowcount
    if not changed:
        error('invalid-or-stale', 409)
    return jsonify(ok=True)


@bp.route('/api/content', methods=['GET', 'POST'])
def content_api():
    body = json_input() if request.method == 'POST' else request.args
    kind, row_id = body.get('kind'), body.get('id')
    if kind not in ('guestbook', 'qna', 'community', 'resource') or not isinstance(row_id, (str, int)):
        error('invalid')
    table = {'guestbook': 'guestbook', 'resource': 'safety_posts'}.get(kind, 'posts')
    guard = ' AND kind=?' if kind in ('qna', 'community') else ''
    args = [row_id] + ([kind] if guard else [])
    row = one('SELECT * FROM ' + table + ' WHERE id=?' + guard, args)
    actor = identity()
    own = bool(row and ((actor and row.get('user_id') == actor['userId']) or (kind == 'guestbook' and row.get('owner_hash') and row['owner_hash'] == guest_owner())))
    allowed = bool(row and (own or master(member_profile(actor))))
    if request.method == 'GET':
        return jsonify(canDelete=allowed, csrf=csrf())
    if not allowed:
        error('permission', 403)
    db().execute('DELETE FROM ' + table + ' WHERE id=?' + guard, args)
    return jsonify(ok=True)


@bp.post('/actions/guestbook')
@bp.post('/actions/community')
@bp.post('/actions/qna')
def board_action():
    kind = request.path.rsplit('/', 1)[1]
    form = form_input()
    actor = identity()
    stamp = now()
    if kind == 'guestbook':
        author, body = field(form, 'author', 30), field(form, 'body', 500)
        if author is None or body is None:
            go('/guestbook?error=invalid')
        changed = db().execute('INSERT INTO guestbook(author,body,created_at,user_id,owner_hash) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM guestbook)<2000', (author, body, stamp, actor['userId'] if actor else None, guest_owner())).rowcount
    else:
        actor, member = require_member(write=True)
        title, body = field(form, 'title', 100), field(form, 'body', 2000)
        if title is None or body is None:
            go('/' + kind + '?error=invalid')
        if kind == 'qna':
            query = 'INSERT INTO posts(kind,user_id,author,title,body,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM posts WHERE user_id=?)<1000'
            args = (kind, actor['userId'], member['displayName'], title, body, stamp, actor['userId'])
        else:
            query = "INSERT INTO posts(kind,user_id,author,title,body,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM posts WHERE kind='community')<10000"
            args = (kind, actor['userId'], member['displayName'], title, body, stamp)
        changed = db().execute(query, args).rowcount
    go('/' + kind + ('?saved=1' if changed else '?error=capacity'))
