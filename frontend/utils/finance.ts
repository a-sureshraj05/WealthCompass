// Shared financial calculation utilities

export const OPTIONS_MULTIPLIER = 100; // 1 contract = 100 underlying shares

const BROKERAGE_COLORS: Record<string, string> = {
  'robinhood':             '#00C805',
  'fidelity':              '#497B55',
  'schwab':                '#00A0DF',
  'td ameritrade':         '#00A651',
  'etrade':                '#6633CC',
  'e*trade':               '#6633CC',
  'vanguard':              '#922222',
  'interactive brokers':   '#E8342C',
  'webull':                '#00B2FF',
  'merrill':               '#D4372C',
  'ally invest':           '#7B2D8B',
};

// Fallback palette for unknown brokerages — maximally distinct
const FALLBACK_COLORS = ['#0F52BA', '#34C759', '#FF9500', '#FF2D55', '#AF52DE', '#5AC8FA', '#6E6E73'];

export function brokerageColor(name: string, fallbackIndex: number = 0): string {
  return BROKERAGE_COLORS[name.toLowerCase()] ?? FALLBACK_COLORS[fallbackIndex % FALLBACK_COLORS.length];
}

export function optionsMultiplier(assetType: string | null | undefined): number {
  return (assetType || '').toLowerCase() === 'options' ? OPTIONS_MULTIPLIER : 1;
}

export function formatCurrency(value: number): string {
  return `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
