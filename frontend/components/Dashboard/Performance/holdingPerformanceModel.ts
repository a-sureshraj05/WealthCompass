import type { Transaction } from '../../../types';

export interface HoldingQuote { close: number; totalReturnIndex?: number; splitRatio?: number }
export type HoldingPrices = Record<string, HoldingQuote>;
export interface InvestorFlow { date: string; amount: number }
export interface HoldingActivity { id: string; date: string; recordedDate: string; kind: 'buy' | 'sell' | 'income' | 'reinvest' | 'fee'; quantity: number; amount: number; brokerage: string; accountId?: number | null }
export interface HoldingPoint { date: string; value: number; quantity: number; added: number; returned: number; wealth: number; profit: number }
const DAY = 86400000;
const validDay = (day: string) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
const goodPrice = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const issue = (message: string) => ({ status: 'incomplete' as const, message });

/** Annual money-weighted return on irregular cash flows, actual/365.
 * Isolate roots at derivative turning points instead of picking a convenient
 * Newton starting guess. Multiple roots/no root are reported, never shown as 0%.
 */
export function investorXirr(flows: readonly InvestorFlow[]) {
  const grouped = new Map<string, number>();
  for (const flow of flows) {
    if (!validDay(flow.date) || !Number.isFinite(flow.amount)) return { rate: null, reason: 'invalid' as const };
    grouped.set(flow.date, (grouped.get(flow.date) || 0) + flow.amount);
  }
  const dated = [...grouped].filter(([, amount]) => Math.abs(amount) > 1e-8).sort(([a], [b]) => a.localeCompare(b));
  if (dated.length < 2 || !dated.some(([, amount]) => amount < 0) || !dated.some(([, amount]) => amount > 0)) return { rate: null, reason: 'unavailable' as const };
  type Term = { t: number; c: number };
  const terms = dated.map(([day, c]) => ({ t: (Date.parse(day) - Date.parse(dated[0][0])) / DAY / 365, c }));
  const changes = (items: Term[]) => items.slice(1).reduce((count, item, index) => count + (Math.sign(item.c) !== Math.sign(items[index].c) ? 1 : 0), 0);
  // Regular contributions plus a terminal value have a unique root even with
  // years of monthly purchases. Bound only unusually complex alternating flows.
  if (dated.length > 128 && changes(terms) > 1) return { rate: null, reason: 'complex' as const };
  const value = (items: Term[], u: number) => {
    const logs = items.map(item => Math.log(Math.abs(item.c)) - item.t * u);
    const scale = Math.max(...logs);
    return items.reduce((sum, item, index) => sum + Math.sign(item.c) * Math.exp(logs[index] - scale), 0);
  };
  const roots = (items: Term[], low: number, high: number): number[] => {
    const first = items[0].t;
    const scale = Math.max(...items.map(item => Math.abs(item.c)));
    const normalized = items.map(item => ({ t: item.t - first, c: item.c / scale }));
    if (normalized.length < 2) return [];
    if (!changes(normalized)) return [];
    const derivative = normalized.slice(1).map(item => ({ t: item.t, c: -item.t * item.c }));
    const boundaries = changes(normalized) === 1 ? [low, high] : [low, ...roots(derivative, low, high), high];
    const found = boundaries.filter(u => Math.abs(value(normalized, u)) < 1e-10);
    for (let index = 1; index < boundaries.length; index++) {
      let a = boundaries[index - 1], b = boundaries[index];
      let fa = value(normalized, a), fb = value(normalized, b);
      if (Math.abs(fa) < 1e-10 || Math.abs(fb) < 1e-10 || fa * fb >= 0) continue;
      for (let step = 0; step < 100; step++) {
        const middle = (a + b) / 2, fm = value(normalized, middle);
        if (Math.abs(fm) < 1e-12) { a = b = middle; break; }
        if (fa * fm <= 0) { b = middle; fb = fm; } else { a = middle; fa = fm; }
      }
      found.push((a + b) / 2);
    }
    return found.sort((a, b) => a - b).filter((u, index, all) => !index || Math.abs(u - all[index - 1]) > 1e-6);
  };
  const solutions = roots(terms, -20, 20);
  return solutions.length === 1 ? { rate: Math.expm1(solutions[0]), reason: null } : { rate: null, reason: solutions.length > 1 ? 'ambiguous' as const : 'unavailable' as const };
}

