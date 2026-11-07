export interface HoldingLine {
  key: string;
  label: string;
  color: string;
  benchmark?: boolean;
  activityDates?: string[];
  series: readonly { date: string; profit: number; wealth: number }[];
}

/** Calendar-aligned personal histories. No value is invented before entry or
 * after a closed position's exit; each stock keeps its own funding history. */
export function holdingComparisonPlot(lines: readonly HoldingLine[], metric: 'profit' | 'wealth') {
  const dates = [...new Set(lines.flatMap(line => line.series.map(point => point.date)))].sort();
  const indices = lines.map(line => new Map(line.series.map(point => [point.date, point[metric]])));
  return dates.map(date => ({ date, time: Date.parse(date), ...Object.fromEntries(lines.map((line, index) => [line.key, indices[index].get(date) ?? null])) })) as ({ date: string; time: number } & Record<string, string | number | null>)[];
}

export function sampleHoldingPlot<T extends { date: string }>(points: readonly T[], lines: readonly HoldingLine[]) {
  const boundaries = new Set(lines.flatMap(line => [line.series[0]?.date, line.series.at(-1)?.date, ...(line.activityDates || [])]));
  const stride = Math.max(1, Math.ceil(points.length / 260));
  return points.filter((point, index) => index % stride === 0 || index === points.length - 1 || boundaries.has(point.date));
}
