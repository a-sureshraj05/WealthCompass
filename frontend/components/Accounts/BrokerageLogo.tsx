import React from 'react';
import fidelity from '../../assets/brokerages/fidelity.png';
import schwab from '../../assets/brokerages/schwab.png';
import robinhood from '../../assets/brokerages/robinhood.png';
import vanguard from '../../assets/brokerages/vanguard.png';
import etrade from '../../assets/brokerages/etrade.png';

// Bundle the actual marks: rendering never depends on a public logo service.
const MARKS = { fidelity, schwab, robinhood, vanguard, etrade };

export default function BrokerageLogo({ name }: { name: string }) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const mark = Object.entries(MARKS).find(([key]) => normalized.includes(key))?.[1];
  return <span className="ac-broker-logo">
    {mark ? <img src={mark} alt={`${name} logo`} width="32" height="32" decoding="async" />
      : <svg role="img" aria-label={`${name} brokerage`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="m3 9 9-6 9 6H3Zm2 3v7m5-7v7m4-7v7m5-7v7M3 21h18" />
      </svg>}
  </span>;
}