export function personalHoldingPerformance({ ticker, transactions, prices, sessions, asOf, start }: {
  ticker: string; transactions: readonly Transaction[]; prices: HoldingPrices; sessions: readonly string[]; asOf: string; start?: string;
}) {
  if (!validDay(asOf) || start && !validDay(start)) return issue('Choose a valid valuation period.');
  const calendar = [...new Set(sessions.filter(day => validDay(day) && day <= asOf))].sort();
  if (!calendar.length) return issue('Daily valuation sessions are missing.');
  const cutoff = calendar.at(-1)!;
  const sources = transactions.filter(row => !row.is_deleted && !row.is_duplicate && row.ticker.trim().toUpperCase() === ticker.trim().toUpperCase() && row.assetType?.toLowerCase() !== 'options');
  const events: HoldingActivity[] = [];
  for (const row of sources) {
    const recordedDate = row.date.slice(0, 10);
    if (!validDay(recordedDate)) return issue('A holding transaction has an invalid date.');
    if (recordedDate > cutoff) continue;
    if (recordedDate < calendar[0]) return issue('Valuation history starts after the first transaction. Earlier sessions are required.');
    const date = calendar.find(day => day >= recordedDate);
    if (!date) continue;
    const action = row.action.trim().toUpperCase();
    const kind = action === 'BUY' ? 'buy' : action === 'SELL' ? 'sell' : action === 'REI' ? 'reinvest' : ['DIV','DIVIDEND','DISTRIBUTION','INT','INTEREST'].includes(action) ? 'income' : ['FEE','COMMISSION','TAX'].includes(action) ? 'fee' : null;
    if (!kind) return issue(`Action ${action || '(empty)'} needs a supported cash/security leg before calculating this holding.`);
    const quantity = Math.abs(row.quantity);
    const amount = row.totalCost != null ? Math.abs(row.totalCost) : row.price != null ? Math.abs(row.price * quantity) : NaN;
    if (!Number.isFinite(amount) || !Number.isFinite(quantity) || ['buy','sell','reinvest'].includes(kind) && quantity <= 0) return issue('A holding transaction has a missing or invalid quantity/cash amount.');
    events.push({ id:row.id, date, recordedDate, kind, quantity, amount, brokerage:row.brokerage, accountId:row.account_id });
  }
  events.sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id, undefined, { numeric:true }));
  if (!events.length) return { status:'empty' as const, message:'No eligible stock or ETF activity is recorded in this scope.' };
  // A REI row already contains its implicit distribution. Separate DIV + REI
  // legs need an explicit link/normalization; counting both would create profit.
  if (events.some(event => event.kind === 'reinvest' && events.some(other => other.kind === 'income' && other.amount > 0 && other.date === event.date && other.brokerage === event.brokerage && other.accountId === event.accountId))) {
    return issue('A cash-income and reinvestment entry share a session/account. Normalize the paired cash legs before calculating; income must not be counted twice.');
  }
  const rows: { date:string; quantity:number; value:number }[] = [];
  let quantity = 0, cursor = 0;
  for (const date of calendar) {
    const quote = prices[date];
    if (quote?.splitRatio != null) {
      if (!goodPrice(quote.splitRatio)) return issue('A stock split has an invalid ratio.');
      quantity *= quote.splitRatio;
    }
    while (cursor < events.length && events[cursor].date <= date) {
      const event = events[cursor++];
      if (event.kind === 'buy' || event.kind === 'reinvest') quantity += event.quantity;
      if (event.kind === 'sell') quantity -= event.quantity;
    }
    if (quantity < -1e-8) return issue('Sales exceed recorded shares. Import the missing opening purchases before showing a personal return.');
    if (quantity > 1e-8 && (!quote || !Number.isFinite(quote.close) || quote.close < 0)) return issue(`A closing price is missing while ${ticker} was held (${date}). No price is carried forward or invented.`);
    rows.push({ date, quantity:Math.max(0,quantity), value:quantity > 1e-8 ? quantity * quote.close : 0 });
  }
  const end = quantity > 1e-8 ? cutoff : events.at(-1)!.date;
  const first = events[0].date;
  const from = start && start > first ? start : first;
  if (from > end) return { status:'empty' as const, message:'This holding has no invested period in the selected range. Try All activity.' };
  const opening = rows.filter(row => row.date < from).at(-1);
  const selected = rows.filter(row => row.date >= from && row.date <= end);
  const activity = events.filter(event => event.date >= from && event.date <= end);
  const closing = selected.at(-1)!;
  const openingValue = opening?.value || 0;
  const flows: InvestorFlow[] = openingValue > 0 ? [{ date:opening!.date, amount:-openingValue }] : [];
  let added = openingValue, returned = 0;
  const series: HoldingPoint[] = opening ? [{ ...opening, added, returned, wealth:openingValue, profit:0 }] : [];
  for (const row of selected) {
    for (const event of activity.filter(event => event.date === row.date)) {
      if (event.kind === 'buy' || event.kind === 'fee') { added += event.amount; flows.push({date:event.date,amount:-event.amount}); }
      if (event.kind === 'sell' || event.kind === 'income') { returned += event.amount; flows.push({date:event.date,amount:event.amount}); }
    }
    series.push({ ...row, added, returned, wealth:row.value + returned, profit:row.value + returned - added });
  }
  const result = series.at(-1)!;
  const annual = investorXirr([...flows, {date:closing.date, amount:closing.value}]);
  return { status:'ready' as const, ticker, start:from, end, openingDate:opening?.date, openingValue, added, returned, value:closing.value,
    profit:result.profit, quantity:closing.quantity, closed:closing.quantity <= 1e-8, series, activity, flows, annual,
    days:(Date.parse(end) - Date.parse(openingValue > 0 ? opening!.date : from)) / DAY,
    shiftedDates:activity.filter(event => event.recordedDate !== event.date).length };
}

