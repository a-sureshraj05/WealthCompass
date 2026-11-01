export type PerformancePeriod = 'ytd' | '1y' | '3y' | '5y' | `year-${number}`;
export interface PerformanceSnapshot { date: string; value: number; deposits: number; withdrawals: number; spyTotalReturnIndex: number }
export interface PerformanceRange { start: string; end: string; openingBoundary: string; label: string }
const DAY = 86400000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const dayAfter = (date: string, days: number) => iso(new Date(Date.parse(date) + days * DAY));
function dateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || iso(new Date(value)) !== value) throw new Error('Invalid performance date.');
  return new Date(`${value}T00:00:00Z`);
}

export function performanceRange(period: PerformancePeriod, asOf: string): PerformanceRange {
  const end = dateValue(asOf);
  const year = end.getUTCFullYear();
  let start: string;
  let last = asOf;
  let label: string;
  if (period === 'ytd') { start = `${year}-01-01`; label = `${year} YTD`; }
  else if (period.startsWith('year-')) {
    const chosen = Number(period.slice(5));
    if (!Number.isInteger(chosen) || chosen < 1900 || chosen > year) throw new Error('Choose a completed or current calendar year.');
    start = `${chosen}-01-01`;
    last = chosen === year ? asOf : `${chosen}-12-31`;
    label = chosen === year ? `${chosen} YTD` : String(chosen);
  } else {
    const years = { '1y': 1, '3y': 3, '5y': 5 }[period as '1y' | '3y' | '5y'];
    if (!years) throw new Error('Unsupported performance period.');
    const priorYear = year - years;
    const month = end.getUTCMonth();
    const lastDay = new Date(Date.UTC(priorYear, month + 1, 0)).getUTCDate();
    const anniversary = iso(new Date(Date.UTC(priorYear, month, Math.min(end.getUTCDate(), lastDay))));
    start = dayAfter(anniversary, 1);
    label = `Trailing ${years} ${years === 1 ? 'year' : 'years'}`;
  }
  return { start, end: last, openingBoundary: dayAfter(start, -1), label };
}

/**
 * Design calculation using complete daily valuations and END-OF-DAY external
 * flows. Live intraday/large flows require valuations at the flow or an explicitly
 * disclosed approximation. No return is fabricated for missing opening history.
 */
export function performanceSummary(snapshots: PerformanceSnapshot[], range: PerformanceRange) {
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const opening = ordered.filter(point => point.date <= range.openingBoundary).at(-1);
  const selected = ordered.filter(point => point.date >= range.start && point.date <= range.end);
  if (!opening || !selected.length) return null;
  if (![opening, ...selected].every(point => Number.isFinite(point.value) && point.value > 0 && Number.isFinite(point.spyTotalReturnIndex) && point.spyTotalReturnIndex > 0 && Number.isFinite(point.deposits) && point.deposits >= 0 && Number.isFinite(point.withdrawals) && point.withdrawals >= 0)) return null;
  let factor = 1;
  let previous = opening.value;
  let deposits = 0;
  let withdrawals = 0;
  const series = [{ date: opening.date, portfolio: 0, spy: 0, portfolioGrowth: 10000, spyGrowth: 10000 }];
  for (const point of selected) {
    const dailyFactor = (point.value - point.deposits + point.withdrawals) / previous;
    if (!Number.isFinite(dailyFactor) || dailyFactor <= 0) return null;
    factor *= dailyFactor;
    deposits += point.deposits;
    withdrawals += point.withdrawals;
    const spyFactor = point.spyTotalReturnIndex / opening.spyTotalReturnIndex;
    series.push({ date: point.date, portfolio: (factor - 1) * 100, spy: (spyFactor - 1) * 100, portfolioGrowth: factor * 10000, spyGrowth: spyFactor * 10000 });
    previous = point.value;
  }
  const closing = selected.at(-1)!;
  const result = series.at(-1)!;
  const days = (Date.parse(range.end) - Date.parse(range.openingBoundary)) / DAY;
  const annualized = days >= 365 ? (Math.pow(factor, 365.2425 / days) - 1) * 100 : null;
  const spyAnnualized = days >= 365 ? (Math.pow(1 + result.spy / 100, 365.2425 / days) - 1) * 100 : null;
  const earnings = closing.value - opening.value - deposits + withdrawals;
  return { range, opening, closing, deposits, withdrawals, netContributions: deposits - withdrawals, earnings, portfolioReturn: result.portfolio, spyReturn: result.spy, difference: result.portfolio - result.spy, annualized, spyAnnualized, days, series };
}

export function chartSample<T>(points: T[], limit = 75): T[] {
  if (points.length <= limit) return points;
  const stride = Math.ceil((points.length - 1) / (limit - 1));
  return points.filter((_, index) => index === 0 || index === points.length - 1 || index % stride === 0);
}
