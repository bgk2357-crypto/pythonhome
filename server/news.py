"""Bounded news collection with cached fallback when external access is restricted."""
import html
import json
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

from flask import Blueprint, jsonify, request
from .core import db, error, now, one, transaction

bp = Blueprint('news', __name__)
TOPICS = {'안전': r'안전|재해|산재|추락|끼임|붕괴|폭발|사고', '보건': r'보건|위생|직업병|건강|중독|질식|작업환경|근골격|유해|납\s',
          '사망사고': r'사망|숨져|숨진|중대재해|중대산업', '화학물질': r'화학|누출|유출|가스|유해물질|유해인자|중독|MSDS|물질안전',
          '화재': r'화재|불길|불이\s?나|산불|소방|폭발'}


def plain(text):
    text = re.sub(r'<!\[CDATA\[([\s\S]*?)\]\]>', r'\1', str(text))
    text = re.sub(r'<script\b[^>]*>[\s\S]*?</script>', '', text, flags=re.I)
    return re.sub(r'\s+', ' ', html.unescape(re.sub('<[^>]*>', '', text))).strip()


def date(value):
    text = plain(value)
    if not text:
        return None
    try:
        if re.fullmatch(r'\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?', text):
            parts = re.split(r'[.\-/ T:]', text)
            dt = datetime(*map(int, parts), tzinfo=timezone(timedelta(hours=9)))
        else:
            try:
                dt = datetime.fromisoformat(text.replace('Z', '+00:00'))
            except ValueError:
                dt = parsedate_to_datetime(text)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    except (ValueError, TypeError, OverflowError):
        return None


def timestamp(value):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    except (ValueError, TypeError, AttributeError):
        return 0


def article(title, link, published, source, publisher=''):
    title = plain(title)[:400]
    name = plain(publisher or source.get('institution') or source['name'])[:100]
    if source['kind'] == 'general' and title.endswith(' - ' + name):
        title = title[:-len(' - ' + name)].strip()
    link = plain(link)
    if not link or re.search(r'[\x00-\x20\x7f\\]', link):
        return None
    parsed = urlsplit(urljoin(source['url'], link))
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or (source['kind'] == 'trends' and parsed.hostname.lower() != urlsplit(source['url']).hostname.lower()):
        return None
    query = urlencode([(key, value) for key, value in parse_qsl(parsed.query) if not re.match(r'utm_|fbclid|gclid', key, re.I)])
    url = urlunsplit((parsed.scheme, parsed.netloc.lower(), parsed.path or '/', query, ''))
    topics = [topic for topic, pattern in TOPICS.items() if re.search(pattern, title)]
    if not title or (not topics and (source['id'] != 'kiha-notice' or re.search('구인구직|채용|연회비|평의원|선거|회비', title))):
        return None
    return dict(title=title, url=url, publisher=name, sourceId=source['id'], publishedAt=date(published), topics=topics)


def tag(block, name):
    match = re.search(r'<' + re.escape(name) + r'(?:\s[^>]*)?>([\s\S]*?)</' + re.escape(name) + '>', block, re.I)
    return match[1] if match else ''


def parse(body, source):
    items = []
    if source['format'] == 'kosha':
        value = json.loads(body)
        if value.get('result') != 'success' or not isinstance(value.get('payload'), list):
            raise ValueError('Invalid KOSHA response')
        for row in value['payload']:
            items.append(article(row.get('pstNm', ''), row.get('contentsLinkUrl', ''), row.get('wrtDt', ''), source))
    elif source['format'] == 'board':
        matched = 0
        for row in re.findall(r'<tr\b[^>]*>[\s\S]*?</tr>', body, re.I):
            published = next((plain(cell) for cell in re.findall(r'<td\b[^>]*>([\s\S]*?)</td>', row, re.I) if re.fullmatch(r'20\d{2}[.\-/]\d{1,2}[.\-/]\d{1,2}', plain(cell))), '')
            for link, title in re.findall(r'''<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)</a>''', row, re.I):
                pattern = r'community_view\.htm\?.*\buid=' if source['id'] == 'kiha-notice' else r'enewsView\.do\?.*\bnews_seq='
                if re.search(pattern, link):
                    matched += 1
                    items.append(article(title, link, published, source))
        if not matched:
            raise ValueError('Board layout changed')
    else:
        if not re.search(r'<(?:rss|feed)\b', body, re.I) or re.search('<!DOCTYPE', body, re.I):
            raise ValueError('Invalid RSS')
        for block in re.findall(r'<item\b[^>]*>([\s\S]*?)</item>', body, re.I):
            items.append(article(tag(block, 'title'), tag(block, 'link'), tag(block, 'pubDate') or tag(block, 'dc:date'), source, tag(block, 'source')))
    return [item for item in items if item]


