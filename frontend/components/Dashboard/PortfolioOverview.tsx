import React, { useId, useMemo, useState } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, PieChart, Pie } from 'recharts';
import { StockHolding } from '../../types';
import { formatCurrency } from '../../utils/finance';
import { cashBrokerage, portfolioModel, rankContributors } from './portfolioModel';
import ContributorTable from './ContributorTable';
import './portfolio-overview.css';
import TickerLogo from '../TickerLogo';
import BrokerageMark from '../BrokerageMark';

interface Props {
  holdings: StockHolding[];
  cashByBrokerage: Record<string, number>;
  numbersVisible?: boolean;
  selectedBrokerages?: string[];
  onBrokeragesChange?: (values: string[]) => void;
  onOpenHoldings: (ticker?: string) => void;
  onRefresh: () => void | Promise<unknown>;
  onConnect: () => void;
  preview?: boolean;
  insights?: React.ReactNode;
  performance?: React.ReactNode;
}

const money = formatCurrency;
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`;
const percent = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
const compact = (value: number) => `${value < 0 ? '−' : ''}$${Math.abs(value) >= 1000 ? `${(Math.abs(value) / 1000).toFixed(Math.abs(value) >= 10000 ? 0 : 1)}k` : Math.abs(value).toFixed(0)}`;

export function Icon({ name, size = 18 }: { name: 'arrow' | 'refresh' | 'plus' | 'wallet' | 'trend' | 'grid' | 'chevron'; size?: number }) {
  const paths = {
    arrow: 'M7 17 17 7M7 7h10v10',
    refresh: 'M20 7v5h-5M4 17v-5h5M6.1 7a7 7 0 0 1 11.55-2L20 8M4 16l2.35 3A7 7 0 0 0 17.9 17',
    plus: 'M12 5v14M5 12h14',
    wallet: 'M20 8V5H4v14h16V8H4m12 4h4v4h-4z',
    trend: 'm3 17 6-6 4 4 8-10m-6 0h6v6',
    grid: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    chevron: 'm9 5 7 7-7 7',
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

const PortfolioOverview: React.FC<Props> = ({ holdings, cashByBrokerage, numbersVisible = true, selectedBrokerages = [], onBrokeragesChange, onOpenHoldings, onRefresh, onConnect, preview = false, insights, performance }) => {
  const [unit, setUnit] = useState<'dollars' | 'percent'>('dollars');
  const [showAllContributors, setShowAllContributors] = useState(false);
  const contributorsId = useId();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const model = useMemo(() => portfolioModel(holdings, cashByBrokerage, selectedBrokerages), [holdings, cashByBrokerage, selectedBrokerages]);
  const brokers = [...new Set([...holdings.map(h => h.brokerage), ...Object.keys(cashByBrokerage).map(cashBrokerage)])].sort();
  const mask = '••••••';
  const display = (value: number, isSigned = false) => numbersVisible ? (isSigned ? signed(value) : money(value)) : mask;
  const ranked = useMemo(() => rankContributors(model.contributors, unit), [model.contributors, unit]);
  const chartData = ranked.slice(0, 10).map(d => ({ ...d, amount: unit === 'dollars' ? d.change : d.percent }));
  const expandedContributors = showAllContributors && ranked.length > 10;
  const maxChange = Math.max(...chartData.map(d => Math.abs(d.amount)), 1) * 1.18;
  const dailyAvailable = model.contributors.length > 0;
  const contributorSummary = !dailyAvailable ? '—' : !numbersVisible ? mask : unit === 'percent' ? percent(model.dayPercent) : signed(model.dayChange);
  const refresh = async () => {
    setRefreshing(true);
    setRefreshError('');
    try { await onRefresh(); } catch { setRefreshError('Could not refresh. Your previously loaded data is still shown.'); }
    finally { setRefreshing(false); }
  };

  return <div className="portfolio-overview">
    {preview && <div className="preview-notice"><span className="preview-dot" /><strong>Design preview</strong><span>Fictional portfolio · no brokerage connection</span><span className="preview-local">LOCAL ONLY</span></div>}
    <header className="overview-heading">
      <div><p className="overview-eyebrow">YOUR WEALTH, AT A GLANCE</p><h1>Portfolio Overview</h1><p className="overview-description">The big picture. The details that matter.</p></div>
      <div className="overview-toolbar">
        <label className="overview-select"><Icon name="wallet" size={16} /><span className="sr-only">Filter portfolio by brokerage</span><select value={selectedBrokerages.length === 1 ? selectedBrokerages[0] : selectedBrokerages.length > 1 ? '__multiple' : ''} onChange={e => onBrokeragesChange?.(e.target.value ? [e.target.value] : [])}>
          <option value="">All brokerages</option>{selectedBrokerages.length > 1 && <option value="__multiple" disabled>Multiple brokerages</option>}{brokers.map(b => <option key={b}>{b}</option>)}
        </select></label>
        <button className="overview-button" onClick={refresh} disabled={refreshing}><span className={refreshing ? 'overview-spin' : ''}><Icon name="refresh" size={16} /></span>{refreshing ? 'Refreshing…' : 'Refresh'}</button>
      </div>
    </header>
    {refreshError && <p className="overview-error" role="alert">{refreshError}</p>}

    <section className="overview-hero" aria-label="Portfolio summary">
      <div className="hero-primary">
        <div className="hero-label"><span className="hero-icon"><Icon name="wallet" size={17} /></span>Total portfolio value<span className="hero-pill">{selectedBrokerages.length ? 'FILTERED' : 'CONSOLIDATED'}</span></div>
        <div className="hero-value">{display(model.totalValue)}</div>
        <p className="hero-subtitle">Investments <span>{display(model.investmentValue)}</span><i />Cash <span>{display(model.cashValue)}</span></p>
        <div className="hero-footer"><span className="status-dot" />{preview ? 'Sample prices · illustrative data' : 'Latest available prices · not a live feed'}</div>
      </div>
      <div className="hero-secondary">
        <div className="hero-metric"><span>Daily equity change<Icon name="trend" size={16} /></span><strong className={!numbersVisible || !dailyAvailable ? '' : model.dayChange >= 0 ? 'is-positive' : 'is-negative'}>{dailyAvailable ? display(model.dayChange, true) : '—'}</strong><p><b className={!numbersVisible || !dailyAvailable ? '' : model.dayChange >= 0 ? 'is-positive' : 'is-negative'}>{numbersVisible ? percent(model.dayPercent) : mask}</b> vs. previous close</p></div>
        <div className="hero-metric"><span>Unrealized gain / loss<Icon name="arrow" size={16} /></span><strong className={!numbersVisible ? '' : model.gain >= 0 ? 'is-positive' : 'is-negative'}>{display(model.gain, true)}</strong><p><b>{numbersVisible ? percent(model.gainPercent) : mask}</b> on open-position cost basis</p></div>
        <div className="hero-metric"><span>{model.cashValue < 0 ? 'Net cash / margin' : 'Cash balance'}<Icon name="wallet" size={16} /></span><strong>{display(model.cashValue)}</strong><p>{model.cashValue < 0 ? 'Negative cash balance includes margin' : `${model.brokers.length} brokerages in this view`}</p></div>
      </div>
    </section>

    {insights}
    {performance}

    <div className="overview-chart-grid">
      <section className="overview-panel daily-panel">
        <div className="panel-heading"><div><p className="overview-eyebrow">WHAT MOVED YOUR PORTFOLIO</p><h2>Today's contributors</h2></div><div className="chart-unit" aria-label="Chart units"><button aria-pressed={unit === 'dollars'} className={unit === 'dollars' ? 'active' : ''} onClick={() => setUnit('dollars')}>$</button><button aria-pressed={unit === 'percent'} className={unit === 'percent' ? 'active' : ''} onClick={() => setUnit('percent')}>%</button></div></div>
        <div className="chart-summary"><strong aria-live="polite" className={!numbersVisible || !dailyAvailable ? '' : model.dayChange >= 0 ? 'positive' : 'negative'}>{contributorSummary}</strong><span>equity change across {model.contributors.length} holdings</span></div>
        {numbersVisible && dailyAvailable && <div className="contributors-controls">
          <p className="overview-chart-context" aria-live="polite">Showing {expandedContributors ? ranked.length : chartData.length} of {ranked.length} holdings · {expandedContributors ? 'use column headers to sort' : `largest ${unit === 'dollars' ? 'dollar changes' : 'percentage moves'} first`}</p>
          {ranked.length > 10 && <button type="button" aria-expanded={expandedContributors} aria-controls={contributorsId} onClick={() => setShowAllContributors(value => !value)}>{expandedContributors ? 'Show top 10' : `View all ${ranked.length} contributors`}</button>}
        </div>}
        <div className="contributors-chart" id={contributorsId}>
          {!numbersVisible ? <div className="chart-empty"><Icon name="grid" size={26} /><p>Portfolio figures are hidden</p><span>Use the profile visibility control to reveal charts.</span></div> : !chartData.length ? <div className="chart-empty"><Icon name="trend" size={28} /><p>No daily comparison available</p><span>Holdings need a current price and previous close.</span></div> : expandedContributors ? <ContributorTable key={unit} contributors={ranked} unit={unit} onOpenHolding={onOpenHoldings} /> : <>
            <div className="contributors-chart-canvas" style={{ height: Math.max(242, chartData.length * 28 + 38) }}><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 20, bottom: 0, left: 4 }} accessibilityLayer>
              <CartesianGrid horizontal={false} stroke="#e9eef5" strokeDasharray="3 5" />
              <XAxis type="number" domain={[-maxChange, maxChange]} tickFormatter={n => unit === 'dollars' ? compact(n) : `${n.toFixed(1)}%`} axisLine={false} tickLine={false} tick={{ fill: '#8692a5', fontSize: 11 }} ticks={[-maxChange / 1.18, 0, maxChange / 1.18]} />
              <YAxis type="category" dataKey="ticker" width={56} axisLine={false} tickLine={false} tick={{ fill: '#44536b', fontSize: 12, fontWeight: 600 }} />
              <ReferenceLine x={0} stroke="#c6d0df" />
              <Tooltip cursor={{ fill: '#f5f7fb' }} content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return <div className="overview-tooltip"><strong>{d.ticker}</strong><span>{signed(d.change)} · {percent(d.percent)}</span><span>Click the bar to view holding →</span></div>;
              }} />
              <Bar dataKey="amount" barSize={19} radius={4} onClick={(data: any) => onOpenHoldings(data.ticker)} style={{ cursor: 'pointer' }} isAnimationActive={false}>
                {chartData.map(d => <Cell key={d.ticker} fill={d.change >= 0 ? '#259b86' : '#dd7a83'} />)}
              </Bar>
            </BarChart></ResponsiveContainer></div>
            <details className="chart-accessible"><summary>View chart data</summary><ul>{chartData.map(d => <li key={d.ticker}><button onClick={() => onOpenHoldings(d.ticker)}>{d.ticker}<span>{unit === 'dollars' ? signed(d.change) : percent(d.percent)}</span></button></li>)}</ul></details>
          </>}
        </div>
        <div className="panel-footnote"><span className="legend-dot" style={{ background: '#259b86' }} />Gains<span className="legend-dot loss-dot" />Losses<span className="footnote-right">Current equity positions · excludes options</span></div>
      </section>

      <section className="overview-panel allocation-panel">
        <div className="panel-heading"><div><p className="overview-eyebrow">HOW YOU'RE INVESTED</p><h2>Holdings allocation</h2></div><Icon name="grid" size={18} /></div>
        {numbersVisible && model.allocation.length > 0 ? <>
          <div className="allocation-donut"><ResponsiveContainer width="100%" height="100%"><PieChart accessibilityLayer><Pie data={model.allocation} dataKey="value" nameKey="name" innerRadius="72%" outerRadius="96%" paddingAngle={model.allocation.length > 6 ? 1.5 : 3} cornerRadius={4} stroke="none" isAnimationActive={false} onClick={(data: any) => onOpenHoldings(data.name === 'Other' ? undefined : data.name)} style={{ cursor: 'pointer' }}>{model.allocation.map(d => <Cell key={d.name} fill={d.color} />)}</Pie><Tooltip formatter={(v: number, name: string) => [money(v), name === 'Other' ? `Other · ${model.allocationOtherCount} holdings` : name]} wrapperStyle={{ zIndex: 5 }} contentStyle={{ backgroundColor: '#fff', borderRadius: 12, border: '1px solid #d9e3ef', boxShadow: '0 5px 18px #19335918', fontSize: 12 }} /></PieChart></ResponsiveContainer><div className="donut-center"><strong>{model.tickers.length}</strong><span>holdings</span></div></div>
          <div className="allocation-legend">{model.allocation.map(d => <button key={d.name} onClick={() => onOpenHoldings(d.name === 'Other' ? undefined : d.name)}><span className="legend-dot" style={{ background: d.color }} /><span>{d.name === 'Other' ? `Other · ${model.allocationOtherCount}` : d.name}</span><strong>{(d.value / model.allocationTotal * 100).toFixed(1)}%</strong></button>)}</div>
          {model.allocationOtherCount > 0 && <div className="allocation-group-note"><p>Other combines {model.allocationOtherCount} smaller holdings. Each holding above 20% is shown separately.</p><button type="button" onClick={() => onOpenHoldings()}>View full breakdown →</button></div>}
        </> : <div className="chart-empty allocation-empty"><Icon name="grid" size={26} /><p>{numbersVisible ? 'No positive holdings to display' : 'Allocation is hidden'}</p><span>{numbersVisible ? 'Connect a brokerage to get started.' : 'Reveal your figures to see the breakdown.'}</span></div>}
        <p className="allocation-note">Positive invested assets · cash excluded{model.hasShorts ? ' · short positions excluded' : ''}</p>
      </section>
    </div>

    <div className="overview-detail-grid">
      <section className="overview-panel overview-holdings">
        <div className="panel-heading"><div><p className="overview-eyebrow">THE BUILDING BLOCKS</p><h2>Largest holdings</h2></div><button className="overview-text-button" onClick={() => onOpenHoldings()}>View all{model.tickers.length > 5 ? ` ${model.tickers.length}` : ''}<Icon name="chevron" size={14} /></button></div>
        {model.tickers.length ? <div className="overview-table-wrap"><table className="overview-table"><thead><tr><th>Asset</th><th>Market value</th><th>Unrealized P&amp;L</th><th className="weight-column">Weight</th><th><span className="sr-only">Open holding</span></th></tr></thead><tbody>{model.tickers.slice(0, 5).map(t => {
          const gain = t.value - t.cost;
          return <tr key={t.ticker}><td><button className="holding-identity" onClick={() => onOpenHoldings(t.ticker)}><TickerLogo ticker={t.ticker} size={31} assetType={holdings.find(h => h.ticker === t.ticker)?.assetType} /><span><strong>{t.ticker}</strong><small>Across selected brokerages</small></span></button></td><td>{display(t.value)}</td><td className={!numbersVisible ? '' : gain >= 0 ? 'positive' : 'negative'}>{display(gain, true)}</td><td className="weight-column">{numbersVisible && model.allocationTotal > 0 ? `${(Math.max(t.value, 0) / model.allocationTotal * 100).toFixed(1)}%` : numbersVisible ? '—' : mask}</td><td><button className="holding-open" aria-label={`Open ${t.ticker} holdings`} onClick={() => onOpenHoldings(t.ticker)}><Icon name="chevron" size={15} /></button></td></tr>;
        })}</tbody></table></div> : <div className="chart-empty"><p>Your portfolio starts here</p><span>Connect a brokerage or import a statement.</span><button className="overview-button primary" onClick={onConnect}><Icon name="plus" size={16} />Add investments</button></div>}
      </section>

      <section className="overview-panel brokerage-panel">
        <div className="panel-heading"><div><p className="overview-eyebrow">CONNECTED ACCOUNTS</p><h2>By brokerage</h2></div><button className="broker-add" aria-label="Connect a brokerage" onClick={onConnect}><Icon name="plus" size={17} /></button></div>
        <div className="broker-list">{model.brokers.map(b => {
          const positiveAssets = Math.max(0, b.invested) + Math.max(0, b.cash);
          return <div className="broker-item" key={b.name}><div className="broker-title"><span className="broker-avatar"><BrokerageMark name={b.name} size={23} decorative /></span><strong>{b.name}</strong><span>{display(b.invested + b.cash)}</span></div>{numbersVisible && <div className="broker-track" aria-hidden="true"><span style={{ width: `${positiveAssets > 0 ? Math.max(0, b.invested) / positiveAssets * 100 : 0}%` }} /><i style={{ width: `${positiveAssets > 0 ? Math.max(0, b.cash) / positiveAssets * 100 : 0}%` }} /></div>}<p>Invested {display(b.invested)}<span>{b.cash < 0 ? 'Margin' : 'Cash'} {display(b.cash)}</span></p></div>;
        })}{!model.brokers.length && <p className="broker-empty">No brokerages in this view.</p>}</div>
        <div className="broker-legend"><span className="legend-dot" style={{ background: '#416bce' }} />Invested<span className="legend-dot" style={{ background: '#bfcee9' }} />Cash</div>
      </section>
    </div>
    <div className="portfolio-observation"><span className="observation-icon"><Icon name="trend" size={20} /></span><div><strong>Portfolio perspective</strong><p>{!numbersVisible ? 'Your portfolio figures are hidden across this overview.' : model.allocationTotal > 0 ? `Your five largest holdings represent ${model.topFivePercent.toFixed(1)}% of positive invested assets. Explore individual holdings to see their cost basis and tax lots.` : 'Add investments to see allocation and position-level insights.'}</p></div><button className="overview-text-button" onClick={() => onOpenHoldings()}>Explore holdings<Icon name="arrow" size={15} /></button></div>
    <p className="overview-disclosure">Daily change estimates price movement on current equity positions, not account performance adjusted for trading or cash flows. Unrealized P&amp;L covers open positions only.</p>
  </div>;
};

export default PortfolioOverview;
