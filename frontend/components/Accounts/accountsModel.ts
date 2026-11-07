export const MAX_STATEMENT_BYTES = 5 * 1024 * 1024;
export type SyncScope = 'all' | 'selected';
export type SyncPeriod = 'history' | 'ytd' | 'custom';

export function normalizeSyncTickers(input: string): string[] {
  return [...new Set(input.toUpperCase().split(/[\s,;]+/).filter(Boolean))];
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

export function buildSyncRequest({ scope, selectedIds, availableIds, period, start, end, tickerInput, now = new Date() }: {
  scope: SyncScope; selectedIds: string[]; availableIds: string[]; period: SyncPeriod;
  start: string; end: string; tickerInput: string; now?: Date;
}) {
  const accountIds = [...new Set(scope === 'all' ? availableIds : selectedIds)];
  if (!accountIds.length) throw new Error('Select at least one account to synchronize.');
  if (accountIds.some(id => !availableIds.includes(id))) throw new Error('The account list has changed. Refresh accounts and select again.');
  let startDate: string | undefined;
  let endDate: string | undefined;
  if (period === 'ytd') {
    const year = now.getFullYear();
    startDate = `${year}-01-01`;
    endDate = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  } else if (period === 'custom') {
    if (!start && !end) throw new Error('Enter a start or end date for the custom period.');
    if ((start && !validDate(start)) || (end && !validDate(end))) throw new Error('Enter valid dates.');
    if (start && end && start > end) throw new Error('The start date must be on or before the end date.');
    startDate = start || undefined;
    endDate = end || undefined;
  }
  const tickers = normalizeSyncTickers(tickerInput);
  // Always pass explicit provider IDs. An empty scope must never mean all accounts.
  return { accountIds, startDate, endDate, tickers: tickers.length ? tickers : undefined };
}

export function validateStatementFile(file: { name: string; size: number }): void {
  if (!/\.(csv|txt)$/i.test(file.name)) throw new Error('Choose a .csv or .txt export. PDF and spreadsheet files are not supported.');
  if (file.size > MAX_STATEMENT_BYTES) throw new Error('Choose a statement smaller than 5 MB.');
  if (!file.size) throw new Error('This file is empty. Choose another export.');
}
