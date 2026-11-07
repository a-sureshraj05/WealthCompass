import React, { useMemo, useState } from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../utils/finance';
import { chartSample, performanceRange, performanceSummary } from '../components/Dashboard/Performance/performanceModel';
import type { PerformancePeriod, PerformanceSnapshot } from '../components/Dashboard/Performance/performanceModel';
import { PERFORMANCE_AS_OF, PERFORMANCE_FIRST_YEAR, performanceSnapshots } from './performanceData';
import '../components/Dashboard/Performance/performance.css';
import OverviewChange from '../components/Dashboard/OverviewChange';

const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const percent = (value:number) => <OverviewChange value={value} format={absolute => `${absolute.toFixed(2)}%`} />;
const points = (value:number) => <OverviewChange value={value} format={absolute => `${absolute.toFixed(2)} PP`} />;
const signedMoney = (value:number) => <OverviewChange value={value} format={formatCurrency} />;
const PORTFOLIO = '#315da6';
const SPY = '#9380b6';
const TRADE_SPY = '#218b83';

function BalanceDisclosure({ compact, children }: { compact: boolean; children: React.ReactNode }) {
  return compact ? <details className="perf-balance-disclosure"><summary><strong>Balance details</strong><span>Opening, cash flows &amp; earnings<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></span></summary>{children}</details> : <>{children}</>;
}

