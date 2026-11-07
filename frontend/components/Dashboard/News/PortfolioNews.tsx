import React, { useEffect, useState } from 'react';
import type { PortfolioNewsFeed, PortfolioNewsStory } from '../../../services/apiService';
import TickerLogo from '../../TickerLogo';
import './portfolio-news.css';

export interface PortfolioNewsState { data:PortfolioNewsFeed | null; loading:boolean; error:string; refresh:() => void }
export const NEWS_PAGE_SIZE = 5;
export function newsPage(items: readonly PortfolioNewsStory[], page: number) {
  const limited = items.slice(0,20);
  const pages = Math.max(1,Math.ceil(limited.length / NEWS_PAGE_SIZE));
  const current = Math.max(1,Math.min(pages,Number.isFinite(page) ? Math.floor(page) : 1));
  return { items:limited.slice((current - 1) * NEWS_PAGE_SIZE,current * NEWS_PAGE_SIZE), page:current, pages, total:limited.length };
}
const time = (value: string) => new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const safeLink = (value: string | null) => { try { const url = new URL(value || ''); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; } };
export default function PortfolioNews({ state, numbersVisible = true, initialPage = 1 }: { state:PortfolioNewsState; numbersVisible?:boolean; initialPage?:number }) {
  const [page,setPage] = useState(initialPage);
  const feed = state.data;
  useEffect(() => { setPage(1); },[feed?.checkedAt]);
  const result = newsPage(feed?.items || [],page);
  return <section className="overview-panel portfolio-news" aria-labelledby="portfolio-news-title" aria-busy={state.loading}>
    <header className="panel-heading"><div><p className="overview-eyebrow">CONTEXT FOR WHAT YOU OWN</p><h2 id="portfolio-news-title">Portfolio news</h2><p className="news-subtitle">Recent stories ranked by your holdings, event relevance and recency.</p></div><button className="overview-button" onClick={state.refresh} disabled={state.loading}>{state.loading ? 'Checking sources…' : 'Refresh news'}</button></header>
    {!numbersVisible ? <div className="news-empty"><strong>Your portfolio news is hidden</strong><p>Reveal figures in your profile to see stories associated with your holdings.</p></div> : <>
      {feed?.preview && <p className="news-preview-note">Design preview · fictional story examples, not live news.</p>}
      {state.error && <p className="news-status" role="alert">{state.error}{feed && ' Previously loaded stories remain below.'}</p>}
      {feed?.message && <p className="news-status" role="status">{feed.message}</p>}
      {state.loading && !feed ? <div className="news-empty" role="status"><strong>Finding news for your portfolio</strong><p>Checking recent stories from your holdings’ news sources.</p></div> : result.total ? <>
        <div className="news-feed-meta"><span>{feed?.preview ? 'Sample refreshed' : 'Sources checked'} {feed && time(feed.checkedAt)}</span><span>{feed?.checkedHoldings} of {feed?.totalHoldings} holdings · {((feed?.coverageWeight || 0) * 100).toFixed(0)}% of absolute invested exposure</span></div>
        <ol className="news-list" start={(result.page - 1) * NEWS_PAGE_SIZE + 1}>{result.items.map((story,index) => {
          const href = safeLink(story.url);
          return <li key={story.url || `${story.title}-${index}`}><article><div className="news-story-meta"><span>{story.source}</span><time dateTime={story.publishedAt}>{time(story.publishedAt)}</time><span className="news-category">{story.category}</span><div className="news-related"><span>Related to</span>{story.tickers.map(ticker => <b key={ticker}><span className="news-related-logo" aria-hidden="true"><TickerLogo ticker={ticker} size={16} /></span><span>{ticker}</span></b>)}<span>{(story.weight * 100).toFixed(1)}% combined weight</span></div></div><h3>{href ? <a href={href} target="_blank" rel="noopener noreferrer">{story.title}<span aria-hidden="true"> ↗</span></a> : story.title}</h3>{story.summary && <p className="news-story-summary">{story.summary}</p>}</article></li>;
        })}</ol>
        <footer className="news-pagination"><span>Showing {(result.page - 1) * NEWS_PAGE_SIZE + 1}–{Math.min(result.page * NEWS_PAGE_SIZE,result.total)} of {result.total} stories</span><nav aria-label="News pages">{Array.from({length:result.pages},(_,index) => index + 1).map(value => <button key={value} aria-label={`News page ${value}`} aria-current={value === result.page ? 'page' : undefined} onClick={() => setPage(value)}>{value}</button>)}</nav></footer>
      </> : !state.error && !feed?.message && <div className="news-empty"><strong>No recent stories to show</strong><p>Connect or import holdings, then refresh news.</p></div>}
      <details className="news-method"><summary>How stories are selected</summary><p>We check up to 20 largest holdings by absolute invested value, grouping the same ticker across accounts. Stories from the last seven days are ranked using portfolio exposure, headline event keywords and recency. We deduplicate headlines and links and limit repeated company coverage. Ranking is a relevance estimate, not a prediction of price impact. Headlines may be delayed or incomplete; open the publisher for the full report.</p><p>A fresh request runs at sign-in or page reload. The session keeps up to 20 stories, five per page. Switching tabs does not refetch. Refresh news checks again. Source failures are shown; sample stories are never substituted for live news.</p></details>
    </>}
  </section>;
}
