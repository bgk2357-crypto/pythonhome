"""Profile completion, paid membership review, owner protection and Q&A answers."""
import re
import secrets

from flask import Blueprint, current_app, request
from .core import (MEMBER_COLUMNS, can_write, complete, db, error, field, form_input,
                   go, master, now, one, pagination, require_member, rows, scalar, transaction)

bp = Blueprint('members', __name__)


def paid_requests(uid):
    return rows('SELECT id,user_id AS userId,status,note,created_at AS createdAt,reviewed_at AS reviewedAt,review_note AS reviewNote,amount,payment_reference AS paymentReference FROM member_paid_requests WHERE user_id=? ORDER BY created_at DESC LIMIT 20', (uid,))


def admin_data(page, search='', role=''):
    where, args = 'deleted_at IS NULL', []
    if search.strip():
        where += ' AND (instr(lower(email),lower(?))>0 OR instr(lower(display_name),lower(?))>0 OR instr(lower(business_name),lower(?))>0)'
        args += [search.strip()[:100]] * 3
    if role in ('preliminary', 'general', 'paid', 'master'):
        where += ' AND role=?'
        args.append(role)
    result, offset = pagination(scalar('SELECT count(*) FROM members WHERE ' + where, args), page, 20)
    result['members'] = rows('SELECT ' + MEMBER_COLUMNS + ' FROM members WHERE ' + where + ' ORDER BY created_at DESC,user_id LIMIT 20 OFFSET ?', args + [offset])
    result['requests'] = rows("SELECT r.id,r.user_id AS userId,r.status,r.note,r.created_at AS createdAt,r.reviewed_at AS reviewedAt,r.review_note AS reviewNote,r.amount,r.payment_reference AS paymentReference,m.display_name AS author,m.email,m.business_name AS businessName,m.version FROM member_paid_requests r JOIN members m ON m.user_id=r.user_id WHERE r.status='pending' AND m.deleted_at IS NULL ORDER BY r.created_at LIMIT 100")
    result['audit'] = rows('SELECT id,actor_id AS actorId,target_id AS targetId,action,old_role AS oldRole,new_role AS newRole,reason,created_at AS createdAt FROM member_audit ORDER BY id DESC LIMIT 50')
    return result


