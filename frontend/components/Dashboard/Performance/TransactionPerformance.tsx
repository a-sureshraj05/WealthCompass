import React, { useEffect, useState } from 'react';
import PreviewPerformance from '../../../preview/PreviewPerformance';
import { fetchPerformanceHistory, rebuildPerformanceHistory } from '../../../services/apiService';
import type { PerformanceHistory } from '../../../services/apiService';
import './performance.css';

export default function TransactionPerformance({ numbersVisible, scopeFiltered, refreshNonce, onReviewTransactions, compactBalance = false }: {
  numbersVisible: boolean; scopeFiltered: boolean; refreshNonce: number; onReviewTransactions: () => void; compactBalance?:boolean;
}) {
  const [history, setHistory] = useState<PerformanceHistory>({ status: 'building', progress: 'Checking recorded history…' });
  const [attempt, setAttempt] = useState(0);
  const [openingCash, setOpeningCash] = useState('');
  const [request, setRequest] = useState<{ force: boolean; cash?: number | null }>({ force: false });

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rebuilt = false;
    setHistory({ status: 'building', progress: 'Checking recorded history…' });
    const check = async () => {
      try {
        let result = await fetchPerformanceHistory(controller.signal);
        if ((request.force || result.status === 'needs_rebuild') && !rebuilt) {
          rebuilt = true;
          await rebuildPerformanceHistory(controller.signal, request.cash);
          result = { status: 'building', progress: 'Rebuilding from transactions and historical prices…' };
        }
        if (controller.signal.aborted) return;
        setHistory(result);
        if (result.status !== 'building') setOpeningCash(result.openingCash == null ? '' : String(result.openingCash));
        if (result.status === 'building') timer = setTimeout(check, 1800);
      } catch (error) {
        if (!controller.signal.aborted) setHistory({ status: 'error', issues: [{ code: 'request', message: error instanceof Error ? error.message : 'History is unavailable. Please retry.' }] });
      }
    };
    void check();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [attempt, refreshNonce]);

  const retry = (cash?: number | null) => { setRequest({ force: true, cash }); setAttempt(value => value + 1); };
  const ready = history.status === 'ready' && history.snapshots && history.asOf && history.firstYear && history.coverageStart;
  return <div className="transaction-performance">
    {numbersVisible && ready && history.coverageEnd && history.coverageEnd < history.asOf! && <div className="perf-history-issues" role="status"><strong>Partial history · through {history.coverageEnd}</strong><p>Later valuations need additional funding or price records. The chart shows only the complete interval; current YTD and longer periods remain unavailable when coverage is missing.</p></div>}
    {ready ? <PreviewPerformance numbersVisible={numbersVisible} scopeFiltered={scopeFiltered} compactBalance={compactBalance} presentation="transaction-history"
      history={{ snapshots: history.snapshots!, asOf: history.asOf!, firstYear: history.firstYear!, coverageStart: history.coverageStart!, coverageEnd: history.coverageEnd, marketDates: history.marketDates }} /> :
      <section className="portfolio-performance" aria-labelledby="performance-title">
        <header className="perf-header"><div><p className="perf-eyebrow">THE LONGER VIEW</p><h2 id="performance-title">Performance vs SPY</h2><p>Daily values from your recorded transactions and historical market prices.</p></div></header>
        <div className="perf-hidden" role="status">
          {!numbersVisible ? <><strong>Your performance figures are hidden</strong><p>Use your profile’s visibility setting to reveal the comparison.</p></> :
            <><strong>{history.status === 'building' ? 'Preparing your performance history' : history.status === 'empty' ? 'Add transactions to start your history' : 'History needs attention'}</strong>
              <p>{history.status === 'building' ? history.progress : 'Complete prices, opening positions and funding are needed to calculate a reliable return.'}</p></>}
        </div>
      </section>}
    {history.status !== 'building' && <div className="perf-history-status">
      {numbersVisible && <>
        {history.generatedAt && <p>History refreshed {new Date(history.generatedAt).toLocaleString()}. Changes to transactions trigger a rebuild when you return to Overview.</p>}
        {history.method && <p>{history.method}</p>}
        {!!history.issues?.length && <div className="perf-history-issues"><strong>Coverage notes</strong><ul>{history.issues.map((issue, index) => <li key={index}>{issue.symbol && <b>{issue.symbol}: </b>}{issue.message}{issue.date && ` (${issue.date})`}{issue.transactionId && ` · transaction ${issue.transactionId}`}</li>)}</ul></div>}
        {!!history.tradeBenchmarkIssues?.length && <div className="perf-history-issues"><strong>SPY trade-timing coverage</strong><ul>{history.tradeBenchmarkIssues.map((issue, index) => <li key={index}>{issue.message}{issue.date && ` (${issue.date})`}</li>)}</ul></div>}
        {(history.requiresOpeningCash || history.openingCash != null) && <form onSubmit={event => { event.preventDefault(); if (openingCash.trim() && Number.isFinite(Number(openingCash))) retry(Number(openingCash)); }}>
          <label htmlFor="performance-opening-cash">Actual cash balance before your first recorded activity{history.requestedStart ? ` (${history.requestedStart})` : ''}, across all included accounts</label>
          <div><input id="performance-opening-cash" type="number" min="0" max="1000000000000" step="0.01" required value={openingCash} onChange={event => setOpeningCash(event.target.value)} placeholder="USD" /><button type="submit">Save opening cash &amp; rebuild</button>{history.openingCash != null && <button type="button" onClick={() => retry(null)}>Use recorded funding only</button>}</div>
          <small>Use your statement balance. This is saved privately for your account; it does not add a transaction.</small>
        </form>}
      </>}
      <div className="perf-history-actions"><button type="button" onClick={() => retry()}>Refresh history</button><button type="button" onClick={onReviewTransactions}>Review transactions →</button></div>
    </div>}
  </div>;
}
