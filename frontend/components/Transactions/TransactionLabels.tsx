import React from 'react';
import { assetTypeLabel, actionLabel } from './labelPresentation';
import type { LabelIcon } from './labelPresentation';
import './transaction-labels.css';

const ICONS: Record<LabelIcon, string> = {
  stock: 'M4 19V5m0 14h16M8 14l4-5 4 3 4-7',
  fund: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  option: 'M4 5h16v14H4zM9 9h6m-6 6h6M12 7v10',
  cash: 'M3 6h18v12H3zM7 10h.01M17 14h.01M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
  crypto: 'm12 3 7 9-7 9-7-9 7-9Zm-7 9 7 3 7-3',
  other: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
  buy: 'M17 7 7 17M7 7v10h10',
  sell: 'M7 17 17 7M7 7h10v10',
  income: 'M12 4v16m-4-5c0 2 8 2 8-1s-8-2-8-5 8-3 8-1',
  reinvest: 'M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 11-1l3 6M4 12l3 6a7 7 0 0 0 11-1',
  transferIn: 'M14 4h6v16h-6M3 12h12m-4-4 4 4-4 4',
  transferOut: 'M10 4H4v16h6m0-8h11m-4-4 4 4-4 4',
  fee: 'M5 5h14v14H5zM8 12h8',
  event: 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-4v4l3 2',
};

function LabelIcon({ icon }: { icon: LabelIcon }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONS[icon]} /></svg>;
}

export function AssetTypeValue({ value }: { value: string | null | undefined }) {
  const presentation = assetTypeLabel(value);
  return <span className="txn-asset-value" title={`Asset type: ${value?.trim() || 'not provided'}`}>
    <span className={`txn-asset-icon txn-tone-${presentation.tone}`}><LabelIcon icon={presentation.icon} /></span>
    <span>{presentation.label}</span>
  </span>;
}

export function ActionValue({ value }: { value: string | null | undefined }) {
  const presentation = actionLabel(value);
  return <span className={`txn-action-value txn-tone-${presentation.tone}`} title={`Action: ${value?.trim() || 'not provided'}`}>
    <LabelIcon icon={presentation.icon} /><span>{presentation.label}</span>
  </span>;
}