export type PersonalHoldingResult = Extract<ReturnType<typeof personalHoldingPerformance>, {status:'ready'}>;

/** Same investment amounts and cash returned on the selected holding's dates.
 * Holding-level sales are withdrawals from this investment sleeve, even if the
 * money remains in the brokerage. Period comparisons start with equal capital.
 */
export function matchedHoldingBenchmark(primary: PersonalHoldingResult, prices: HoldingPrices) {
  let units = 0;
  const index = (day: string) => prices[day]?.totalReturnIndex ?? prices[day]?.close;
  if (primary.openingValue > 0) {
    const opening = index(primary.openingDate!);
    if (!goodPrice(opening)) return issue('Benchmark opening history is unavailable.');
    units = primary.openingValue / opening;
  }
  const series: {date:string; value:number; wealth:number; profit:number}[] = [];
  for (const point of primary.series) {
    const changes = primary.activity.filter(event => event.date === point.date);
    const quote = index(point.date);
    if ((units > 1e-10 || changes.some(event => event.kind !== 'fee' && event.kind !== 'reinvest' && event.amount > 0)) && !goodPrice(quote)) return issue(`Benchmark history is missing on ${point.date}.`);
    for (const event of changes) {
      if (event.kind === 'buy' && event.amount > 0) units += event.amount / quote;
      if ((event.kind === 'sell' || event.kind === 'income') && event.amount > 0) units -= event.amount / quote;
    }
    if (units < -1e-8) return issue('The requested cash return exceeds this benchmark’s value. No shorting or extra funding is assumed.');
    units = Math.max(0,units);
    const value = units > 1e-10 ? units * quote : 0;
    series.push({date:point.date,value,wealth:value + point.returned,profit:value + point.returned - point.added});
  }
  const closing = series.at(-1)!;
  return { status:'ready' as const, value:closing.value, profit:closing.profit, series, annual:investorXirr([...primary.flows,{date:primary.end,amount:closing.value}]) };
}
