export type LabelTone = 'blue' | 'violet' | 'teal' | 'amber' | 'slate';
export type LabelIcon = 'stock' | 'fund' | 'option' | 'cash' | 'crypto' | 'other' | 'buy' | 'sell' | 'income' | 'reinvest' | 'transferIn' | 'transferOut' | 'fee' | 'event';
export interface TransactionLabel { label: string; tone: LabelTone; icon: LabelIcon }

const ASSETS: Record<string, TransactionLabel> = {
  EQUITY: { label: 'Stock', tone: 'blue', icon: 'stock' },
  STOCK: { label: 'Stock', tone: 'blue', icon: 'stock' },
  ETF: { label: 'ETF', tone: 'slate', icon: 'fund' },
  OPTIONS: { label: 'Options', tone: 'violet', icon: 'option' },
  CASH: { label: 'Cash', tone: 'teal', icon: 'cash' },
  CRYPTO: { label: 'Crypto', tone: 'amber', icon: 'crypto' },
  OTHER: { label: 'Other', tone: 'slate', icon: 'other' },
};

const ACTIONS: Record<string, TransactionLabel> = {
  BUY: { label: 'Buy', tone: 'blue', icon: 'buy' },
  SELL: { label: 'Sell', tone: 'violet', icon: 'sell' },
  BTO: { label: 'Buy to open', tone: 'blue', icon: 'buy' },
  BTC: { label: 'Buy to close', tone: 'blue', icon: 'buy' },
  STO: { label: 'Sell to open', tone: 'violet', icon: 'sell' },
  STC: { label: 'Sell to close', tone: 'violet', icon: 'sell' },
  DEPOSIT: { label: 'Deposit', tone: 'teal', icon: 'transferIn' },
  WITHDRAWAL: { label: 'Withdrawal', tone: 'slate', icon: 'transferOut' },
  CONTRIBUTION: { label: 'Contribution', tone: 'teal', icon: 'transferIn' },
  REI: { label: 'Reinvest', tone: 'teal', icon: 'reinvest' },
  DIV: { label: 'Dividend', tone: 'teal', icon: 'income' },
  DIVIDEND: { label: 'Dividend', tone: 'teal', icon: 'income' },
  INTEREST: { label: 'Interest', tone: 'teal', icon: 'income' },
  FEE: { label: 'Fee', tone: 'amber', icon: 'fee' },
  // TRANSFER is the existing ledger's outgoing-share action.
  TRANSFER: { label: 'Transfer out', tone: 'slate', icon: 'transferOut' },
  EXTERNAL_ASSET_TRANSFER_IN: { label: 'Transfer in', tone: 'slate', icon: 'transferIn' },
  EXTERNAL_ASSET_TRANSFER_OUT: { label: 'Transfer out', tone: 'slate', icon: 'transferOut' },
  OPTIONEXPIRATION: { label: 'Expired', tone: 'slate', icon: 'event' },
  OPTIONEXERCISE: { label: 'Exercised', tone: 'slate', icon: 'event' },
  OPTIONASSIGNMENT: { label: 'Assigned', tone: 'slate', icon: 'event' },
  SPLIT: { label: 'Stock split', tone: 'slate', icon: 'reinvest' },
};

// Display metadata only. Filters, edits and calculations still use source values.
export function assetTypeLabel(value: string | null | undefined): TransactionLabel {
  const raw = value?.trim() || '';
  return ASSETS[raw.toUpperCase()] || { label: raw || 'Unspecified', tone: 'slate', icon: 'other' };
}

export function actionLabel(value: string | null | undefined): TransactionLabel {
  const raw = value?.trim() || '';
  return ACTIONS[raw.toUpperCase()] || { label: raw || 'Unspecified', tone: 'slate', icon: 'event' };
}