function PerformanceChart({ numbersVisible, scopeFiltered = false, initialView = 'growth', initialPeriod = 'ytd', presentation = 'design-preview', history, compactBalance = false }: { numbersVisible: boolean; scopeFiltered?: boolean; initialView?: 'growth' | 'calendar'; initialPeriod?: PerformancePeriod; compactBalance?: boolean; presentation?: 'design-preview' | 'staging-demo' | 'transaction-history'; history?: { snapshots: PerformanceSnapshot[]; asOf: string; firstYear: number; coverageStart: string; coverageEnd?: string; marketDates?: string[] };  }) {
  const actual = presentation === 'transaction-history';
  // A live history must be supplied explicitly; never fall back to the fixture.
  const asOf = actual ? history!.asOf : PERFORMANCE_AS_OF;
  const firstYear = actual ? history!.firstYear : PERFORMANCE_FIRST_YEAR;
  const snapshots = actual ? history!.snapshots : performanceSnapshots;
  const stagingDemo = presentation === 'staging-demo';
  const portfolioLabel = stagingDemo ? 'Demo portfolio' : 'Your portfolio';
  const [period, setPeriod] = useState<PerformancePeriod>(actual ? 'available' : initialPeriod);
  const [view, setView] = useState<'growth' | 'calendar'>(initialView);
  const [unit, setUnit] = useState<'percent' | 'growth'>('percent');
  const currentYear = Number(asOf.slice(0, 4));
  const years = Array.from({ length: currentYear - firstYear + 1 }, (_, index) => firstYear + index);
  const range = performanceRange(period, actual && period === 'available' ? history!.coverageEnd ?? snapshots.at(-1)!.date : asOf, history?.coverageStart);
  const summary = useMemo(() => performanceSummary(snapshots, range, actual ? history?.marketDates : undefined), [snapshots, range.start, range.end, history?.marketDates]);
  const annual = useMemo(() => years.map(year => {
    const result = performanceSummary(snapshots, performanceRange(`year-${year}`, asOf), actual ? history?.marketDates : undefined);
    return result ? { ...result, year, label: year === currentYear ? `${year} YTD` : String(year) } : null;
  }).filter(result => result !== null), [snapshots, asOf, firstYear, history?.marketDates]);
  const series = summary ? chartSample(summary.series) : [];
  const multiYear = period === '3y' || period === '5y';
  const showYear = (year: number) => { setPeriod(year === currentYear ? 'ytd' : `year-${year}`); setView('growth'); };

  return <section className="portfolio-performance" aria-labelledby="performance-title">
    <header className="perf-header">
      <div>
        <p className="perf-eyebrow">THE LONGER VIEW</p>
        <h2 id="performance-title">{stagingDemo ? 'Demo performance vs SPY' : 'Performance vs SPY'}</h2>
        <p>{actual ? 'Compare your portfolio with SPY following your trades and SPY held throughout.' : 'See investment growth separately from the money you add or take out.'}</p>
      </div>
      <span className="perf-benchmark-badge">
        <i />SPY always included</span>
    </header>
    <div className="perf-demo-note">
      <strong>{actual ? 'TRANSACTION-BASED HISTORY' : stagingDemo ? 'STAGING · DEMO DATA' : 'Frontend design preview'}</strong>
      <span>{actual ? `Historical prices checked through ${dateLabel(asOf)}. Portfolio coverage: ${dateLabel(history!.coverageStart)} – ${dateLabel(history!.coverageEnd ?? snapshots.at(-1)!.date)}. SPY uses dividend-adjusted prices.` : `Portfolio and SPY results are simulated, not actual historical returns. Sample as of ${dateLabel(asOf)}.`}</span>
    </div>
    {stagingDemo && <p className="perf-scope-note">This is a separate fictional portfolio, not a calculation of your holdings, transactions or account balance. No sample records are added to your account.</p>}
    {scopeFiltered && <p className="perf-scope-note">{actual ? 'Performance includes all brokerages in your account. The overview brokerage filter does not change this history.' : 'This concept compares the entire fictional portfolio. The overview brokerage filter does not change this simulated history.'}</p>}
    <div className="perf-controls">
      <div className="perf-view-switch" aria-label="Performance view">
        <button aria-pressed={view === 'growth'} onClick={() => setView('growth')}>Growth vs SPY</button>
        <button aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>Calendar years</button>
      </div>{view === 'growth' && <div className="perf-periods" aria-label="Performance period">{actual && <button aria-pressed={period === 'available'} onClick={() => setPeriod('available')}>Available</button>}{(['ytd', '1y', '3y', '5y'] as const).map(value => <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{value === 'ytd' ? 'YTD' : value.toUpperCase()}</button>)}<label>
        <span className="sr-only">Choose calendar year</span>
        <select value={period.startsWith('year-') ? period : ''} onChange={event => setPeriod(event.target.value as PerformancePeriod)}>
          <option value="" disabled>Calendar year</option>{[...years].reverse().map(year => <option key={year} value={`year-${year}`}>{year === currentYear ? `${year} YTD` : `${year} · Jan–Dec`}</option>)}</select>
      </label>
      </div>}</div>
    {!numbersVisible ? <div className="perf-hidden">
      <strong>Your performance figures are hidden</strong>
      <p>Use your profile’s visibility setting to reveal the comparison.</p>
    </div> : view === 'growth' ? summary ? <>
      <div className="perf-range">
        <strong>{range.label}</strong>
        <span>{dateLabel(range.start)} – {dateLabel(range.end)}</span>
        <small>Latest {actual ? '' : 'sample '}valuation: {dateLabel(summary.closing.date)}</small>
      </div>
      <div className={`perf-scoreboard${actual ? ' has-three-series' : ''}`}>
        <div>
          <span>
            <i style={{ background: PORTFOLIO }} />{portfolioLabel}</span>
          <strong>{percent(summary.portfolioReturn)}</strong>
          <small>{multiYear && summary.annualized !== null ? <>{percent(summary.annualized)} annualized · </> : ''}Time-weighted return</small>
        </div>
        {actual && <div className="perf-trade-score">
          <span><i style={{ background: TRADE_SPY }} />SPY · your trade timing</span>
          <strong>{summary.tradeComparison ? percent(summary.tradeComparison.return) : '—'}</strong>
          <small>{multiYear && summary.tradeComparison?.annualized != null ? <>{percent(summary.tradeComparison.annualized)} annualized · </> : ''}{summary.tradeComparison ? 'Same buy/sell dollars · cash retained' : 'Complete trade-timing history unavailable'}</small>
        </div>}
        <div>
          <span>
            <i style={{ background: SPY }} />{actual ? 'SPY · buy and hold' : 'SPY · sample total return'}</span>
          <strong>{percent(summary.spyReturn)}</strong>
          <small>{multiYear && summary.spyAnnualized !== null ? <>{percent(summary.spyAnnualized)} annualized · </> : ''}Distributions reinvested</small>
        </div>
        {!actual && <div className="perf-difference">
          <span>Return gap vs SPY</span>
          <strong title="Percentage points">{points(summary.difference)}</strong>
          <small>{summary.difference >= 0 ? 'Ahead' : 'Behind'} over the same period · cumulative</small>
        </div>}
      </div>
      {actual && <div className="perf-comparison-gaps">
        <span>Gap vs SPY · your trade timing <b>{summary.tradeComparison ? points(summary.tradeComparison.difference) : 'Unavailable'}</b></span>
        <span>Gap vs SPY · buy and hold <b>{points(summary.difference)}</b></span>
      </div>}
      <div className="perf-chart-toolbar">
        <p>{unit === 'percent' ? 'Cumulative investment return · deposits and withdrawals adjusted' : `Hypothetical growth of $10,000 · same starting amount for ${actual ? 'all three' : 'both'}`}</p>
        <div className="perf-unit-switch" aria-label="Chart display">
          <button aria-pressed={unit === 'percent'} onClick={() => setUnit('percent')}>% return</button>
          <button aria-pressed={unit === 'growth'} onClick={() => setUnit('growth')}>$10k growth</button>
        </div>
      </div>
      <div className="perf-line-chart" role="img" aria-label={`${actual ? 'Portfolio' : 'Simulated portfolio'} versus SPY for ${range.label}`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 15, left: 0, right: 20, bottom: 0 }} accessibilityLayer>
            <defs>
              <linearGradient id="performance-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PORTFOLIO} stopOpacity={.13} />
                <stop offset="100%" stopColor={PORTFOLIO} stopOpacity={.01} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e8edf5" strokeDasharray="3 5" />
            <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={48} tick={{ fill: '#718199', fontSize: 10 }} tickFormatter={date => date === series[0]?.date ? 'Opening' : new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', ...(summary.days > 370 ? { year: '2-digit' as const } : { day: 'numeric' as const }), timeZone: 'UTC' })} />
            <YAxis axisLine={false} tickLine={false} width={62} tick={{ fill: '#718199', fontSize: 10 }} tickFormatter={value => unit === 'percent' ? `${value.toFixed(0)}%` : `$${(value / 1000).toFixed(0)}k`} domain={['auto', 'auto']} />
            <ReferenceLine y={unit === 'percent' ? 0 : 10000} stroke="#ccd8e9" />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null; const row = payload[0].payload; return <div className="perf-tooltip">
                <strong>{dateLabel(row.date)}</strong>
                <span>{portfolioLabel} <b>{unit === 'percent' ? percent(row.portfolio) : formatCurrency(row.portfolioGrowth)}</b>
                </span>
                {actual && summary.tradeComparison && <span>SPY · your trade timing <b>{unit === 'percent' ? percent(row.spyTrade) : formatCurrency(row.spyTradeGrowth)}</b></span>}
                <span>{actual ? 'SPY · buy and hold' : 'SPY · sample'} <b>{unit === 'percent' ? percent(row.spy) : formatCurrency(row.spyGrowth)}</b>
                </span>
                <small>{actual ? 'Daily close, cash-flow-adjusted estimate' : 'Simulated, cash-flow-adjusted comparison'}</small>
              </div>;
            }} />
            <Area dataKey={unit === 'percent' ? 'portfolio' : 'portfolioGrowth'} fill="url(#performance-area)" stroke="none" tooltipType="none" isAnimationActive={false} />
            <Line name={portfolioLabel} dataKey={unit === 'percent' ? 'portfolio' : 'portfolioGrowth'} stroke={PORTFOLIO} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            {actual && summary.tradeComparison && <Line name="SPY · your trade timing" dataKey={unit === 'percent' ? 'spyTrade' : 'spyTradeGrowth'} stroke={TRADE_SPY} strokeDasharray="2 3" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />}
            <Line name={actual ? 'SPY · buy and hold' : 'SPY · simulated'} dataKey={unit === 'percent' ? 'spy' : 'spyGrowth'} stroke={SPY} strokeDasharray="6 4" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="perf-chart-caption">
        <span>
          <i className="perf-legend-line" />{portfolioLabel}</span>
        {actual && <span><i className="perf-legend-line is-trade-spy" />SPY · your trade timing{!summary.tradeComparison && ' · unavailable'}</span>}
        <span>
          <i className="perf-legend-line is-spy" />{actual ? 'SPY · buy and hold' : 'SPY · simulated total return'}</span>
        <small>{actual ? 'All available series' : 'Both series'} start at {unit === 'percent' ? '0%' : '$10,000'} · opening valuation {dateLabel(summary.opening.date)}</small>
      </div>
      {actual && summary.tradeComparison && <section className="perf-trade-account" aria-label="SPY account following your trades">
        <header><h3>What if your trades had been SPY?</h3><p>Account values through {dateLabel(summary.closing.date)}. This simulation starts with your earliest recorded activity; changing periods does not restart it.</p></header>
        <div className="perf-trade-account-values">
          <div><span>Your portfolio</span><strong>{formatCurrency(summary.closing.value)}</strong></div>
          <div><span>SPY · your trade timing</span><strong>{formatCurrency(summary.tradeComparison.closingValue)}</strong></div>
          <div><span>Your portfolio minus SPY</span><strong>{signedMoney(summary.tradeComparison.accountDifference)}</strong></div>
        </div>
        <p>Buy SPY with each recorded purchase amount; sell SPY for each recorded sale amount. Keep sale proceeds in cash until the next purchase or withdrawal.{typeof summary.tradeComparison.cash === 'number' ? ` SPY account cash: ${formatCurrency(summary.tradeComparison.cash)}.` : ''}</p>
        <small>Hypothetical daily-close execution, fractional exposure and reinvested SPY dividends. Original-stock income and reinvestments are not copied; idle cash earns no interest. Recorded separate fees apply to both accounts. The chart above shows normalized returns, not these account balances.</small>
      </section>}
      <BalanceDisclosure compact={compactBalance}><section className="perf-balance" aria-label="Account balance reconciliation">
        <header>
          <div>
            <h3>{compactBalance ? 'Reconcile this period' : 'How the account balance changed'}</h3>
            <p>{compactBalance ? 'A check of the opening value, cash movements and investment result.' : actual ? 'Reconstructed account values, including sale proceeds retained in cash.' : 'Fictional account dollars, separate from your actual account and the normalized investment chart above.'}</p>
          </div>
          <span>{range.label}</span>
        </header>
        <div className="perf-balance-equation">
          <div>
            <span>Opening balance</span>
            <strong>{formatCurrency(summary.opening.value)}</strong>
          </div>
          <i>+</i>
          <div>
            <span>Deposits</span>
            <strong>{formatCurrency(summary.deposits)}</strong>
          </div>
          <i>−</i>
          <div>
            <span>Withdrawals</span>
            <strong>{formatCurrency(summary.withdrawals)}</strong>
          </div>
          <i>{summary.earnings >= 0 ? '+' : '−'}</i>
          <div>
            <span>Investment {summary.earnings >= 0 ? 'earnings' : 'loss'}</span>
            <strong>{formatCurrency(Math.abs(summary.earnings))}</strong>
          </div>
          <i>=</i>
          <div className="perf-ending-balance">
            <span>Ending balance</span>
            <strong>{formatCurrency(summary.closing.value)}</strong>
          </div>
        </div>
        <p className="perf-balance-note">Selling investments and keeping the proceeds in cash is already included. Only money entering or leaving the selected portfolio counts as an external flow.</p>
      </section></BalanceDisclosure>
    </> : <div className="perf-hidden">
      <strong>Full-period history unavailable</strong>
      <p>Opening valuation and complete activity are needed before showing a return.</p>
    </div> : actual && !annual.length ? <div className="perf-hidden"><strong>Complete calendar periods unavailable</strong><p>Calendar years and current YTD need a complete opening valuation and every trading day. Use Available history in Growth vs SPY to see the supported interval.</p></div> : <>
      <div className="perf-calendar-intro">
        <div>
          <h3>Year by year, on the same scale</h3>
          <p>Jan 1 – Dec 31 for completed years. {currentYear} is YTD through {dateLabel(asOf)}, with {actual ? '' : 'sample '}valuations through {dateLabel(snapshots.at(-1)!.date)}.</p>
        </div>
        <span>Cumulative return for each period</span>
      </div>
      <div className="perf-year-chart" role="img" aria-label={actual ? 'Calendar-year portfolio and SPY returns' : 'Simulated calendar-year portfolio and SPY returns'}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={annual} margin={{ top: 12, right: 20, bottom: 0, left: 0 }} barGap={5} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="#e8edf5" strokeDasharray="3 5" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#687b97', fontSize: 10 }} />
            <YAxis axisLine={false} tickLine={false} domain={['auto', 'auto']} width={58} tickFormatter={value => `${value}%`} tick={{ fill: '#718199', fontSize: 10 }} />
            <ReferenceLine y={0} stroke="#bccce2" />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null; const row = payload[0].payload; return <div className="perf-tooltip">
                <strong>{row.label}{actual ? '' : ' · simulated'}</strong>
                <span>{portfolioLabel} <b>{percent(row.portfolioReturn)}</b>
                </span>
                <span>SPY <b>{percent(row.spyReturn)}</b>
                </span>
                {actual && <span>SPY · your trade timing <b>{row.tradeComparison ? percent(row.tradeComparison.return) : 'Unavailable'}</b></span>}
                <span>Gap vs SPY · buy and hold <b>{points(row.difference)}</b>
                </span>
              </div>;
            }} />
            <Bar name={portfolioLabel} dataKey="portfolioReturn" fill={PORTFOLIO} radius={3} maxBarSize={27} onClick={(row: any) => { const year = row.payload?.year ?? row.year; if (typeof year === 'number') showYear(year); }} style={{ cursor: 'pointer' }} isAnimationActive={false} />
            {actual && <Bar name="SPY · your trade timing" dataKey="tradeComparison.return" fill={TRADE_SPY} radius={3} maxBarSize={27} onClick={(row: any) => { const year = row.payload?.year ?? row.year; if (typeof year === 'number') showYear(year); }} style={{ cursor: 'pointer' }} isAnimationActive={false} />}
            <Bar name={actual ? 'SPY · buy and hold' : 'SPY · simulated'} dataKey="spyReturn" fill={SPY} radius={3} maxBarSize={27} onClick={(row: any) => { const year = row.payload?.year ?? row.year; if (typeof year === 'number') showYear(year); }} style={{ cursor: 'pointer' }} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="perf-chart-caption">
        <span>
          <i style={{ background: PORTFOLIO }} />{portfolioLabel}</span>
        {actual && <span><i style={{ background: TRADE_SPY }} />SPY · your trade timing</span>}
        <span>
          <i style={{ background: SPY }} />{actual ? 'SPY · buy and hold' : 'SPY · simulated total return'}</span>
        <small>Select a year below for its growth chart and balance bridge.</small>
      </div>
      <div className="perf-year-table-wrap">
        <table className="perf-year-table">
          <caption>{actual ? 'Returns' : 'Simulated returns'} and balance reconciliation by year. Earnings are ending value minus opening value minus deposits plus withdrawals.</caption>
          <thead>
            <tr>{['Period', stagingDemo ? 'Demo portfolio' : 'Portfolio', ...(actual ? ['SPY · trade timing', 'SPY · buy and hold', 'Gap vs trade timing', 'Gap vs buy and hold'] : ['SPY', 'Difference']), 'Opening', 'Deposits', 'Withdrawals', 'Earnings', 'Ending'].map(label => <th key={label} scope="col">{label}</th>)}</tr>
          </thead>
          <tbody>{[...annual].reverse().map(row => <tr key={row.year}>
            <th scope="row">
              <button onClick={() => showYear(row.year)}>{row.label} ↗</button>
            </th>
            <td>{percent(row.portfolioReturn)}</td>
            {actual && <td>{row.tradeComparison ? percent(row.tradeComparison.return) : '—'}</td>}
            <td>{percent(row.spyReturn)}</td>
            {actual && <td>{row.tradeComparison ? points(row.tradeComparison.difference) : '—'}</td>}
            <td>{points(row.difference)}</td>
            <td>{formatCurrency(row.opening.value)}</td>
            <td>{formatCurrency(row.deposits)}</td>
            <td>{formatCurrency(row.withdrawals)}</td>
            <td>{signedMoney(row.earnings)}</td>
            <td>{formatCurrency(row.closing.value)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
    <details className="perf-method">
      <summary>How returns, dates and SPY are compared</summary>
      <div>
        <article>
          <h3>Your period definitions</h3>
          <p>Calendar years run Jan 1–Dec 31. YTD starts Jan 1 of the current year. Trailing 1, 3 and 5 years start the day after the same date that many years ago, ending on the selected as-of date. A Feb 29 anniversary is clamped to Feb 28 when needed, then one day is added.</p>
          <p>Opening value comes from the last available valuation on or before the day preceding the period. Complete coverage is required. Available history starts after the first positive closing valuation, so the inception day is excluded. Weekends do not invent fresh prices.</p>
        </article>
        <article>
          <h3>Investment return, separate from funding</h3>
          <p>Earnings = ending balance − opening balance − deposits + withdrawals. Dividends, interest, realized and unrealized P&amp;L stay within investment results. A sale is not a withdrawal unless money leaves the portfolio. Transfers between included brokerages are internal.</p>
          <p>{actual ? 'Daily time-weighted returns adjust for recorded external flows assumed at the end of each day, then compound. This is an estimate when flows occur intraday. Opening cash must be supported by your records; missing prices are never replaced by purchase prices.' : 'The design uses time-weighted return (TWR) for the SPY comparison. Daily sample returns adjust for end-of-day flows and are compounded, rather than dividing earnings by opening balance. Live calculations need flow timing and historical valuations; personal money-weighted return (XIRR) can be added separately.'}</p>
        </article>
        <article>
          <h3>{actual ? 'Two SPY comparisons' : 'The benchmark stays visible'}</h3>
          {actual && <><p>SPY · your trade timing replaces recorded buy and sell cash amounts with SPY at the same session’s adjusted close, using the same external deposits, withdrawals and separate fees. Idle cash stays cash and earns no interest in this illustration. A sale is not an external withdrawal. Non-trading-day activity executes at the next available session.</p><p>SPY’s own dividends are reinvested via its adjusted-close total-return index. Original-stock dividends and REI entries are excluded from this SPY account to avoid copying income from investments it does not own. Options mirror their premium dollars; this does not match their leverage or risk. If a sale exceeds SPY exposure or cash is insufficient, the trade-timing comparison becomes unavailable rather than inventing borrowing.</p><p>SPY · buy and hold measures uninterrupted total return over the selected period. When the trade-timing account stays fully invested, its time-weighted percentage can match buy and hold even though contribution dates change its ending dollars. Percentage and $10k charts normalize each account’s time-weighted return; account-dollar values come from the simulation carried forward from the earliest recorded activity.</p></>}
          <p>Compare the same dates with SPY total return, including reinvested distributions, in the same currency. The portfolio includes cash and fees, before personal taxes. The difference is percentage points, not risk-adjusted alpha. Multi-year views show both cumulative and annualized returns.</p>
          <p>{actual ? 'SPY uses Yahoo Finance adjusted closes as a total-return proxy. Your recorded income and fees stay in portfolio results. Unrecorded distributions or corporate actions can affect accuracy. References:' : 'Both series here are fictional. Live results require a historical valuation and cash-flow service. References:'} <a href="https://www.gipsstandards.org/standards/gips-standards-for-firms/gips-standards-handbook-for-firms/" target="_blank" rel="noreferrer">GIPS return methodology</a> · <a href="https://www.ssga.com/us/en/individual/etfs/state-street-spdr-sp-500-etf-trust-spy" target="_blank" rel="noreferrer">SPY methodology</a>.</p>
        </article>
      </div>
    </details>
  </section>;
}

export default function PreviewPerformance(props: React.ComponentProps<typeof PerformanceChart>) {
  if (props.presentation === 'transaction-history' && (!props.history || props.history.snapshots.length < 2)) return null;
  return <PerformanceChart {...props} />;
}
