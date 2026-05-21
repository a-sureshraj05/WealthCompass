import React, { createContext, useContext } from 'react';

// Maps ticker (uppercase) → assetType string e.g. "ETF", "Equity", "Options"
// Populated once from holdings in App.tsx; every TickerLogo reads from here.
const TickerTypeContext = createContext<Record<string, string>>({});

export const useTickerType = (ticker: string, propAssetType?: string): string => {
  const map = useContext(TickerTypeContext);
  // Context (from DB via holdings) takes priority — ensures DB changes propagate everywhere.
  // Prop is only used when context has no entry for this ticker.
  return map[ticker.toUpperCase()] || propAssetType || '';
};

export default TickerTypeContext;
