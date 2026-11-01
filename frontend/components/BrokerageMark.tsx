import React from 'react';
import fidelity from '../assets/brokerages/fidelity.png';
import schwab from '../assets/brokerages/schwab.png';
import robinhood from '../assets/brokerages/robinhood.png';
import vanguard from '../assets/brokerages/vanguard.png';
import etrade from '../assets/brokerages/etrade.png';

const MARKS = { fidelity, schwab, robinhood, vanguard, etrade };

/** Shared bundled marks for account management and table identities. */
export default function BrokerageMark({ name, size = 22, decorative = false }: { name: string; size?: number; decorative?: boolean }) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const mark = Object.entries(MARKS).find(([key]) => normalized.includes(key))?.[1];
  return mark ? <img src={mark} alt={decorative ? '' : `${name} logo`} width={size} height={size} decoding="async" />
    : <svg role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : `${name} brokerage`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="m3 9 9-6 9 6H3Zm2 3v7m5-7v7m4-7v7m5-7v7M3 21h18" />
    </svg>;
}
