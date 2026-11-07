import asyncio
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.core import crypto
from backend.app.core import portfolio_news as core
from backend.app.core.scoping import UserScope
from backend.app.api import news
from backend.app.api.auth import get_current_user
from backend.app.core.database import get_db
from backend.app.db.schema import Base, Holding, User

NOW = datetime(2026,11,7,12,tzinfo=timezone.utc)

def article(title='Earnings and guidance', url='https://publisher.example/report', hours=1, **extra):
    return {'content':{'title':title,'summary':'<p>A short &amp; useful preview.</p>','pubDate':(NOW-timedelta(hours=hours)).isoformat(),'provider':{'displayName':'Publisher'},'canonicalUrl':{'url':url},**extra}}

def test_exposure_groups_brokerages_and_options_without_sending_dollars():
    rows=[SimpleNamespace(ticker='aapl',marketValue=60),SimpleNamespace(ticker='AAPL',marketValue=-20),SimpleNamespace(ticker='MSFT',marketValue=20),SimpleNamespace(ticker='BAD SPACE',marketValue=1000),SimpleNamespace(ticker='ZERO',marketValue=0)]
    assert core.portfolio_weights(rows)=={'AAPL':.8,'MSFT':.2}

def test_normalization_handles_current_and_legacy_provider_shapes():
    current=core.normalize_article(article(), 'AAPL', NOW)
    assert current['summary']=='A short & useful preview.'
    legacy={'title':'AAPL earnings','publisher':'Source','link':'https://source.example/a','providerPublishTime':int(NOW.timestamp()),'description':'legacy text'}
    assert core.normalize_article(legacy,'AAPL',NOW)['source']=='Source'

def test_unsafe_links_ads_missing_dates_stale_and_future_items_are_rejected():
    for raw in [article(url='javascript:alert(1)'),article(url='https://name:password@host.example/a'),article(hours=200),article(hours=-3),{'ad':True,'content':article()['content']},article(pubDate='bad-date'),article(provider={})]:
        assert core.normalize_article(raw,'AAPL',NOW) is None

def test_ranking_blends_weight_event_importance_and_recency():
    batches={'AAPL':[article('General company update','https://p.example/a')],'TINY':[article('Earnings guidance and merger','https://p.example/t')]}
    # Big events in smaller positions can outrank a generic large-position story.
    result=core.rank_articles(batches,{'AAPL':.7,'TINY':.3},NOW)
    assert result[0]['tickers']==['TINY']
    assert all('_score' not in story and '_importance' not in story for story in result)

def test_duplicate_links_and_titles_merge_ticker_exposure():
    a=article('Same headline','https://p.example/a?tracking=1')
    b=article('Same headline','https://p.example/a?tracking=2')
    result=core.rank_articles({'AAPL':[a,a],'MSFT':[b]}, {'AAPL':.6,'MSFT':.4}, NOW)
    assert len(result)==1 and result[0]['tickers']==['AAPL','MSFT'] and result[0]['weight']==1

def test_caps_twenty_stories_and_four_per_company():
    weights={f'S{i}':.1 for i in range(10)}
    batches={symbol:[article(f'{symbol} report {i}',f'https://p.example/{symbol}/{i}') for i in range(8)] for symbol in weights}
    result=core.rank_articles(batches,weights,NOW)
    assert len(result)==20
    assert max(sum(symbol in item['tickers'] for item in result) for symbol in weights)<=4

def test_summary_is_short_and_not_raw_html():
    result=core.normalize_article(article(summary='<script>text</script>' + ' longword'*100),'AAPL',NOW)
    assert len(result['summary'])<=260 and len(result['summary'].split())<=40
    assert '<script>' not in result['summary']

@pytest.fixture
def client_scope(tmp_path):
    engine=create_engine(f"sqlite:///{tmp_path / 'news.db'}",connect_args={'check_same_thread':False})
    Base.metadata.create_all(engine)
    session=sessionmaker(bind=engine)()
    token=crypto.CURRENT_DEK.set(crypto.generate_dek())
    users=[User(id=i,email=f'{i}@example.test',hashed_password='x') for i in (1,2)]
    session.add_all(users)
    for i,ticker in [(1,'AAPL'),(2,'PRIVATE')]:
        session.add(Holding(user_id=i,ticker=ticker,brokerage='Test',quantity=1,averageCostPerShare=100,totalCost=100,currentPrice=100,marketValue=100,assetType='Equity'))
    session.commit()
    app=FastAPI();app.include_router(news.router,prefix='/api/v1')
    app.dependency_overrides[get_db]=lambda:session
    app.dependency_overrides[get_current_user]=lambda:users[0]
    news._calls.clear()
    yield TestClient(app),app,session,users
    news._calls.clear();session.close();crypto.CURRENT_DEK.reset(token);engine.dispose()

