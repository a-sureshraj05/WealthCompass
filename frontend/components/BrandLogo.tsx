import React from 'react';
import compassMark from '../assets/wealthcompass-mark.svg';
import './brand-logo.css';

interface Props {
  compact?: boolean;
  tagline?: boolean;
  size?: number;
  className?: string;
}

/** One vector identity for the expanded sidebar, icon rail, and sign-in page. */
export default function BrandLogo({ compact = false, tagline = false, size = 36, className = '' }: Props) {
  return <span className={`wealthcompass-brand ${className}`} role="img" aria-label="WealthCompass">
    <img src={compassMark} width={size} height={size} className="wealthcompass-mark" alt="" aria-hidden="true" />
    {!compact && <span className="wealthcompass-brand-copy" aria-hidden="true"><span className="wealthcompass-wordmark">Wealth<span>Compass</span></span>{tagline && <span className="wealthcompass-tagline">PORTFOLIO INTELLIGENCE</span>}</span>}
  </span>;
}
