import React, { useState } from 'react';

interface Props {
  ticker: string;
  size?: number;
}

const TickerLogo: React.FC<Props> = ({ ticker, size = 28 }) => {
  const [failed, setFailed] = useState(false);

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