def test_authenticated_requests_are_fresh_scoped_and_nonblocking_on_partial_failure(client_scope,monkeypatch):
    client,app,session,users=client_scope
    calls=[]
    def fetch(symbol):
        calls.append(symbol)
        return [article(pubDate=datetime.now(timezone.utc).isoformat())]
    monkeypatch.setattr(core,'fetch_symbol_news',fetch)
    a=client.post('/api/v1/news/refresh').json()
    b=client.post('/api/v1/news/refresh').json()
    assert calls==['AAPL','AAPL'] and a['status']=='ready' and b['status']=='ready'
    assert len(a['items'])==1 and a['preview'] is False
    app.dependency_overrides[get_current_user]=lambda:users[1]
    c=client.post('/api/v1/news/refresh').json()
    assert calls[-1]=='PRIVATE' and c['items'][0]['tickers']==['PRIVATE']

def test_source_failure_and_empty_portfolio_never_create_sample_stories(client_scope,monkeypatch):
    client,app,session,users=client_scope
    def fail(symbol): raise RuntimeError('provider unavailable')
    monkeypatch.setattr(core,'fetch_symbol_news',fail)
    result=client.post('/api/v1/news/refresh').json()
    assert result['status']=='unavailable' and result['items']==[] and result['failedHoldings']==1
    session.query(Holding).filter(Holding.user_id==1).delete();session.commit()
    assert client.post('/api/v1/news/refresh').json()['status']=='empty'

def test_unsigned_request_cannot_read_portfolio_news(client_scope):
    client,app,_,_=client_scope
    app.dependency_overrides.pop(get_current_user)
    assert client.post('/api/v1/news/refresh').status_code==401

def test_user_request_limit_is_bounded_and_independent():
    news._calls.clear()
    try:
        for _ in range(6): news._admit(1)
        with pytest.raises(Exception) as error: news._admit(1)
        assert error.value.status_code==429
        news._admit(2)
    finally: news._calls.clear()

def test_provider_fetches_each_time_with_timeout_and_no_client_cache(monkeypatch):
    from io import BytesIO
    calls=[]
    payload=b'<rss><channel><item><title>Fresh earnings</title><link>https://publisher.example/a</link><pubDate>Sat, 07 Nov 2026 12:00:00 GMT</pubDate><description>Short preview</description></item></channel></rss>'
    def fetch(request,timeout):
        calls.append((request.full_url,request.headers,timeout))
        return BytesIO(payload)
    monkeypatch.setattr(core,'urlopen',fetch)
    for _ in range(2):
        assert core.fetch_symbol_news('AAPL')[0]['title']=='Fresh earnings'
    assert len(calls)==2
    assert all(url.startswith('https://feeds.finance.yahoo.com/rss/2.0/headline?s=AAPL') and headers['Cache-control']=='no-cache' and timeout==6 for url,headers,timeout in calls)


def test_feed_parser_rejects_entities_and_oversized_payloads(monkeypatch):
    from io import BytesIO
    for payload in [b'<!DOCTYPE rss><rss />', b'x'*2000001]:
        monkeypatch.setattr(core,'urlopen',lambda *args,**kwargs:BytesIO(payload))
        with pytest.raises(ValueError): core.fetch_symbol_news('AAPL')

def test_large_portfolio_checks_twenty_largest_and_reports_partial_coverage(client_scope,monkeypatch):
    client,app,session,_=client_scope
    session.query(Holding).filter(Holding.user_id==1).delete()
    for i in range(25):
        session.add(Holding(user_id=1,ticker=f'S{i:02}',brokerage='Test',quantity=1,averageCostPerShare=1,totalCost=1,currentPrice=25-i,marketValue=25-i,assetType='Equity'))
    session.commit()
    calls=[]
    def fetch(symbol):
        calls.append(symbol)
        if symbol=='S00': raise RuntimeError('one source failed')
        return [article(title=f'{symbol} earnings',url=f'https://p.example/{symbol}',pubDate=datetime.now(timezone.utc).isoformat())]
    monkeypatch.setattr(core,'fetch_symbol_news',fetch)
    result=client.post('/api/v1/news/refresh').json()
    assert len(calls)==20 and set(calls)=={f'S{i:02}' for i in range(20)}
    assert result['status']=='partial' and result['failedHoldings']==1
    assert result['totalHoldings']==25 and result['checkedHoldings']==20
    assert 0 < result['coverageWeight'] < 1
    assert len(result['items'])==19
