import React, { useId } from 'react';
import './insights.css';

export interface InsightObservation {
  title: string;
  text: string;
  action?: { label: string; onClick: () => void; };
}

export function insightLines(text: string): string[] {
  return text.split('\n').map(line => line.trim().replace(/^#{1,6}\s+/, '').replace(/^(?:[-*•]|\d+[.)])\s+/, '')).filter(Boolean);
}

function InsightText({ text }: { text: string; }) {
  return <>{text.replace(/`/g, '').split(/\*\*(.+?)\*\*/g).map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part)}</>;
}

export default function InsightsPanel({ items, loading = false, generating = false, stale = false, error = '', sample = false, hasHoldings, numbersVisible, scopeFiltered, generatedAt, onGenerate, onAsk, onOpenHoldings, onOpenGains, children }: {
  items: InsightObservation[]; loading?: boolean; generating?: boolean; stale?: boolean; error?: string;
  sample?: boolean; hasHoldings: boolean; numbersVisible: boolean; scopeFiltered: boolean; generatedAt: number | null;
  onGenerate: () => void; onAsk: () => void; onOpenHoldings: () => void; onOpenGains: () => void; children?: React.ReactNode;
}) {
  const titleId = useId();
  const timestamp = generatedAt ? new Date(generatedAt * 1000) : null;
  const dateText = timestamp?.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return <section className="portfolio-insights" aria-labelledby={titleId} aria-busy={loading || generating}>
    <header className="insights-header">
      <span className="insights-mark">
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
          <path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3Z" />
        </svg>
      </span>
      <div>
        <p className="insights-eyebrow">A CLOSER LOOK AT YOUR PORTFOLIO</p>
        <h2 id={titleId}>AI Insights</h2>
      </div>
      <div className="insights-meta">
        <span className={`insights-badge ${sample ? 'is-sample' : ''}`}>{sample ? 'Sample insights' : 'Entire portfolio'}</span>{!sample && stale && items.length > 0 && <span className="insights-stale">Portfolio changed</span>}</div>
    </header>
    <div className="insights-context">
      <p>{sample ? 'Illustrative observations from fictional holdings. No AI service is used.' : 'AI-generated observations across all brokerages.'}{scopeFiltered && ' This analysis covers the entire portfolio, including brokerages outside the current overview filter.'}</p>{timestamp && <time dateTime={timestamp.toISOString()}>{sample ? 'Sample refreshed' : 'Generated'} {dateText}</time>}</div>
    {!numbersVisible ? <div className="insights-empty">
      <strong>Insights are hidden with your portfolio figures</strong>
      <p>Use Show figures to reveal the analysis.</p>
    </div> : <>
      {error && <p className="insights-error" role="alert">{error}{items.length > 0 && ' Your previously generated insights are still shown.'}</p>}
      {loading && !items.length ? <div className="insights-grid" role="status" aria-label="Loading AI insights">{[0, 1, 2].map(index => <div className="insights-skeleton" key={index}>
        <i />
        <i />
        <i />
      </div>)}</div>
        : items.length > 0 ? <>
          <div className="insights-grid">{items.slice(0, 3).map((item, index) => <article className="insights-observation" key={`${index}-${item.title}`}>
            <div className="insights-observation-label">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <h3>{item.title}</h3>
            </div>
            <p>
              <InsightText text={item.text} />
            </p>{item.action && <button onClick={item.action.onClick}>{item.action.label}<span aria-hidden="true">↗</span>
            </button>}</article>)}</div>{items.length > 3 && <details className="insights-more">
              <summary>Read {items.length - 3} more {items.length - 3 === 1 ? 'observation' : 'observations'}</summary>{items.slice(3).map((item, index) => <p key={index}>
                <InsightText text={item.text} />
              </p>)}</details>}</>
          : <div className="insights-empty">
            <strong>{hasHoldings ? 'A fresh perspective on your portfolio' : 'Your insights start with your holdings'}</strong>
            <p>{hasHoldings ? 'Generate insights to review your portfolio composition and concentration.' : 'Add investments to see observations about your portfolio.'}</p>
          </div>}
    </>}
    <footer className="insights-footer">
      <div className="insights-explore">
        <button disabled={!hasHoldings || !numbersVisible} onClick={onOpenHoldings}>Review holdings ↗</button>
        <button disabled={!hasHoldings || !numbersVisible} onClick={onOpenGains}>Explore gains &amp; losses ↗</button>
      </div>
      <div className="insights-actions">
        <button className="insights-button" disabled={!hasHoldings || !numbersVisible} onClick={onAsk}>{sample ? 'Try sample Q&A' : 'Ask about my portfolio'}</button>
        <button className="insights-button is-primary" disabled={loading || generating || !hasHoldings || !numbersVisible} onClick={onGenerate}>{generating ? 'Analyzing…' : sample ? 'Refresh sample' : items.length ? 'Update insights' : 'Generate insights'}</button>
      </div>
    </footer>
    {children}
  </section>;
}
