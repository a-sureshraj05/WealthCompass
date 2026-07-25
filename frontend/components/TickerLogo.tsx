import React, { useState } from 'react';
import { useTickerType } from '../contexts/TickerTypeContext';

interface Props {
  ticker: string;
  size?: number;
  assetType?: string;
}

const ETFIcon: React.FC<{ size: number }> = ({ size }) => {
  const pad = Math.round(size * 0.22);
  const inner = size - pad * 2;
  return (
    <span
      className="inline-flex items-center justify-center bg-[#0F52BA] rounded shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={inner}
        height={inner}
        viewBox="0 0 20 20"
        fill="white"
      >
        {/* 3 bars: short, tall, medium */}
        <rect x="1" y="10" width="5" height="9" rx="1" />
        <rect x="7.5" y="4" width="5" height="15" rx="1" />
        <rect x="14" y="7" width="5" height="12" rx="1" />
      </svg>
    </span>
  );
};

// Tickers where parqet returns a wrong logo — skip straight to FMP
const PARQET_BLOCKLIST = new Set(['SPCX']);

type LoadState = 'parqet' | 'fmp' | 'failed';

const TickerLogo: React.FC<Props> = ({ ticker, size = 28, assetType }) => {
  const [loadState, setLoadState] = useState<LoadState>(
    PARQET_BLOCKLIST.has(ticker) ? 'fmp' : 'parqet'
  );
  const resolvedType = useTickerType(ticker, assetType);
  const isETF = resolvedType.toUpperCase() === 'ETF';

  if (isETF) {
    return <ETFIcon size={size} />;
  }

  if (loadState === 'failed') {
    return (
      <span
        className="inline-flex items-center justify-center bg-[#1D1D1F] text-white font-bold rounded shrink-0"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}
      >
        {ticker.slice(0, 2)}
      </span>
    );
  }

  const src = loadState === 'parqet'
    ? `https://assets.parqet.com/logos/symbol/${ticker}?format=png`
    : `https://financialmodelingprep.com/image-stock/${ticker}.png`;

  const handleError = () =>
    setLoadState(prev => prev === 'parqet' ? 'fmp' : 'failed');

  return (
    <img
      key={src}
      src={src}
      alt={ticker}
      width={size}
      height={size}
      className="rounded object-contain shrink-0 bg-white"
      style={{ width: size, height: size }}
      onError={handleError}
    />
  );
};

export default TickerLogo;
