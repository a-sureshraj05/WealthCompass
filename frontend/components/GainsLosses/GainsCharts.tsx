import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart, Bar, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../../utils/finance';
import { HoldingResult, PeriodResult, layoutGainTiles } from './gainsModel';

export const GAIN_COLOR = '#259b86';
export const LOSS_COLOR = '#dd7a83';
export const signedMoney = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatCurrency(Math.abs(value))}`;
export const signedPercent = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
const compactMoney = (value: number) => `${value < 0 ? '−' : ''}$${Math.abs(value) >= 1000 ? `${(Math.abs(value) / 1000).toFixed(Math.abs(value) >= 10000 ? 0 : 1)}k` : Math.abs(value).toFixed(0)}`;

export function RealizedGainsChart({ periods, year, hasData }: { periods: PeriodResult[]; year: string; hasData: boolean }) {
  const label = year === 'all' ? 'Realized by year' : 'Realized by month';
  const dateLabel = year === 'all' ? 'all years' : year;
  return <section className="gains-card gains-main-chart">
    <header className="gains-card-heading"><div><p className="gains-eyebrow">WHERE YOUR RESULTS COME FROM</p><h2>{label}</h2></div><span className="gains-period-label">{dateLabel}</span></header>
    <p className="gains-chart-description">Recorded gains and losses from completed sales · {dateLabel}</p>
    <div className="gains-chart-canvas">
      {!hasData ? <div className="gains-empty-chart"><span>—</span><strong>No results to chart</strong><p>Try a different brokerage, ticker or period.</p></div> : <ResponsiveContainer width="100%" height="100%">
        <BarChart data={periods} margin={{ top: 12, right: 14, left: 0, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="#e9eef5" strokeDasharray="3 5" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" minTickGap={12} />
          <YAxis domain={[(value: number) => Math.min(0, value), (value: number) => Math.max(0, value)]} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={compactMoney} width={58} />
          <ReferenceLine y={0} stroke="#bfcddd" />
          <Tooltip cursor={{ fill: '#f5f8fc' }} content={({ active, payload }) => { const row = payload?.[0]?.payload as PeriodResult; return active && row ? <div className="gains-chart-tooltip"><strong>{row.key}</strong><span>Net realized P&amp;L <b>{signedMoney(row.gain)}</b></span><span>Short term <b>{signedMoney(row.shortTerm)}</b></span><span>Long term <b>{signedMoney(row.longTerm)}</b></span><span>{row.lots} closed lots</span></div> : null; }} />
          <Bar dataKey="gain" maxBarSize={30} radius={4} isAnimationActive={false}>{periods.map(row => <Cell key={row.key} fill={row.gain >= 0 ? GAIN_COLOR : LOSS_COLOR} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>}
    </div>
    <footer className="gains-chart-footer"><span><i style={{ background: GAIN_COLOR }} />Gains<i style={{ background: LOSS_COLOR }} />Losses</span><small>Net P&amp;L · sales grouped by closing date</small></footer>
    {hasData && <details className="gains-chart-data"><summary>View chart data</summary><div className="gains-chart-data-scroll"><table><caption className="sr-only">{label}</caption><thead><tr><th>Period</th><th>Net P&amp;L</th><th>Short term</th><th>Long term</th></tr></thead><tbody>{periods.map(row => <tr key={row.key}><td>{row.key}</td><td>{signedMoney(row.gain)}</td><td>{signedMoney(row.shortTerm)}</td><td>{signedMoney(row.longTerm)}</td></tr>)}</tbody></table></div></details>}
  </section>;
}

export function GainsHeatmap({ overall, daily }: { overall: HoldingResult[]; daily: HoldingResult[] }) {
  const [mode, setMode] = useState<'overall' | 'daily'>('overall');
  const [active, setActive] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 330, height: 235 });
  const entries = mode === 'overall' ? overall : daily;
  const tiles = useMemo(() => layoutGainTiles(entries, dimensions.width, dimensions.height), [entries, dimensions]);
  const focused = entries.find(row => row.ticker === active);
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => { const { width, height } = entry.contentRect; if (width > 0 && height > 0) setDimensions({ width, height }); });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return <section className="gains-card gains-map-card">
    <header className="gains-card-heading"><div><p className="gains-eyebrow">THE SHAPE OF YOUR POSITIONS</p><h2>Holdings map</h2></div><div className="gains-switch" aria-label="Heatmap gain period"><button aria-pressed={mode === 'overall'} onClick={() => { setMode('overall'); setActive(null); }}>Open P&amp;L</button><button aria-pressed={mode === 'daily'} onClick={() => { setMode('daily'); setActive(null); }}>Day</button></div></header>
    <p className="gains-chart-description">Size: absolute lot value · colour: {mode === 'overall' ? 'unrealized' : 'daily equity'} P&amp;L %</p>
    <div className="gains-map-canvas" ref={container}>
      {tiles.length ? <svg width="100%" height="100%" viewBox={`0 0 ${dimensions.width} ${dimensions.height}`} role="group" aria-label="Holdings heatmap">
        {tiles.map(tile => {
          const row = entries.find(entry => entry.ticker === tile.ticker)!;
          const level = row.percent === null ? 0 : Math.abs(row.percent) > (mode === 'daily' ? 3 : 20) ? 2 : Math.abs(row.percent) > (mode === 'daily' ? 1 : 5) ? 1 : 0;
          const fill = row.gain === 0 ? '#eef2f7' : row.gain > 0 ? ['#edf5f2', '#dbebe4', '#bfd9cf'][level] : ['#fbf1f2', '#f3e1e6', '#e8c5ce'][level];
          const text = row.gain >= 0 ? '#25624f' : '#8b3c50';
          const width = Math.max(0, tile.width - 4), height = Math.max(0, tile.height - 4);
          const showName = width > 38 && height > 26;
          const showPercent = width > 48 && height > 49;
          const fontSize = Math.max(10, Math.min(17, width / Math.max(row.ticker.length * .7, 1)));
          return <g key={tile.ticker} role="button" tabIndex={0} aria-label={`${row.ticker}: ${signedMoney(row.gain)}, ${signedPercent(row.percent)}; position value ${formatCurrency(row.value)}`} onFocus={() => setActive(row.ticker)} onMouseEnter={() => setActive(row.ticker)} onClick={() => setActive(row.ticker)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActive(row.ticker); } }}>
            <title>{`${row.ticker}: ${signedMoney(row.gain)} (${signedPercent(row.percent)})`}</title>
            <rect x={tile.x + 2} y={tile.y + 2} width={width} height={height} rx={6} fill={fill} stroke={active === row.ticker ? '#5276ad' : '#ffffff'} strokeWidth={active === row.ticker ? 2 : 1} />
            {showName && <text x={tile.x + tile.width / 2} y={tile.y + tile.height / 2 - (showPercent ? 3 : -4)} textAnchor="middle" fill={text} fontSize={fontSize} fontWeight={600} pointerEvents="none">{row.ticker}</text>}
            {showPercent && <text x={tile.x + tile.width / 2} y={tile.y + tile.height / 2 + 16} textAnchor="middle" fill={text} fontSize={11} pointerEvents="none">{signedPercent(row.percent)}</text>}
          </g>;
        })}
      </svg> : <div className="gains-empty-chart"><span>—</span><strong>No {mode === 'daily' ? 'daily equity comparison' : 'position value'} available</strong><p>{mode === 'daily' ? 'Daily view needs a valid previous close. Options are excluded.' : 'Zero-value positions remain in the P&L chart and lot tables.'}</p></div>}
    </div>
    <div className="gains-map-detail" aria-live="polite">{focused ? <><strong>{focused.ticker}</strong><span className={focused.gain >= 0 ? 'gain-positive' : 'gain-negative'}>{signedMoney(focused.gain)} <small>({signedPercent(focused.percent)})</small></span></> : <span>Hover, focus or tap a tile for its P&amp;L.</span>}</div>
    <footer className="gains-chart-footer gains-map-legend"><span><i style={{ background: '#bfd9cf' }} />Gain<i style={{ background: '#e8c5ce' }} />Loss</span><small>Darker colour = larger % move</small></footer>
    <p className="gains-map-note">{mode === 'daily' ? 'Current equity lots vs. previous close; includes only valid quotes.' : 'Open positions only. Options use the contract multiplier; zero-value tiles are omitted.'}</p>
  </section>;
}

export function TaxTermBreakdown({ shortGain, longGain, shortLots, longLots }: { shortGain: number; longGain: number; shortLots: number; longLots: number }) {
  const max = Math.max(Math.abs(shortGain), Math.abs(longGain), 1);
  return <section className="gains-card gains-term-breakdown"><header className="gains-card-heading"><div><p className="gains-eyebrow">A DIFFERENT LENS</p><h2>Results by tax term</h2></div></header><p className="gains-chart-description">Net realized P&amp;L in the current filter.</p><div className="gains-term-bars">{[{ label: 'Short term', gain: shortGain, lots: shortLots, color: 'var(--gain-short-accent)' }, { label: 'Long term', gain: longGain, lots: longLots, color: 'var(--gain-long-accent)' }].map(term => <div key={term.label}><div><span><i style={{ background: term.color }} />{term.label}</span><strong className={term.gain >= 0 ? 'gain-positive' : 'gain-negative'}>{signedMoney(term.gain)}</strong></div><div className="gains-term-track"><span style={{ width: `${Math.abs(term.gain) / max * 100}%`, background: term.color }} /></div><p>{term.lots} closed {term.lots === 1 ? 'lot' : 'lots'}</p></div>)}</div><p className="gains-term-note">Bar length shows absolute P&amp;L. Signed amounts show whether each term made a gain or a loss.</p></section>;
}
