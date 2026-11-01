type NumericValue = number | null | undefined;
const finite = (value: NumericValue): value is number => typeof value === 'number' && Number.isFinite(value);
const quantity = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8 });
const tinyQuantity = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 8 });
const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const smallPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 8 });
const tinyPrice = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumSignificantDigits: 8 });
const percentage = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Display precision only; quantities used for calculations and edits are untouched. */
export function formatHoldingQuantity(value: NumericValue): string {
  if (!finite(value)) return '—';
  if (value === 0) return '0';
  return (Math.abs(value) < 1e-8 ? tinyQuantity : quantity).format(value);
}

export function formatHoldingAmount(value: NumericValue): string {
  if (!finite(value)) return '—';
  return amount.format(Math.abs(value) < .005 ? 0 : value);
}

/** Keep meaningful sub-cent price/strike precision while displaying at least cents. */
export function formatHoldingPrice(value: NumericValue): string {
  if (!finite(value)) return '—';
  if (value === 0) return '$0.00';
  const magnitude = Math.abs(value);
  return (magnitude < 1e-8 ? tinyPrice : magnitude < .0001 ? smallPrice : price).format(value);
}

/** Input is already expressed in percent, e.g. 12.5 => 12.50%. */
export function formatHoldingPercent(value: NumericValue): string {
  if (!finite(value)) return '—';
  return `${percentage.format(Math.abs(value) < .005 ? 0 : value)}%`;
}

/** Financial lot dates are date-only records, not instants to shift to local time. */
export function formatHoldingDate(value: string | null | undefined): string {
  const day = value?.slice(0, 10) || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '—';
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : '—';
}
