import React, { useMemo, useState } from 'react';
import type { HoldingResult } from './gainsModel';
import { formatCurrency } from '../../utils/finance';
import TickerLogo from '../TickerLogo';

export type HoldingRank = 'percent' | 'gain' | 'exposure';
export function rankHoldings(entries: readonly HoldingResult[], query: string, sort: HoldingRank) {
  const exposure = entries.reduce((sum, row) => sum + row.exposure, 0);
  return entries.filter(row => row.ticker.toLowerCase().includes(query.trim().toLowerCase())).map(row => ({ ...row, weight:exposure > 0 ? row.exposure / exposure * 100 : 0 })).sort((a,b) => {
    const score = (row: HoldingResult) => sort === 'percent' ? row.percent === null ? -1 : Math.abs(row.percent) : sort === 'gain' ? Math.abs(row.gain) : row.exposure;
    return score(b) - score(a) || a.ticker.localeCompare(b.ticker);
  });
}
const percent = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCurrency(Math.abs(value))}`;
export default function RankedHoldings({ entries, daily }: { entries: HoldingResult[]; daily: boolean }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<HoldingRank>('percent');
  const rows = useMemo(() => rankHoldings(entries,query,sort),[entries,query,sort]);
  const scale = Math.max(1,...entries.map(row => Math.abs(row.percent ?? 0)));
  return <div className="ranked-holdings"><div className="ranked-controls"><label>Find holding<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search ticker" /></label><label>Sort by<select value={sort} onChange={event => setSort(event.target.value as HoldingRank)}><option value="percent">Largest % move</option><option value="gain">Largest $ impact</option><option value="exposure">Largest position</option></select></label><span aria-live="polite">{rows.length} of {entries.length} holdings</span></div><div className="ranked-scroll"><table><caption className="sr-only">{daily ? 'Daily' : 'Open'} P&amp;L ranked by holding</caption><thead><tr><th>Holding</th><th className="ranked-bar-column">{daily ? 'Day' : 'Open'} P&amp;L %</th><th>P&amp;L</th><th>Weight</th><th>Position value</th></tr></thead><tbody>{rows.map(row => <tr key={row.ticker}><th scope="row"><div><TickerLogo ticker={row.ticker} size={26} /><strong>{row.ticker}</strong></div></th><td className="ranked-bar-column"><div className="ranked-move"><div className="ranked-diverging" aria-hidden="true"><i /><span style={{ width:`${Math.abs(row.percent ?? 0) / scale * 50}%`, left:row.gain >= 0 ? '50%' : undefined, right:row.gain < 0 ? '50%' : undefined, background:row.gain >= 0 ? '#78b5a1' : '#d79aa7' }} /></div><strong className={row.gain >= 0 ? 'gain-positive' : 'gain-negative'}>{percent(row.percent)}</strong></div></td><td className={row.gain >= 0 ? 'gain-positive' : 'gain-negative'}>{signed(row.gain)}</td><td>{row.weight.toFixed(1)}%</td><td>{formatCurrency(row.value)}</td></tr>)}</tbody></table>{!rows.length && <p className="ranked-empty">{entries.length ? 'No holdings match your search.' : 'No holdings with eligible valuations in this scope.'}</p>}</div><p className="gains-map-note">Weight uses absolute position exposure across this filter, before search. Bar length shows the absolute % move, with gains right of zero and losses left. {daily ? 'Daily equity lots vs. previous close.' : 'Open-position P&L; excludes completed sales.'} This is not a cash-flow-weighted return.</p></div>;
}
