import React, { useMemo, useState } from 'react';
import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatCurrency } from '../utils/finance';
import { chartSample, performanceRange, performanceSummary } from '../components/Dashboard/Performance/performanceModel';
import type { PerformancePeriod } from '../components/Dashboard/Performance/performanceModel';
import { PERFORMANCE_AS_OF, PERFORMANCE_FIRST_YEAR, performanceSnapshots } from './performanceData';
import '../components/Dashboard/Performance/performance.css';

const dateLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const percent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
const points = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)} PP`;
const signedMoney = (value: number) => `${value > 0 ? '+' : ''}${formatCurrency(value)}`;
const PORTFOLIO = '#315da6';
const SPY = '#9380b6';

export default function PreviewPerformance({ numbersVisible, scopeFiltered = false, initialView = 'growth', initialPeriod = 'ytd' }: { numbersVisible: boolean; scopeFiltered?: boolean; initialView?: 'growth' | 'calendar'; initialPeriod?: PerformancePeriod; }) {
  const [period, setPeriod] = useState<PerformancePeriod>(initialPeriod);
  const [view, setView] = useState<'growth' | 'calendar'>(initialView);
  const [unit, setUnit] = useState<'percent' | 'growth'>('percent');
  const currentYear = Number(PERFORMANCE_AS_OF.slice(0, 4));
  const years = Array.from({ length: currentYear - PERFORMANCE_FIRST_YEAR + 1 }, (_, index) => PERFORMANCE_FIRST_YEAR + index);
  const range = performanceRange(period, PERFORMANCE_AS_OF);
  const summary = useMemo(() => performanceSummary(performanceSnapshots, range), [range.start, range.end]);
  const annual = useMemo(() => years.map(year => {
    const result = performanceSummary(performanceSnapshots, performanceRange(`year-${year}`, PERFORMANCE_AS_OF));
    return result ? { ...result, year, label: year === currentYear ? `${year} YTD` : String(year) } : null;
  }).filter(result => result !== null), []);
  const series = summary ? chartSample(summary.series) : [];
  const multiYear = period === '3y' || period === '5y';
  const showYear = (year: number) => { setPeriod(year === currentYear ? 'ytd' : `year-${year}`); setView('growth'); };

  return <section className="portfolio-performance" aria-labelledby="performance-title">
    <header className="perf-header">
      <div>
        <p className="perf-eyebrow">THE LONGER VIEW</p>
        <h2 id="performance-title">Performance vs SPY</h2>
        <p>See investment growth separately from the money you add or take out.</p>
      </div>
      <span className="perf-benchmark-badge">
        <i />SPY always included</span>
    </header>
    <div className="perf-demo-note">
      <strong>Frontend design preview</strong>
      <span>Portfolio and SPY results are simulated, not actual historical returns. Sample as of {dateLabel(PERFORMANCE_AS_OF)}.</span>
    </div>
    {scopeFiltered && <p className="perf-scope-note">This concept compares the entire fictional portfolio. The overview brokerage filter does not change this simulated history.</p>}
    <div className="perf-controls">
      <div className="perf-view-switch" aria-label="Performance view">
        <button aria-pressed={view === 'growth'} onClick={() => setView('growth')}>Growth vs SPY</button>
        <button aria-pressed={view === 'calendar'} onClick={() => setView('calendar')}>Calendar years</button>
      </div>{view === 'growth' && <div className="perf-periods" aria-label="Performance period">{(['ytd', '1y', '3y', '5y'] as const).map(value => <button key={value} aria-pressed={period === value} onClick={() => setPeriod(value)}>{value === 'ytd' ? 'YTD' : value.toUpperCase()}</button>)}<label>
        <span className="sr-only">Choose calendar year</span>
        <select value={period.startsWith('year-') ? period : ''} onChange={event => setPeriod(event.target.value as PerformancePeriod)}>
          <option value="" disabled>Calendar year</option>{[...years].reverse().map(year => <option key={year} value={`year-${year}`}>{year === currentYear ? `${year} YTD` : `${year} · Jan–Dec`}</option>)}</select>
      </label>
      </div>}</div>
    {!numbersVisible ? <div className="perf-hidden">
      <strong>Your performance figures are hidden</strong>
      <p>Use Show figures to reveal the sample comparison.</p>
    </div> : view === 'growth' ? summary ? <>
      <div className="perf-range">
        <strong>{range.label}</strong>
        <span>{dateLabel(range.start)} – {dateLabel(range.end)}</span>
        <small>Latest sample valuation: {dateLabel(summary.closing.date)}</small>
      </div>
      <div className="perf-scoreboard">
        <div>
          <span>
            <i style={{ background: PORTFOLIO }} />Your portfolio</span>
          <strong>{percent(summary.portfolioReturn)}</strong>
          <small>{multiYear && summary.annualized !== null ? `${percent(summary.annualized)} annualized · ` : ''}Time-weighted return</small>
        </div>
        <div>
          <span>
            <i style={{ background: SPY }} />SPY · sample total return</span>
          <strong>{percent(summary.spyReturn)}</strong>
          <small>{multiYear && summary.spyAnnualized !== null ? `${percent(summary.spyAnnualized)} annualized · ` : ''}Distributions reinvested</small>
        </div>
        <div className="perf-difference">
          <span>Return gap vs SPY</span>
          <strong title="Percentage points">{points(summary.difference)}</strong>
          <small>{summary.difference >= 0 ? 'Ahead' : 'Behind'} over the same period · cumulative</small>
        </div>
      </div>
      <div className="perf-chart-toolbar">
        <p>{unit === 'percent' ? 'Cumulative investment return · deposits and withdrawals adjusted' : 'Hypothetical growth of $10,000 · same starting amount for both'}</p>
        <div className="perf-unit-switch" aria-label="Chart display">
          <button aria-pressed={unit === 'percent'} onClick={() => setUnit('percent')}>% return</button>
          <button aria-pressed={unit === 'growth'} onClick={() => setUnit('growth')}>$10k growth</button>
        </div>
      </div>
      <div className="perf-line-chart" role="img" aria-label={`Simulated portfolio versus SPY for ${range.label}`}>
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
                <span>Your portfolio <b>{unit === 'percent' ? percent(row.portfolio) : formatCurrency(row.portfolioGrowth)}</b>
                </span>
                <span>SPY · sample <b>{unit === 'percent' ? percent(row.spy) : formatCurrency(row.spyGrowth)}</b>
                </span>
                <small>Simulated, cash-flow-adjusted comparison</small>
              </div>;
            }} />
            <Area dataKey={unit === 'percent' ? 'portfolio' : 'portfolioGrowth'} fill="url(#performance-area)" stroke="none" tooltipType="none" isAnimationActive={false} />
            <Line name="Your portfolio" dataKey={unit === 'percent' ? 'portfolio' : 'portfolioGrowth'} stroke={PORTFOLIO} strokeWidth={2.4} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
            <Line name="SPY · simulated" dataKey={unit === 'percent' ? 'spy' : 'spyGrowth'} stroke={SPY} strokeDasharray="6 4" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="perf-chart-caption">
        <span>
          <i className="perf-legend-line" />Your portfolio</span>
        <span>
          <i className="perf-legend-line is-spy" />SPY · simulated total return</span>
        <small>Both series start at {unit === 'percent' ? '0%' : '$10,000'} · opening valuation {dateLabel(summary.opening.date)}</small>
      </div>
      <section className="perf-balance" aria-label="Account balance reconciliation">
        <header>
          <div>
            <h3>How the account balance changed</h3>
            <p>Sample account dollars, separate from the normalized investment chart above.</p>
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
      </section>
    </> : <div className="perf-hidden">
      <strong>Full-period history unavailable</strong>
      <p>Opening valuation and complete activity are needed before showing a return.</p>
    </div> : <>
      <div className="perf-calendar-intro">
        <div>
          <h3>Year by year, on the same scale</h3>
          <p>Jan 1 – Dec 31 for completed years. {currentYear} is YTD through {dateLabel(PERFORMANCE_AS_OF)}, with sample valuations through {dateLabel(performanceSnapshots.at(-1)!.date)}.</p>
        </div>
        <span>Cumulative return for each period</span>
      </div>
      <div className="perf-year-chart" role="img" aria-label="Simulated calendar-year portfolio and SPY returns">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={annual} margin={{ top: 12, right: 20, bottom: 0, left: 0 }} barGap={5} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="#e8edf5" strokeDasharray="3 5" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#687b97', fontSize: 10 }} />
            <YAxis axisLine={false} tickLine={false} domain={['auto', 'auto']} width={58} tickFormatter={value => `${value}%`} tick={{ fill: '#718199', fontSize: 10 }} />
            <ReferenceLine y={0} stroke="#bccce2" />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null; const row = payload[0].payload; return <div className="perf-tooltip">
                <strong>{row.label} · simulated</strong>
                <span>Your portfolio <b>{percent(row.portfolioReturn)}</b>
                </span>
                <span>SPY <b>{percent(row.spyReturn)}</b>
                </span>
                <span>Difference <b>{points(row.difference)}</b>
                </span>
              </div>;
            }} />
            <Bar name="Your portfolio" dataKey="portfolioReturn" fill={PORTFOLIO} radius={3} maxBarSize={27} onClick={(row: any) => { const year = row.payload?.year ?? row.year; if (typeof year === 'number') showYear(year); }} style={{ cursor: 'pointer' }} isAnimationActive={false} />
            <Bar name="SPY · simulated" dataKey="spyReturn" fill={SPY} radius={3} maxBarSize={27} onClick={(row: any) => { const year = row.payload?.year ?? row.year; if (typeof year === 'number') showYear(year); }} style={{ cursor: 'pointer' }} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="perf-chart-caption">
        <span>
          <i style={{ background: PORTFOLIO }} />Your portfolio</span>
        <span>
          <i style={{ background: SPY }} />SPY · simulated total return</span>
        <small>Select a year below for its growth chart and balance bridge.</small>
      </div>
      <div className="perf-year-table-wrap">
        <table className="perf-year-table">
          <caption>Simulated returns and balance reconciliation by year. Earnings are ending value minus opening value minus deposits plus withdrawals.</caption>
          <thead>
            <tr>{['Period', 'Portfolio', 'SPY', 'Difference', 'Opening', 'Deposits', 'Withdrawals', 'Earnings', 'Ending'].map(label => <th key={label} scope="col">{label}</th>)}</tr>
          </thead>
          <tbody>{[...annual].reverse().map(row => <tr key={row.year}>
            <th scope="row">
              <button onClick={() => showYear(row.year)}>{row.label} ↗</button>
            </th>
            <td>{percent(row.portfolioReturn)}</td>
            <td>{percent(row.spyReturn)}</td>
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
          <p>Opening value comes from the last available valuation on or before the day preceding the period. The last available sample valuation is shown explicitly; weekends do not invent fresh prices.</p>
        </article>
        <article>
          <h3>Investment return, separate from funding</h3>
          <p>Earnings = ending balance − opening balance − deposits + withdrawals. Dividends, interest, realized and unrealized P&amp;L stay within investment results. A sale is not a withdrawal unless money leaves the portfolio. Transfers between included brokerages are internal.</p>
          <p>The design uses time-weighted return (TWR) for the SPY comparison. Daily sample returns adjust for end-of-day flows and are compounded, rather than dividing earnings by opening balance. Live calculations need flow timing and historical valuations; personal money-weighted return (XIRR) can be added separately.</p>
        </article>
        <article>
          <h3>The benchmark stays visible</h3>
          <p>Compare the same dates with SPY total return, including reinvested distributions, in the same currency. The portfolio includes cash and fees, before personal taxes. The difference is percentage points, not risk-adjusted alpha. Multi-year views show both cumulative and annualized returns.</p>
          <p>Both series here are fictional. Live results require a historical valuation and cash-flow service. References: <a href="https://www.gipsstandards.org/standards/gips-standards-for-firms/gips-standards-handbook-for-firms/" target="_blank" rel="noreferrer">GIPS return methodology</a> · <a href="https://www.ssga.com/us/en/individual/etfs/state-street-spdr-sp-500-etf-trust-spy" target="_blank" rel="noreferrer">SPY methodology</a>.</p>
        </article>
      </div>
    </details>
  </section>;
}
