import React, { useMemo, useState } from 'react';
import TickerLogo from '../TickerLogo';
import BrokerageValue from '../BrokerageValue';
import { formatCurrency } from '../../utils/finance';
import { GainRow, GainsMode, gainPercent } from './gainsModel';
import { signedMoney, signedPercent } from './GainsCharts';

type SortColumn = 'ticker' | 'brokerage' | 'quantity' | 'cost' | 'value' | 'gain' | 'percent';
const dateLabel = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const quantityLabel = (quantity: number) => quantity.toLocaleString(undefined, { maximumFractionDigits: 4 });

export default function GainLotTable({ rows, mode, isOption }: { rows: GainRow[]; mode: GainsMode; isOption: boolean }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ column: SortColumn; direction: 'asc' | 'desc' } | null>(null);
  const groups = useMemo(() => {
    const grouped = new Map<string, { ticker: string; assetType: string; brokers: string[]; rows: GainRow[]; quantity: number; cost: number; value: number; gain: number; percent: number | null }>();
    for (const row of rows) {
      const group = grouped.get(row.ticker) || { ticker: row.ticker, assetType: row.assetType, brokers: [], rows: [], quantity: 0, cost: 0, value: 0, gain: 0, percent: null };
      group.rows.push(row); group.quantity += row.quantity; group.cost += row.cost; group.value += row.value; group.gain += row.gain;
      if (!group.brokers.includes(row.brokerage)) group.brokers.push(row.brokerage);
      grouped.set(row.ticker, group);
    }
    const result = [...grouped.values()].map(group => ({ ...group, percent: gainPercent(group.gain, group.cost), rows: [...group.rows].sort((a, b) => (b.sellDate || b.buyDate).localeCompare(a.sellDate || a.buyDate)) }));
    return result.sort((a, b) => {
      if (!sort) return Math.abs(b.gain) - Math.abs(a.gain);
      const left = sort.column === 'brokerage' ? a.brokers.join(', ') : a[sort.column];
      const right = sort.column === 'brokerage' ? b.brokers.join(', ') : b[sort.column];
      // Undefined percentage has no comparable cost basis, so keep it last in either direction.
      if (left === null) return right === null ? 0 : 1;
      if (right === null) return -1;
      const comparison = typeof left === 'string' && typeof right === 'string' ? left.localeCompare(right) : Number(left) - Number(right);
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [rows, sort]);
  const toggle = (ticker: string) => setExpanded(previous => { const next = new Set(previous); next.has(ticker) ? next.delete(ticker) : next.add(ticker); return next; });
  const allExpanded = groups.length > 0 && groups.every(group => expanded.has(group.ticker));
  const columns: { key: SortColumn; label: string }[] = [{ key: 'ticker', label: 'Holding / tax lot' }, { key: 'brokerage', label: 'Brokerage' }, { key: 'quantity', label: isOption ? 'Contracts' : 'Shares' }, { key: 'cost', label: 'Cost basis' }, { key: 'value', label: mode === 'realized' ? 'Proceeds' : 'Market value' }, { key: 'gain', label: 'P&L' }, { key: 'percent', label: 'P&L %' }];
  return <section className="gains-asset-section" aria-label={isOption ? 'Options gain details' : 'Stocks and funds gain details'}>
    <header><div><span className={`gains-asset-badge ${isOption ? 'is-option' : ''}`}>{isOption ? 'OPT' : 'EQ'}</span><h3>{isOption ? 'Options' : 'Stocks & funds'}</h3><span>{rows.length} {rows.length === 1 ? 'lot' : 'lots'}</span></div><button className="gains-text-button" onClick={() => setExpanded(allExpanded ? new Set() : new Set(groups.map(group => group.ticker)))}>{allExpanded ? 'Collapse lots' : 'Expand lots'}</button></header>
    <div className="gains-table-scroll"><table className="gains-lot-table"><caption className="sr-only">{mode === 'realized' ? 'Realized' : 'Unrealized'} {isOption ? 'options' : 'stocks and funds'} results by holding and tax lot</caption><thead><tr>{columns.map(column => <th key={column.key} scope="col" aria-sort={sort?.column === column.key ? sort.direction === 'asc' ? 'ascending' : 'descending' : 'none'}><button onClick={() => setSort(current => current?.column === column.key ? current.direction === 'asc' ? { column: column.key, direction: 'desc' } : null : { column: column.key, direction: 'asc' })}>{column.label}<span aria-hidden="true" className={sort?.column === column.key ? 'active' : ''}>{sort?.column === column.key ? sort.direction === 'asc' ? '↑' : '↓' : '↕'}</span></button></th>)}</tr></thead>
      <tbody>{groups.map(group => <React.Fragment key={group.ticker}>
        <tr className="gains-holding-row"><td><button className="gains-expand-holding" aria-label={`${expanded.has(group.ticker) ? 'Collapse' : 'Expand'} ${group.ticker} tax lots`} aria-expanded={expanded.has(group.ticker)} onClick={() => toggle(group.ticker)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" style={{ transform: expanded.has(group.ticker) ? 'rotate(90deg)' : undefined }}><path d="m9 5 7 7-7 7" /></svg><TickerLogo ticker={group.ticker} assetType={group.assetType} size={28} /><span><strong>{group.ticker}</strong><small>{group.rows.length} {group.rows.length === 1 ? 'tax lot' : 'tax lots'}</small></span></button></td><td><div className="gains-brokerage-list">{group.brokers.map(broker => <BrokerageValue key={broker} name={broker} compact />)}</div></td><td>{quantityLabel(group.quantity)}</td><td>{formatCurrency(group.cost)}</td><td>{formatCurrency(group.value)}</td><td className={group.gain >= 0 ? 'gain-positive' : 'gain-negative'}>{signedMoney(group.gain)}</td><td className={group.gain >= 0 ? 'gain-positive' : 'gain-negative'}>{signedPercent(group.percent)}</td></tr>
        {expanded.has(group.ticker) && group.rows.map((row, index) => <tr className="gains-lot-row" key={`${row.id}-${index}`}><td><div className="gains-lot-dates"><span>Opened {dateLabel(row.buyDate)}</span>{row.sellDate && <span>Closed {dateLabel(row.sellDate)}</span>}{row.optionSymbol && <small>{row.optionSymbol}</small>}{row.washSale && <small className="gains-wash-badge" title={row.washAmount ? `Reported wash-sale adjustment: ${formatCurrency(row.washAmount)}` : undefined}>Wash-sale adjustment{row.washAmount > 0 ? ` · ${formatCurrency(row.washAmount)}` : ''}</small>}{row.washRisk && <small className="gains-wash-badge">Wash-sale risk flagged</small>}</div></td><td><BrokerageValue name={row.brokerage} compact /></td><td>{quantityLabel(row.quantity)}</td><td>{formatCurrency(row.cost)}</td><td>{formatCurrency(row.value)}</td><td className={row.gain >= 0 ? 'gain-positive' : 'gain-negative'}>{signedMoney(row.gain)}</td><td className={row.gain >= 0 ? 'gain-positive' : 'gain-negative'}>{signedPercent(gainPercent(row.gain, row.cost))}</td></tr>)}
      </React.Fragment>)}</tbody>
    </table></div>
  </section>;
}
