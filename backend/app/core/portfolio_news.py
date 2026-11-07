"""Fresh portfolio news. Only public symbols leave the app, never account values.

Relevance is a transparent heuristic, not sentiment or a prediction. The source
provides headlines and short descriptions; full articles remain at the publisher.
"""
import html
import math
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit, urlencode
from urllib.request import Request, urlopen
from email.utils import parsedate_to_datetime
import xml.etree.ElementTree as ET

MAX_SYMBOLS = 20
MAX_STORIES = 20
MAX_AGE_DAYS = 7


def portfolio_weights(holdings):
    values = {}
    for row in holdings:
        symbol = (row.ticker or '').strip().upper()
        value = row.marketValue
        if not re.fullmatch(r'[A-Z0-9^][A-Z0-9.^=\-]{0,19}', symbol):
            continue
        if value is None or not math.isfinite(value) or abs(value) == 0:
            continue
        values[symbol] = values.get(symbol, 0) + abs(value)
    total = sum(values.values())
    return {symbol: value / total for symbol, value in sorted(values.items(), key=lambda pair: (-pair[1], pair[0]))} if total else {}


def clean_text(value, limit):
    text = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', str(value or '')))).strip()
    return text[:limit].rstrip()


def article_url(value):
    try:
        parsed = urlsplit(str(value or ''))
        if parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password:
            return None
        return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, ''))
    except ValueError:
        return None


def event_relevance(title):
    title = title.lower()
    if re.search(r'\b(earnings|guidance|profit warning|bankruptcy|fraud|recall|antitrust|acquisition|merger|lawsuit|sec charges|rate decision)\b', title):
        return 'Major event', 1.0
    if re.search(r'\b(dividend|buyback|forecast|revenue|launch|approval|upgrade|downgrade|inflation|interest rates|jobs report)\b', title):
        return 'Business update', .65
    return 'Company & market', .3


def normalize_article(raw, symbol, now):
    if not isinstance(raw, dict) or raw.get('ad'):
        return None
    item = raw.get('content') or raw
    if not isinstance(item, dict):
        return None
    title = clean_text(item.get('title'), 220)
    source = item.get('provider') or {}
    source = source.get('displayName') if isinstance(source, dict) else source
    source = clean_text(source or item.get('publisher'), 90)
    link = item.get('canonicalUrl') or item.get('clickThroughUrl') or item.get('link')
    link = link.get('url') if isinstance(link, dict) else link
    link = article_url(link)
    published = item.get('pubDate') or item.get('providerPublishTime')
    try:
        date = datetime.fromtimestamp(published, timezone.utc) if isinstance(published, (int, float)) else datetime.fromisoformat(str(published).replace('Z', '+00:00'))
        if date.tzinfo is None:
            return None
        date = date.astimezone(timezone.utc)
        age = (now - date).total_seconds() / 3600
        if age < -1 or age > MAX_AGE_DAYS * 24:
            return None
    except (ValueError, TypeError, OverflowError, OSError):
        return None
    if not title or not source or not link:
        return None
    # Keep only a short provider-supplied excerpt; never fetch full article text.
    summary = ' '.join(clean_text(item.get('summary') or item.get('description'), 260).split()[:40])
    category, importance = event_relevance(title)
    return dict(title=title, summary=summary, source=source, url=link, publishedAt=date.isoformat(), tickers=[symbol], category=category, _importance=importance, _age=max(0, age))


def rank_articles(batches, weights, now):
    stories, title_keys = {}, {}
    for symbol in weights:
        articles = batches.get(symbol, [])
        if symbol not in weights:
            continue
        for raw in articles if isinstance(articles, list) else []:
            story = normalize_article(raw, symbol, now)
            if not story:
                continue
            parsed = urlsplit(story['url'])
            url_key = parsed.netloc.lower() + parsed.path.rstrip('/')
            title_key = re.sub(r'\W+', '', story['title'].lower())
            key = title_keys.get(title_key, url_key)
            title_keys[title_key] = key
            if key in stories:
                stories[key]['tickers'] = sorted(set(stories[key]['tickers'] + [symbol]))
            else:
                stories[key] = story
    ranked = []
    for story in stories.values():
        weight = sum(weights[symbol] for symbol in story['tickers'])
        # Square root keeps major events at smaller positions competitive.
        score = .45 * math.sqrt(weight) + .35 * story['_importance'] + .2 * math.exp(-story['_age'] / 36)
        ranked.append({key:value for key,value in story.items() if not key.startswith('_')} | {'weight':weight, '_score':score})
    ranked.sort(key=lambda story:(-story['_score'], story['publishedAt'], story['title']))
    result, counts = [], {}
    for story in ranked:
        # Avoid one heavily weighted company occupying all four pages.
        if all(counts.get(symbol, 0) >= 4 for symbol in story['tickers']):
            continue
        for symbol in story['tickers']:
            counts[symbol] = counts.get(symbol, 0) + 1
        story.pop('_score')
        result.append(story)
        if len(result) == MAX_STORIES:
            break
    return result


def fetch_symbol_news(symbol):
    # The library news POST is not consistently available. Yahoo's public
    # per-symbol RSS feed is unauthenticated and has no process/browser cache.
    # Never fetch URLs supplied by articles or clients on the server.
    query = urlencode({'s':symbol, 'region':'US', 'lang':'en-US'})
    request = Request('https://feeds.finance.yahoo.com/rss/2.0/headline?' + query,
                      headers={'User-Agent':'WealthCompass/1.0', 'Accept':'application/rss+xml, application/xml', 'Cache-Control':'no-cache'})
    with urlopen(request, timeout=6) as response:
        payload = response.read(2000001)
    if len(payload) > 2000000 or b'<!DOCTYPE' in payload.upper() or b'<!ENTITY' in payload.upper():
        raise ValueError('Unexpected news feed payload')
    root = ET.fromstring(payload)
    if root.tag != 'rss':
        raise ValueError('Unexpected news feed format')
    articles = []
    for item in root.findall('./channel/item')[:20]:
        try:
            published = parsedate_to_datetime(item.findtext('pubDate') or '').isoformat()
        except (TypeError, ValueError, OverflowError):
            continue
        articles.append({'title':item.findtext('title'), 'description':item.findtext('description'),
                         'link':item.findtext('link'), 'pubDate':published,
                         'publisher':item.findtext('source') or 'Yahoo Finance'})
    return articles
