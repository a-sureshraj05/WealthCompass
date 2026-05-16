import React, { useState } from 'react';

interface Props {
  ticker: string;
  size?: number;
  assetType?: string;
}

const ETFIcon: React.FC<{ size: number }> = ({ size }) => (
  <span
    className="inline-flex items-center justify-center bg-[#E6EEFB] rounded shrink-0"
    style={{ width: size, height: size }}
  >
    <svg
      width={Math.round(size * 0.55)}
      height={Math.round(size * 0.55)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#0F52BA"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  </span>
);

const TickerLogo: React.FC<Props> = ({ ticker, size = 28, assetType }) => {
  const [failed, setFailed] = useState(false);
  const isETF = (assetType || '').toUpperCase() === 'ETF';

  if (isETF) {
    return <ETFIcon size={size} />;
  }

  if (failed) {
    return (
      <span
        className="inline-flex items-center justify-center bg-[#1D1D1F] text-white font-bold rounded shrink-0"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}
      >
        {ticker.slice(0, 2)}
      </span>
    );
  }

  return (
    <img
      src={`https://financialmodelingprep.com/image-stock/${ticker}.png`}
      alt={ticker}
      width={size}
      height={size}
      className="rounded object-contain shrink-0 bg-white"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
};

export default TickerLogo;
