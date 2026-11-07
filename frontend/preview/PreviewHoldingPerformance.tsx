import React, { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { StockHolding, Transaction } from '../types';
import { personalHoldingPerformance, matchedHoldingBenchmark } from '../components/Dashboard/Performance/holdingPerformanceModel';
import { holdingComparisonPlot, sampleHoldingPlot } from '../components/Dashboard/Performance/holdingComparisonModel';
import type { HoldingLine } from '../components/Dashboard/Performance/holdingComparisonModel';
import { performanceRange } from '../components/Dashboard/Performance/performanceModel';
import { holdingAsOf, holdingSessions, simulatedHoldingPrices } from './holdingPerformanceData';
import { formatCurrency } from '../utils/finance';
import { signedMoney, signedPercent } from '../components/GainsLosses/GainsCharts';
import { MultiSelectFilter } from '../components/TableFilters';
import TickerLogo from '../components/TickerLogo';
import '../components/Dashboard/Performance/performance.css';

const COLORS = ['#315da6', '#218b83', '#a47c42', '#9380b6', '#c06d8b'];
const MAX_HOLDINGS = 5;
const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', timeZone:'UTC' });
const compact = (value: number) => `${value < 0 ? '−' : ''}$${Math.abs(value) >= 1000 ? `${(Math.abs(value) / 1000).toFixed(1)}k` : Math.abs(value).toFixed(0)}`;
function defaultTickers(tickers: string[]) {
  return [...new Set([...['AAPL','MSFT','NVDA'].filter(ticker => tickers.includes(ticker)), ...tickers])].slice(0,3);
}

export default function PreviewHoldingPerformance({ holdings, transactions, numbersVisible, selectedBrokerages = [], onBrokeragesChange, initialTickers, initialSpy = false, presentation = 'local-preview' }: {
  holdings: StockHolding[]; transactions: Transaction[]; numbersVisible: boolean;
  selectedBrokerages?: string[]; onBrokeragesChange?: (values: string[]) => void;
  initialTickers?: string[]; initialSpy?: boolean; presentation?: 'local-preview' | 'staging-sample';
}) {
  const eligible = useMemo(() => transactions.filter(row => !row.is_deleted && !row.is_duplicate && row.assetType?.toLowerCase() !== 'options' && (!selectedBrokerages.length || selectedBrokerages.includes(row.brokerage))), [transactions, selectedBrokerages]);
  const tickers = [...new Set(eligible.map(row => row.ticker))].filter(Boolean).sort();
  const brokerages = [...new Set(transactions.filter(row => !row.is_deleted && !row.is_duplicate && row.assetType?.toLowerCase() !== 'options').map(row => row.brokerage))].sort();
  const [chosen, setChosen] = useState<string[] | null>(initialTickers || null);
  const selected = (chosen === null ? defaultTickers(tickers) : chosen.filter(ticker => tickers.includes(ticker))).slice(0,MAX_HOLDINGS);
  const [limitNotice, setLimitNotice] = useState('');
  const [spy, setSpy] = useState(initialSpy);
  const [period, setPeriod] = useState<'all' | 'ytd' | '1y' | '3y' | '5y'>('all');
  const [metric, setMetric] = useState<'profit' | 'wealth'>('profit');
  const start = period === 'all' ? undefined : performanceRange(period, holdingAsOf).start;
  const results = useMemo(() => selected.map((ticker, index) => {
    const result = personalHoldingPerformance({ ticker, transactions:eligible, prices:simulatedHoldingPrices(ticker,transactions,holdings), sessions:holdingSessions, asOf:holdingAsOf, start });
    return { ticker, color:COLORS[index], result, benchmark:spy && result.status === 'ready' ? matchedHoldingBenchmark(result,simulatedHoldingPrices('SPY',transactions,holdings)) : null };
  }), [selected.join(','),eligible,transactions,holdings,start,spy]);
  const lines: HoldingLine[] = results.flatMap(({ticker,color,result,benchmark}) => result.status !== 'ready' ? [] : [
    { key:ticker, label:`${ticker} · your investment`, color, series:result.series, activityDates:result.activity.map(event => event.date) },
    ...(benchmark?.status === 'ready' ? [{ key:`${ticker}-spy`, label:`SPY · ${ticker} cash flows`, color, benchmark:true, series:benchmark.series }] : []),
  ]);
  const daily = useMemo(() => holdingComparisonPlot(lines,metric), [results,metric]);
  const plot = sampleHoldingPlot(daily,lines);
  const amount = (value: number) => metric === 'profit' ? signedMoney(value) : formatCurrency(value);

  return <section className="portfolio-performance holding-performance" aria-labelledby="holding-performance-title">
    <header className="perf-header"><div><p className="perf-eyebrow">YOUR HOLDINGS · YOUR TIMING</p><h2 id="holding-performance-title">Holdings performance</h2><p>Compare your results across stocks and funds, using each holding’s own cash movements.</p></div><span className="perf-benchmark-badge">Up to 5 holdings</span></header>
    <div className="perf-demo-note"><strong>{presentation === 'staging-sample' ? 'SAMPLE PORTFOLIO · STAGING' : 'LOCAL DESIGN PREVIEW'}</strong><span>Fictional transactions and simulated daily prices, including SPY. {presentation === 'staging-sample' && 'This example uses a separate sample portfolio; your account holdings and transactions are not used. '} Not actual historical returns. Sample through {dateLabel(holdingAsOf)}.</span></div>
    <div className="holding-performance-body">
      <div className="holding-controls">
        <MultiSelectFilter label="Compare holdings" values={selected} options={tickers} emptyLabel="Choose holdings" onChange={values => { setLimitNotice(values.length > MAX_HOLDINGS ? 'Select up to 5 holdings for a readable chart.' : ''); setChosen(values.slice(0,MAX_HOLDINGS)); }} />
        {onBrokeragesChange && <MultiSelectFilter label="Brokerage" values={selectedBrokerages} options={brokerages} onChange={values => { setChosen(null); onBrokeragesChange(values); }} emptyLabel="All brokerages" />}
        <label className="holding-spy-check"><input type="checkbox" checked={spy} onChange={event => setSpy(event.target.checked)} />SPY comparison for each holding</label>
        <span className="holding-scope">{selectedBrokerages.length ? selectedBrokerages.join(', ') : 'All brokerages'} · Stocks &amp; ETFs</span>
      </div>
      {limitNotice && <p className="holding-footnote" role="status">{limitNotice}</p>}
      <div className="holding-selected-chips" aria-label="Selected holdings">{selected.map((ticker,index) => <button key={ticker} onClick={() => setChosen(selected.filter(symbol => symbol !== ticker))} aria-label={`Remove ${ticker} from chart`}><i style={{background:COLORS[index]}} />{ticker}<span aria-hidden="true">×</span></button>)}</div>
      <div className="perf-controls"><div className="perf-periods" aria-label="Holding performance period">{(['all','ytd','1y','3y','5y'] as const).map(value => <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{value === 'all' ? 'All activity' : value.toUpperCase()}</button>)}</div><div className="perf-view-switch" aria-label="Holding chart measure"><button aria-pressed={metric === 'profit'} onClick={() => setMetric('profit')}>Profit ($)</button><button aria-pressed={metric === 'wealth'} onClick={() => setMetric('wealth')}>Value + returned cash</button></div></div>
      {!numbersVisible ? <div className="perf-hidden"><strong>Your performance figures are hidden</strong><p>Use your profile’s visibility setting to reveal the comparison.</p></div> : !selected.length ? <div className="perf-hidden"><strong>Choose holdings to compare</strong><p>Select up to five stocks or ETFs with recorded transactions in this brokerage scope.</p></div> : <>
        <div className="holding-scorecards">{results.map(({ticker,color,result}) => result.status === 'ready' ? <article key={ticker} style={{borderLeftColor:color}}><span><TickerLogo ticker={ticker} size={24} /><b>{ticker}</b><small>{result.closed ? 'Closed position' : 'Open position'}</small></span><strong>{signedMoney(result.profit)}</strong><small>Profit · {result.days >= 365 && result.annual.rate !== null ? signedPercent(result.annual.rate * 100) : '—'} annualized XIRR</small><small>{dateLabel(result.openingValue > 0 ? result.openingDate! : result.start)} – {dateLabel(result.end)}</small></article> : <article key={ticker}><b>{ticker}</b><small>{result.message}</small></article>)}</div>
        {results.map(({ticker,benchmark}) => benchmark?.status === 'incomplete' && <p key={ticker} className="holding-warning" role="status"><strong>SPY · {ticker} cash flows unavailable.</strong> {benchmark.message}</p>)}
        <p className="holding-chart-label">{metric === 'profit' ? 'Profit = remaining value + cash returned − capital added.' : 'Remaining value + cumulative cash returned.'} Each solid line follows that holding’s own transactions. Dollar results reflect different amounts invested.</p>
        {lines.length > 0 && <><div className="holding-performance-canvas"><ResponsiveContainer width="100%" height="100%"><LineChart data={plot} margin={{top:18,right:24,left:0,bottom:0}} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="#e9eef5" strokeDasharray="3 5" /><XAxis dataKey="time" type="number" scale="time" domain={['dataMin','dataMax']} tickFormatter={time => new Date(time).toLocaleDateString('en-US',{month:'short',year:'2-digit',timeZone:'UTC'})} minTickGap={60} tick={{fontSize:10,fill:'#64748b'}} axisLine={false} tickLine={false} /><YAxis width={68} tickFormatter={compact} tick={{fontSize:10,fill:'#64748b'}} axisLine={false} tickLine={false} /><ReferenceLine y={0} stroke="#bac8db" />
          <Tooltip content={({ active, payload }) => { const point = payload?.[0]?.payload; return active && point ? <div className="gains-chart-tooltip"><strong>{dateLabel(point.date)}</strong>{lines.filter(line => point[line.key] != null).map(line => <span key={line.key}>{line.label}<b>{amount(point[line.key])}</b></span>)}</div> : null; }} />
          {lines.map(line => <Line key={line.key} dataKey={line.key} name={line.label} stroke={line.color} strokeWidth={line.benchmark ? 1.7 : 2.5} strokeDasharray={line.benchmark ? '5 4' : undefined} dot={false} connectNulls={false} isAnimationActive={false} />)}
        </LineChart></ResponsiveContainer></div><div className="holding-legend">{lines.map(line => <span key={line.key}><i className={line.benchmark ? 'is-benchmark' : ''} style={{background:line.color, borderColor:line.color}} />{line.label}</span>)}</div></>}
        <p className="holding-footnote">Each line starts with its first recorded activity and ends at its last valuation or completed exit. Shorter histories are not extended. Annualized XIRR is shown after one year when a unique supported solution exists.</p>
        <details className="holding-activity"><summary>Cash movements &amp; chart data</summary><div className="holding-data-scroll"><table><caption>Your results by holding · selected period</caption><thead><tr><th>Holding</th><th>Opening + money added</th><th>Cash returned</th><th>Remaining value</th><th>Profit</th>{spy && <th>SPY profit · same flows</th>}</tr></thead><tbody>{results.map(({ticker,result,benchmark}) => result.status === 'ready' && <tr key={ticker}><th scope="row">{ticker}</th><td>{formatCurrency(result.added)}</td><td>{formatCurrency(result.returned)}</td><td>{formatCurrency(result.value)}</td><td>{signedMoney(result.profit)}</td>{spy && <td>{benchmark?.status === 'ready' ? signedMoney(benchmark.profit) : 'Unavailable'}</td>}</tr>)}</tbody></table></div><div className="holding-data-scroll"><table><caption>Daily values · {metric === 'profit' ? 'Profit ($)' : 'Value + returned cash ($)'}</caption><thead><tr><th>Date</th>{lines.map(line => <th key={line.key}>{line.label}</th>)}</tr></thead><tbody>{daily.map(point => <tr key={point.date}><td>{point.date}</td>{lines.map(line => <td key={line.key}>{point[line.key] == null ? '—' : formatCurrency(point[line.key] as number)}</td>)}</tr>)}</tbody></table></div></details>
      </>}
      <details className="holding-method"><summary>How holding performance works</summary><p>Every stock or ETF uses its own purchases, sales, cash income and remaining shares. Purchases and explicit fees are money added; sales and cash income are money returned from that holding, even when the cash stays in your brokerage. Reinvestment adds shares without outside capital. Profit = remaining value + cash returned − capital added. Each selected subperiod includes that holding’s opening value as capital.</p><p>Optional dashed SPY lines replay each holding’s own dollar cash flows at the daily closing total-return index. They are labelled by holding because differently timed cash flows produce different SPY dollar results. SPY distributions are reinvested through its index. If matching a withdrawal exceeds a SPY account’s value, that comparison is unavailable. A closed holding’s comparison ends at its final recorded exit/payment.</p><p>Annualized XIRR reflects dated cash flows and terminal value. It is shown after at least one year when a unique supported solution exists. Cash movements use sample-session closes; non-session activity uses the next sample session. Different capital amounts affect dollar profit, so dollar lines are not a percentage-return ranking.</p><p>This example uses simulated prices and fictional transactions. Live support needs complete transaction legs, split-aware valuations and benchmark total-return prices. Separate dividend/reinvestment legs need normalization to avoid counting income twice. Options are excluded.</p></details>
    </div>
  </section>;
}
