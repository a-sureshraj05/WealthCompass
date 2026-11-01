import React, { useMemo, useState } from 'react';
import { GainRow, GainsMode, summarizeGains, gainPercent } from './gainsModel';
import { signedMoney, signedPercent } from './GainsCharts';

/** A reconciliation report: explains net P&L instead of repeating portfolio KPIs. */
export default function GainsReconciliation({ rows, mode, numbersVisible }: { rows: GainRow[]; mode: GainsMode; numbersVisible: boolean }) {
  const [unit, setUnit] = useState<'dollars' | 'percent'>('dollars');
  const format = (amount: number, cost: number) => unit === 'percent' ? signedPercent(gainPercent(amount, cost)) : signedMoney(amount);
  const total = useMemo(() => summarizeGains(rows, 0, 0), [rows]);
  const terms = useMemo(() => (['short', 'long'] as const).map(term => {
    const lots = rows.filter(row => row.term === term);
    return { term, count: lots.length, ...summarizeGains(lots, 0, 0) };
  }), [rows]);
  const flat = rows.length - total.winning - total.losing;
  const outcomes = [{ label: 'Gaining', count: total.winning, color: '#6aa99b' }, { label: 'Losing', count: total.losing, color: '#d19aa6' }, { label: 'Flat', count: flat, color: '#c2cede' }];
  return <section className="gains-reconciliation" aria-label="Gains and losses reconciliation">
    <div className="gains-reconciliation-intro"><p className="gains-eyebrow">UNDERSTAND THE NET RESULT</p><h2>Gains, losses<br />&amp; tax terms</h2><p>Separate gains and losses across {mode === 'unrealized' ? 'open' : 'closed'} lots to see how they add up.</p>
      {numbersVisible ? <div className="gains-lot-outcomes"><span>Lot outcomes</span><div className="gains-outcome-track" aria-hidden="true">{outcomes.map(outcome => <i key={outcome.label} style={{ width: `${rows.length ? outcome.count / rows.length * 100 : 0}%`, background: outcome.color }} />)}</div><div className="gains-outcome-legend">{outcomes.map(outcome => <span key={outcome.label}><i style={{ background: outcome.color }} /><strong>{outcome.count}</strong>{outcome.label.toLowerCase()}</span>)}</div></div> : <p className="gains-reconciliation-hidden">Figures are hidden.</p>}
    </div>
    <div className="gains-reconciliation-body">
      <div className="gains-reconciliation-toolbar"><span>{unit === 'percent' ? '% of row cost basis' : 'Values in dollars'}</span><div className="gains-switch" aria-label="Reconciliation display units"><button aria-label="Show dollar values" aria-pressed={unit === 'dollars'} onClick={() => setUnit('dollars')}>$</button><button aria-label="Show percentage values" aria-pressed={unit === 'percent'} onClick={() => setUnit('percent')}>%</button></div></div>
      {numbersVisible ? <div className="gains-reconciliation-scroll"><table className="gains-reconciliation-table"><caption className="sr-only">Gains from gaining lots plus losses from losing lots equal net P&amp;L for each tax term</caption><thead><tr><th scope="col">Tax term</th><th scope="col">Gains</th><th scope="col">Losses</th><th scope="col">Net P&amp;L</th></tr></thead><tbody>{terms.map(term => <tr key={term.term} data-term={term.term}><th scope="row"><span><i className={term.term === 'short' ? 'gains-short-dot' : 'gains-long-dot'} />{term.term === 'short' ? 'Short term' : 'Long term'}</span><small>{term.count} {term.count === 1 ? 'lot' : 'lots'}</small></th><td className={term.grossGains > 0 ? 'gain-positive' : ''}>{format(term.grossGains, term.cost)}</td><td className={term.grossLosses < 0 ? 'gain-negative' : ''}>{format(term.grossLosses, term.cost)}</td><td className={term.gain > 0 ? 'gain-positive' : term.gain < 0 ? 'gain-negative' : ''}>{format(term.gain, term.cost)}</td></tr>)}</tbody><tfoot><tr><th scope="row">Combined result<small>{rows.length} {mode === 'unrealized' ? 'open' : 'closed'} lots</small></th><td className={total.grossGains > 0 ? 'gain-positive' : ''}>{format(total.grossGains, total.cost)}</td><td className={total.grossLosses < 0 ? 'gain-negative' : ''}>{format(total.grossLosses, total.cost)}</td><td className={total.gain > 0 ? 'gain-positive' : total.gain < 0 ? 'gain-negative' : ''}>{format(total.gain, total.cost)}</td></tr></tfoot></table></div> : <div className="gains-reconciliation-mask" aria-label="Reconciliation figures hidden">••••••</div>}
      <p className="gains-reconciliation-note">{unit === 'percent' ? 'Percentages use the total cost basis within each row; the combined row uses the full filtered cost basis. Gains % + losses % = net %, before rounding. A zero or negative cost basis is shown as —.' : 'Gains include positive lot P&L; losses include negative lot P&L. Net is their sum, before any illustrative tax estimate.'}</p>
    </div>
  </section>;
}
