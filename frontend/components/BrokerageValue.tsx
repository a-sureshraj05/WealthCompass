import React from 'react';
import BrokerageMark from './BrokerageMark';
import './brokerage-value.css';

export default function BrokerageValue({ name, accountName, compact = false }: { name: string | null | undefined; accountName?: string | null; compact?: boolean }) {
  const label = name?.trim() || 'Unspecified brokerage';
  return <span className={`brokerage-value${compact ? ' is-compact' : ''}`} title={`Brokerage: ${label}${accountName ? ` · ${accountName}` : ''}`}>
    <span className="brokerage-value-mark"><BrokerageMark name={label} size={compact ? 18 : 21} decorative /></span>
    <span className="brokerage-value-copy"><strong>{label}</strong>{accountName && <small>{accountName}</small>}</span>
  </span>;
}

export function BrokerageRoute({ from, to, accountName }: { from: string; to?: string | null; accountName?: string | null }) {
  if (!to || to === from) return <BrokerageValue name={from} accountName={accountName} />;
  return <span className="brokerage-route" role="group" aria-label="Brokerage transfer">
    <BrokerageValue name={from} accountName={accountName} />
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12h16m-6-6 6 6-6 6" /></svg>
    <span className="brokerage-route-destination"><small>Now at</small><BrokerageValue name={to} compact /></span>
  </span>;
}