def deduplicate(items):
    urls, titles, result = set(), set(), []
    for item in sorted(items, key=lambda row: timestamp(row['publishedAt']), reverse=True):
        key = item['publisher'] + ':' + re.sub(r'[\W_]', '', item['title']).lower()
        if item['url'] not in urls and key not in titles:
            urls.add(item['url'])
            titles.add(key)
            result.append(item)
    return result


class HTTPSRedirect(urllib.request.HTTPRedirectHandler):
    max_redirections = 3

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlsplit(newurl).scheme != 'https':
            raise ValueError('HTTPS required')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_source(source):
    # Only versioned, fixed source URLs; never accept a request-supplied URL.
    try:
        headers = {'Accept': 'application/rss+xml, application/xml, text/html, application/json', 'User-Agent': 'ArgoHealthLab/1.0'}
        post = source.get('method') == 'POST'
        if post:
            headers.update({'Content-Type': 'application/json', 'chnlId': 'portal24'})
        req = urllib.request.Request(source['url'], data=b'{}' if post else None, headers=headers)
        with urllib.request.build_opener(HTTPSRedirect()).open(req, timeout=12) as response:
            raw = response.read(1500001)
            if len(raw) > 1500000:
                raise ValueError('Too large')
            encoding = response.headers.get_content_charset()
            if not encoding:
                match = re.search(rb'''charset=["']?([\w-]+)''', raw[:1500], re.I)
                encoding = match[1].decode('ascii') if match else 'utf-8'
            return raw.decode(encoding, errors='replace')
    except Exception:
        return None


def snapshot(source, previous, body, stamp):
    try:
        if body is None:
            raise ValueError('Source unavailable')
        oldest = time.time() - (30 if source['kind'] == 'general' else 180) * 86400
        items = [item for item in deduplicate(parse(body, source)) if not item['publishedAt'] or oldest <= timestamp(item['publishedAt']) <= time.time() + 86400][:100]
        return dict(items=items, fetchedAt=stamp, checkedAt=stamp, failed=False)
    except Exception:
        usable = previous and previous['fetchedAt'] and time.time() - timestamp(previous['fetchedAt']) < 7 * 86400
        return dict(items=previous['items'] if usable else [], fetchedAt=previous['fetchedAt'] if usable else None, checkedAt=stamp, failed=True)


@bp.get('/api/news')
def news_api():
    kind = request.args.get('kind')
    if kind not in ('general', 'trends'):
        error('invalid-kind')
    sources = [source for source in json.loads(Path(__file__).with_name('news-sources.json').read_text(encoding='utf-8')) if source['kind'] == kind]
    snapshots, refresh, stamp = {}, [], now()
    for source in sources:
        row = one('SELECT * FROM news_feed_cache WHERE source_id=?', (source['id'],))
        previous = dict(items=json.loads(row['items_json']), fetchedAt=row['fetched_at'], checkedAt=row['checked_at'], failed=bool(row['failed'])) if row else None
        snapshots[source['id']] = previous
        if not previous or time.time() - timestamp(previous['checkedAt']) >= (300 if previous['failed'] else 1800):
            refresh.append(source)
    if refresh:
        with ThreadPoolExecutor(max_workers=4) as executor:
            bodies = list(executor.map(fetch_source, refresh))
        with transaction() as connection:
            for source, body in zip(refresh, bodies):
                value = snapshot(source, snapshots[source['id']], body, stamp)
                snapshots[source['id']] = value
                connection.execute('INSERT OR REPLACE INTO news_feed_cache(source_id,items_json,fetched_at,checked_at,failed) VALUES(?,?,?,?,?)', (source['id'], json.dumps(value['items'], ensure_ascii=False), value['fetchedAt'], value['checkedAt'], int(value['failed'])))
    articles, statuses = [], []
    for source in sources:
        value = snapshots[source['id']]
        articles.extend(value['items'])
        statuses.append(dict(id=source['id'], name=source['name'], homepage=source['homepage'], count=len(value['items']), fetchedAt=value['fetchedAt'], checkedAt=value['checkedAt'], status='stale' if value['failed'] and value['fetchedAt'] else 'unavailable' if value['failed'] else 'ok'))
    return jsonify(articles=deduplicate(articles)[:150], sources=statuses, generatedAt=stamp, refreshMinutes=30)
