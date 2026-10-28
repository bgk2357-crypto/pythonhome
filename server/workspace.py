"""Account-scoped MSDS assets, originals, classification and publication history."""
import base64
import io
import json
import re
import secrets

from flask import Blueprint, jsonify, request, send_file
from .core import csrf, db, error, json_input, now, one, require_member, rows, scalar, transaction
from .resources import FILE_LIMIT, file_valid, filename, read_chunks, write_chunks

bp = Blueprint('workspace', __name__)
ID_PATTERN = r'[-a-zA-Z0-9]{1,80}'
FIELDS = 'fileName,importedAt,product,supplier,address,phone,workplace,department,cas,ingredients,signal,hazards,precautions,firstAid,fire,spill,handling,protection,text,emergencyPhone,recommendedUse,restrictions,classification,category,groupName,msdsNumber,hCodes,regulationNotes,specialNotes,managementNotes,processName,postingLocation,categoryId,taskName,matrixProduct'.split(',')
DEFAULT_SETTINGS = dict(businessName='', notice='', categories=[], hierarchy=[], version=0, department='', processName='', postingLocation='')


def valid_id(value):
    return isinstance(value, str) and re.fullmatch(ID_PATTERN, value) is not None


def hierarchy(value):
    if value is None:
        return []
    if not isinstance(value, list) or len(value) > 200:
        return None
    nodes, seen = [], set()
    for node in value:
        if not isinstance(node, dict) or not valid_id(node.get('id')) or node['id'] in seen or not isinstance(node.get('parentId'), str) or not isinstance(node.get('name'), str) or not node['name'].strip() or len(node['name']) > 80 or type(node.get('level')) is not int or not 1 <= node['level'] <= 200 or not isinstance(node.get('workDetails', ''), str) or len(node.get('workDetails', '')) > 2000:
            return None
        seen.add(node['id'])
        clean = {k: node[k] for k in ('id', 'parentId', 'name', 'level')}
        clean['name'] = clean['name'].strip()
        if node.get('workDetails'):
            clean['workDetails'] = node['workDetails']
        nodes.append(clean)
    index, sibling_names = {node['id']: node for node in nodes}, set()
    for node in nodes:
        parent = index.get(node['parentId'])
        if (node['level'] == 1 and node['parentId']) or (node['level'] > 1 and (not parent or parent['level'] != node['level'] - 1)):
            return None
        key = (node['parentId'], node['name'])
        if key in sibling_names:
            return None
        sibling_names.add(key)
    return nodes


def assignment(nodes, node_id):
    chain, current = [], node_id
    index = {node['id']: node for node in nodes}
    for _ in range(200):
        node = index.get(current)
        if not node:
            break
        chain.insert(0, node)
        current = node['parentId']
    return dict(categoryId=node_id, category=' / '.join(node['name'] for node in chain),
                department=chain[0]['name'] if chain else '', processName=chain[1]['name'] if len(chain) > 1 else '',
                taskName=' / '.join(node['name'] for node in chain[2:]))


def clean_asset(value):
    if not isinstance(value, dict) or not valid_id(value.get('id')):
        return None
    result = dict(id=value['id'])
    for key in FIELDS:
        limit = 100000 if key == 'text' else 20000 if key in ('category', 'taskName') else 120 if key == 'groupName' else 10000
        item = value.get(key, '')
        if not isinstance(item, str) or len(item) > limit:
            return None
        result[key] = item
    pictograms = value.get('pictograms', [])
    result['pictograms'] = list(dict.fromkeys(code for code in pictograms if isinstance(code, str) and re.fullmatch('GHS0[1-9]', code))) if isinstance(pictograms, list) else []
    result.update(reviewed=value.get('reviewed') is True, published=value.get('reviewed') is True and value.get('published') is True,
                  kind='measurement' if value.get('kind') == 'measurement' else 'msds')
    if result['kind'] == 'measurement':
        result['published'] = False
    if 'managementEntries' in value:
        entries = value['managementEntries']
        if not isinstance(entries, list) or len(entries) > 100:
            return None
        clean, seen = [], set()
        for entry in entries:
            if not isinstance(entry, dict) or not valid_id(entry.get('id')) or entry['id'] in seen:
                return None
            seen.add(entry['id'])
            item = dict(id=entry['id'])
            for key, limit in dict(categoryId=80, department=200, processName=200, taskName=20000, workDetails=2000, notes=10000, updatedAt=80).items():
                text = entry.get(key, '')
                if not isinstance(text, str) or len(text) > limit:
                    return None
                item[key] = text
            clean.append(item)
        result['managementEntries'] = clean
    for key, limit, keys in (('components', 100, 'id,name,cas,concentration,basis,specialCondition,notes'),
                             ('measurementRows', 300, 'id,date,department,process,location,substance,cas,result,unit,limit,limitUnit,period,limitPeriod,notes')):
        items = value.get(key, [])
        if not isinstance(items, list) or len(items) > limit:
            return None
        clean = []
        for row in items:
            if not isinstance(row, dict):
                return None
            item = {}
            for name in keys.split(','):
                text = row.get(name, '')
                if not isinstance(text, str) or len(text) > (1000 if name == 'notes' else 200):
                    return None
                item[name] = text
            clean.append(item)
        result[key] = clean
    return result


