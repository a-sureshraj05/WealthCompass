import type { PerformanceSnapshot } from '../components/Dashboard/Performance/performanceModel';

// DESIGN DATA ONLY. Both series are simulated, including the SPY benchmark.
// These are not historical SPY prices, total returns, or a portfolio backtest.
export const PERFORMANCE_AS_OF = '2026-11-01';
export const PERFORMANCE_FIRST_YEAR = 2020;
function buildSampleHistory(): PerformanceSnapshot[] {
  const portfolioDrift: Record<number, number> = { 2020: .118, 2021: .196, 2022: -.128, 2023: .174, 2024: .146, 2025: .132, 2026: .098 };
  const spyDrift: Record<number, number> = { 2020: .084, 2021: .161, 2022: -.162, 2023: .148, 2024: .123, 2025: .114, 2026: .082 };
  const flows: Record<string, [number, number]> = {
    '2020-03-16': [9000, 0], '2021-06-07': [7000, 0], '2022-02-09': [0, 4500],
    '2023-04-11': [12000, 0], '2024-08-14': [0, 9000], '2025-05-06': [6000, 0],
    '2026-02-12': [8500, 0], '2026-08-12': [0, 5500],
  };
  let value = 55000;
  let spyIndex = 100;
  let count = 0;
  const history: PerformanceSnapshot[] = [{ date: '2019-12-31', value, deposits: 0, withdrawals: 0, spyTotalReturnIndex: spyIndex }];
  for (let time = Date.parse('2020-01-01'); time <= Date.parse(PERFORMANCE_AS_OF); time += 86400000) {
    const date = new Date(time);
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;
    const day = date.toISOString().slice(0, 10);
    const wave = Math.sin(count * .113) * .0017 + Math.cos(count * .041) * .0011;
    const [deposits, withdrawals] = flows[day] || [0, 0];
    value = value * Math.exp(Math.log1p(portfolioDrift[date.getUTCFullYear()]) / 252 + wave * .85) + deposits - withdrawals;
    spyIndex *= Math.exp(Math.log1p(spyDrift[date.getUTCFullYear()]) / 252 + wave);
    history.push({ date: day, value, deposits, withdrawals, spyTotalReturnIndex: spyIndex });
    count++;
  }
  // Match the fictional overview's ending balance; scale all balances and flows
  // together so the history and reconciliation remain internally consistent.
  const scale = 212995.75 / history.at(-1)!.value;
  const cents = (n: number) => Math.round(n * 100) / 100;
  return history.map(point => ({ ...point, value: cents(point.value * scale), deposits: cents(point.deposits * scale), withdrawals: cents(point.withdrawals * scale) }));
}

export const performanceSnapshots: PerformanceSnapshot[] = /* @__PURE__ */ buildSampleHistory();
