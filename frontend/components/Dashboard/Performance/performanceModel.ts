export type PerformancePeriod = 'available' | 'ytd' | '1y' | '3y' | '5y' | `year-${number}`;
export interface PerformanceSnapshot { date: string; value: number; deposits: number; withdrawals: number; spyTotalReturnIndex: number; spyTradeValue?: number | null; spyTradeCash?: number | null }
export interface PerformanceRange { start: string; end: string; openingBoundary: string; label: string }
const DAY = 86400000;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const dayAfter = (date: string, days: number) => iso(new Date(Date.parse(date) + days * DAY));
function dateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || iso(new Date(value)) !== value) throw new Error('Invalid performance date.');
  return new Date(`${value}T00:00:00Z`);
}

export function performanceRange(period: PerformancePeriod, asOf: string, coverageStart?: string): PerformanceRange {
  const end = dateValue(asOf);
  const year = end.getUTCFullYear();
  let start: string;
  let last = asOf;
  let label: string;
  if (period === 'available') {
    if (!coverageStart || coverageStart >= asOf) throw new Error('At least two valuations are required.');
    dateValue(coverageStart);
    start = dayAfter(coverageStart, 1); label = 'Available history';
  }
  else if (period === 'ytd') { start = `${year}-01-01`; label = `${year} YTD`; }
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
export function performanceSummary(snapshots: PerformanceSnapshot[], range: PerformanceRange, marketDates?: string[]) {
  const ordered = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const opening = ordered.filter(point => point.date <= range.openingBoundary).at(-1);
  const selected = ordered.filter(point => point.date >= range.start && point.date <= range.end);
  if (!opening || !selected.length) return null;
  if (marketDates) {
    const expectedOpening = marketDates.filter(date => date <= range.openingBoundary).at(-1);
    const expected = marketDates.filter(date => date >= range.start && date <= range.end);
    if (opening.date !== expectedOpening || expected.length !== selected.length || expected.some((date, index) => selected[index]?.date !== date)) return null;
  }
  if (![opening, ...selected].every(point => Number.isFinite(point.value) && point.value >= 0 && Number.isFinite(point.spyTotalReturnIndex) && point.spyTotalReturnIndex > 0 && Number.isFinite(point.deposits) && point.deposits >= 0 && Number.isFinite(point.withdrawals) && point.withdrawals >= 0)) return null;
  if (opening.value <= 0) return null;
  let factor = 1;
  let previous = opening.value;
  let deposits = 0;
  let withdrawals = 0;
  let tradeValid = [opening, ...selected].every(point => typeof point.spyTradeValue === 'number' && Number.isFinite(point.spyTradeValue) && point.spyTradeValue >= 0) && opening.spyTradeValue! > 0;
  let tradeFactor = 1;
  let previousTrade = opening.spyTradeValue ?? 0;
  const series = [{ date: opening.date, portfolio: 0, spy: 0, portfolioGrowth: 10000, spyGrowth: 10000, spyTrade: tradeValid ? 0 : null, spyTradeGrowth: tradeValid ? 10000 : null }];
  for (const point of selected) {
    if (previous <= 0) return null;
    const dailyFactor = (point.value - point.deposits + point.withdrawals) / previous;
    if (!Number.isFinite(dailyFactor) || dailyFactor < 0) return null;
    factor *= dailyFactor;
    deposits += point.deposits;
    withdrawals += point.withdrawals;
    const spyFactor = point.spyTotalReturnIndex / opening.spyTotalReturnIndex;
    if (tradeValid) {
      const dailyTradeFactor = (point.spyTradeValue! - point.deposits + point.withdrawals) / previousTrade;
      if (previousTrade <= 0 || !Number.isFinite(dailyTradeFactor) || dailyTradeFactor < 0) tradeValid = false;
      else tradeFactor *= dailyTradeFactor;
      previousTrade = point.spyTradeValue!;
    }
    series.push({ date: point.date, portfolio: (factor - 1) * 100, spy: (spyFactor - 1) * 100, portfolioGrowth: factor * 10000, spyGrowth: spyFactor * 10000,
      spyTrade: tradeValid ? (tradeFactor - 1) * 100 : null, spyTradeGrowth: tradeValid ? tradeFactor * 10000 : null });
    previous = point.value;
  }
  const closing = selected.at(-1)!;
  const result = series.at(-1)!;
  const days = (Date.parse(range.end) - Date.parse(range.openingBoundary)) / DAY;
  const annualized = days >= 365 ? (Math.pow(factor, 365.2425 / days) - 1) * 100 : null;
  const spyAnnualized = days >= 365 ? (Math.pow(1 + result.spy / 100, 365.2425 / days) - 1) * 100 : null;
  const earnings = closing.value - opening.value - deposits + withdrawals;
  if (!tradeValid) series.forEach(point => { point.spyTrade = null; point.spyTradeGrowth = null; });
  const tradeComparison = tradeValid ? {
    return: (tradeFactor - 1) * 100, difference: result.portfolio - (tradeFactor - 1) * 100,
    annualized: days >= 365 ? (Math.pow(tradeFactor, 365.2425 / days) - 1) * 100 : null,
    openingValue: opening.spyTradeValue!, closingValue: closing.spyTradeValue!, cash: closing.spyTradeCash,
    earnings: closing.spyTradeValue! - opening.spyTradeValue! - deposits + withdrawals,
    accountDifference: closing.value - closing.spyTradeValue!,
  } : null;
  return { range, opening, closing, deposits, withdrawals, netContributions: deposits - withdrawals, earnings, portfolioReturn: result.portfolio, spyReturn: result.spy, difference: result.portfolio - result.spy, annualized, spyAnnualized, days, series, tradeComparison };
}

export function chartSample<T>(points: T[], limit = 75): T[] {
  if (points.length <= limit) return points;
  const stride = Math.ceil((points.length - 1) / (limit - 1));
  return points.filter((_, index) => index === 0 || index === points.length - 1 || index % stride === 0);
}