@bp.post('/actions/<action>')
def member_action(action):
    supported = ('join', 'member-profile', 'paid-request', 'paid-cancel', 'admin-grade', 'admin-paid-review', 'qna-answer')
    if action not in supported:
        # Board/resource actions have their own explicit Flask routes.
        error('not-found', 404)
    admin = action.startswith('admin-') or action == 'qna-answer'
    actor, member = require_member(admin=admin)
    form = form_input()
    path = '/admin/members' if admin else '/members'
    stamp, uid = now(), actor['userId']
    if action in ('join', 'member-profile'):
        fields = [('displayName', 30), ('businessName', 120), ('businessSize', 30), ('contactName', 60), ('jobTitle', 80), ('phone', 30)]
        values = [field(form, key, limit) for key, limit in fields]
        if any(v is None or re.search('[\x00-\x1f\x7f]', v) for v in values) or form.get('consent') != 'yes':
            go(path + '?error=invalid')
        name, business, size, contact, title, phone = values
        if size not in ('5인 미만', '5~19인', '20~49인', '50~99인', '100~299인', '300인 이상') or not re.fullmatch(r'\+?[0-9 ()-]+', phone) or not 7 <= len(re.sub(r'\D', '', phone)) <= 15:
            go(path + '?error=invalid')
        db().execute("UPDATE members SET display_name=?,business_name=?,business_size=?,contact_name=?,job_title=?,phone=?,profile_completed_at=COALESCE(profile_completed_at,?),updated_at=?,role=CASE WHEN role IN ('paid','master') THEN role ELSE 'general' END,version=version+1 WHERE user_id=?", (name, business, size, contact, title, phone, stamp, stamp, uid))
        go('/members?saved=profile')
    if action == 'paid-request':
        if not can_write(member) or member['role'] != 'general':
            error('general-member-required', 403)
        note = field(form, 'note', 500)
        if not note or form.get('consent') != 'yes':
            go(path + '?error=invalid')
        with transaction() as connection:
            connection.execute("INSERT INTO member_paid_requests(id,user_id,note,created_at) SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM member_paid_requests WHERE user_id=? AND status='pending')", (secrets.token_hex(16), uid, note, stamp, uid))
        go('/members?saved=request')
    if action == 'paid-cancel':
        request_id = field(form, 'requestId', 80)
        if not request_id:
            go(path + '?error=invalid')
        db().execute("UPDATE member_paid_requests SET status='cancelled',reviewed_at=? WHERE id=? AND user_id=? AND status='pending'", (stamp, request_id, uid))
        go('/members?saved=cancelled')
    if action == 'qna-answer':
        post_id, answer = field(form, 'postId', 20), field(form, 'answer', 10000)
        if not post_id or not post_id.isdigit() or not answer:
            go('/qna?error=invalid')
        changed = db().execute("UPDATE posts SET answer=?,answered_at=?,answered_by=? WHERE id=? AND kind='qna'", (answer, stamp, uid, post_id)).rowcount
        go('/qna?' + ('saved=1' if changed else 'error=invalid'))
    target_id, version, reason = field(form, 'userId', 300), field(form, 'version', 20), field(form, 'reason', 500)
    if not target_id or version is None or not version.isdigit() or not reason:
        go(path + '?error=invalid')
    with transaction() as connection:
        target = one('SELECT ' + MEMBER_COLUMNS + ' FROM members WHERE user_id=? AND deleted_at IS NULL', (target_id,))
        if not target:
            go(path + '?error=invalid')
        if target['email'].lower() == current_app.config.get('MASTER_EMAIL', '').lower():
            go(path + '?error=owner')
        next_role, decision, request_id = form.get('role'), form.get('decision'), form.get('requestId')
        if action == 'admin-paid-review':
            pending = one("SELECT id FROM member_paid_requests WHERE id=? AND user_id=? AND status='pending'", (request_id, target_id))
            if not pending or decision not in ('approve', 'reject'):
                go(path + '?error=stale')
            next_role = 'paid' if decision == 'approve' else target['role']
        if target['version'] != int(version):
            go(path + '?error=stale')
        if next_role not in ('preliminary', 'general', 'paid', 'master'):
            go(path + '?error=invalid')
        if next_role in ('general', 'paid') and not complete(target):
            go(path + '?error=profile')
        if next_role == 'master' and form.get('confirmMaster') != 'yes':
            go(path + '?error=confirm')
        if target['role'] == 'master' and next_role != 'master' and scalar("SELECT count(*) FROM members WHERE role='master' AND deleted_at IS NULL") < 2:
            go(path + '?error=owner')
        approving = next_role == 'paid' and (action == 'admin-grade' or decision == 'approve')
        amount, reference = form.get('amount', ''), field(form, 'paymentReference', 200)
        if approving and (form.get('paymentConfirmed') != 'yes' or not amount.isdigit() or not 1 <= int(amount) <= 1000000000 or not reference):
            go(path + '?error=payment')
        connection.execute('UPDATE members SET role=?,updated_at=?,version=version+1 WHERE user_id=?', (next_role, stamp, target_id))
        what = 'grade_change' if action == 'admin-grade' else 'paid_approved' if decision == 'approve' else 'paid_rejected'
        note = reason + (' | 결제확인 ' + amount + '원 | ' + reference if approving else '')
        connection.execute('INSERT INTO member_audit(operation_id,actor_id,target_id,action,old_role,new_role,reason,created_at) VALUES(?,?,?,?,?,?,?,?)', (secrets.token_hex(16), uid, target_id, what, target['role'], next_role, note, stamp))
        if action == 'admin-paid-review':
            connection.execute("UPDATE member_paid_requests SET status=?,reviewed_at=?,reviewed_by=?,review_note=?,amount=?,payment_reference=? WHERE id=? AND status='pending'", ('approved' if decision == 'approve' else 'rejected', stamp, uid, reason, int(amount) if approving else 0, reference if approving else '', request_id))
    go(path + '?saved=1')