def event(connection, uid, previous, next_item):
    value = next_item or previous or {}
    if value.get('kind') == 'measurement':
        return
    action = 'delete' if next_item is None else 'publish' if next_item.get('published') and not (previous or {}).get('published') else 'unpublish' if not next_item.get('published') and (previous or {}).get('published') else 'update' if next_item.get('published') else None
    if not action:
        return
    payload = dict(assetId=value['id'], action=action, product=value.get('product') or value.get('fileName', ''),
                   department=value.get('department') or value.get('category', ''), processName=value.get('processName', ''), postingLocation=value.get('postingLocation', ''))
    connection.execute('INSERT INTO msds_publication_events(id,user_id,asset_id,payload,created_at) VALUES(?,?,?,?,?)', (secrets.token_hex(16), uid, value['id'], json.dumps(payload, ensure_ascii=False), now()))


def saved_nodes(uid):
    row = one('SELECT payload FROM msds_workspace_settings WHERE user_id=?', (uid,))
    return hierarchy(json.loads(row['payload']).get('hierarchy')) or [] if row else []


@bp.route('/api/workspace', methods=['GET', 'POST'])
def workspace_api():
    actor, member = require_member(paid=True)
    uid = actor['userId']
    if request.method == 'GET':
        file_id = request.args.get('file')
        if file_id is not None:
            if not valid_id(file_id):
                error('invalid')
            row = one('SELECT * FROM msds_assets WHERE id=? AND user_id=?', (file_id, uid))
            if not row or not row['file_size']:
                error('not-found', 404)
            data = read_chunks('msds_original_chunks', 'asset_id', file_id, row['file_size'])
            pdf = row['file_name'].lower().endswith('.pdf')
            return send_file(io.BytesIO(data), mimetype='application/pdf' if pdf else 'application/octet-stream', as_attachment=not pdf, download_name=filename(row['file_name']), max_age=0)
        nodes = saved_nodes(uid)
        items = []
        for row in rows('SELECT * FROM msds_assets WHERE user_id=? ORDER BY updated_at DESC,id LIMIT 100', (uid,)):
            item = json.loads(row['payload'])
            item.update(version=row['version'], fileSize=row['file_size'], updatedAt=row['updated_at'])
            if item.get('categoryId'):
                item.update(assignment(nodes, item['categoryId']))
            items.append(item)
        history = [dict(json.loads(row['payload']), id=row['id'], createdAt=row['created_at']) for row in rows('SELECT id,payload,created_at FROM msds_publication_events WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 200', (uid,))]
        settings = one('SELECT payload,version FROM msds_workspace_settings WHERE user_id=?', (uid,))
        return jsonify(csrf=csrf(), items=items, history=history, settings=dict(DEFAULT_SETTINGS, **dict(json.loads(settings['payload']), version=settings['version'])) if settings else DEFAULT_SETTINGS)
    body = json_input(9 * 1024 * 1024, header_csrf=True)
    version, action = body.get('version'), body.get('action')
    if type(version) is not int or version < 0:
        error('invalid')
    if action == 'delete-history':
        if not valid_id(body.get('id')):
            error('invalid')
        changed = db().execute('DELETE FROM msds_publication_events WHERE id=? AND user_id=?', (body['id'], uid)).rowcount
        return jsonify(ok=True), 200 if changed else 404
    if action == 'settings':
        value = body.get('settings')
        if not isinstance(value, dict):
            error('invalid')
        name, notice, categories = value.get('businessName', ''), value.get('notice', ''), value.get('categories', [])
        if not isinstance(name, str) or len(name) > 120 or not isinstance(notice, str) or len(notice) > 3000 or not isinstance(categories, list) or len(categories) > 50 or any(not isinstance(cat, str) or not cat.strip() or len(cat) > 120 for cat in categories):
            error('invalid')
        nodes = hierarchy(value.get('hierarchy'))
        if nodes is None:
            error('invalid-hierarchy')
        payload = dict(businessName=name, notice=notice, categories=list(dict.fromkeys(categories)), hierarchy=nodes)
        for key in ('department', 'processName', 'postingLocation'):
            text = value.get(key, '')
            if not isinstance(text, str) or len(text) > 120:
                error('invalid')
            payload[key] = text
        with transaction() as connection:
            node_ids = {node['id'] for node in nodes}
            for row in rows('SELECT payload FROM msds_assets WHERE user_id=?', (uid,)):
                category = json.loads(row['payload']).get('categoryId')
                if category and category not in node_ids:
                    error('classification-in-use', 409)
            old = one('SELECT version FROM msds_workspace_settings WHERE user_id=?', (uid,))
            if (old['version'] if old else 0) != version:
                error('stale', 409)
            if old:
                connection.execute('UPDATE msds_workspace_settings SET payload=?,version=version+1 WHERE user_id=?', (json.dumps(payload, ensure_ascii=False), uid))
            else:
                connection.execute('INSERT INTO msds_workspace_settings(user_id,payload) VALUES(?,?)', (uid, json.dumps(payload, ensure_ascii=False)))
        return jsonify(ok=True, version=version + 1)
    item = clean_asset(body.get('item')) if action == 'save' else None
    asset_id = item['id'] if item else body.get('id')
    if action not in ('save', 'delete') or not valid_id(asset_id) or (action == 'save' and item is None):
        error('invalid')
    file = body.get('file')
    data, name = None, ''
    if file is not None:
        if not isinstance(file, dict) or not isinstance(file.get('name'), str) or not isinstance(file.get('data'), str):
            error('invalid-file')
        name = filename(file['name'])
        try:
            data = base64.b64decode(file['data'], validate=True)
        except ValueError:
            error('invalid-file')
        if not name or not file_valid(name, data):
            error('invalid-file')
    with transaction() as connection:
        old = one('SELECT * FROM msds_assets WHERE id=?', (asset_id,))
        if old and old['user_id'] != uid:
            error('not-found', 404)
        if (old['version'] if old else 0) != version or (not old and action == 'delete'):
            error('stale', 409)
        previous = json.loads(old['payload']) if old else None
        if action == 'delete':
            event(connection, uid, previous, None)
            connection.execute('DELETE FROM msds_assets WHERE id=? AND user_id=?', (asset_id, uid))
        else:
            if not old and scalar('SELECT count(*) FROM msds_assets WHERE user_id=?', (uid,)) >= 100:
                error('capacity', 409)
            if item.get('categoryId'):
                nodes = saved_nodes(uid)
                if item['categoryId'] not in {node['id'] for node in nodes}:
                    error('invalid-classification')
                item.update(assignment(nodes, item['categoryId']))
            name = name if data is not None else old['file_name'] if old else ''
            size = len(data) if data is not None else old['file_size'] if old else 0
            stamp, payload, operation = now(), json.dumps(item, ensure_ascii=False), secrets.token_hex(16)
            if old:
                connection.execute('UPDATE msds_assets SET payload=?,version=version+1,file_name=?,file_size=?,updated_at=?,last_op=? WHERE id=? AND user_id=?', (payload, name, size, stamp, operation, asset_id, uid))
            else:
                connection.execute('INSERT INTO msds_assets(id,user_id,payload,file_name,file_size,updated_at,last_op) VALUES(?,?,?,?,?,?,?)', (asset_id, uid, payload, name, size, stamp, operation))
            if data is not None:
                write_chunks(connection, 'msds_original_chunks', 'asset_id', asset_id, data)
            event(connection, uid, previous, item)
    return jsonify(ok=True) if action == 'delete' else jsonify(ok=True, version=version + 1, fileSize=size, updatedAt=stamp)
