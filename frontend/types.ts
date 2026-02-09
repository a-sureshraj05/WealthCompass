export interface StockHolding {
  id: string;
  brokerage: string;
  date: string; // Assuming ISO date string from backend
  ticker: string;
  name: string;
  action: string; // e.g., 'Buy', 'Sell'
  quantity: number;
  costPerShare: number; // Corresponds to backend's costPerShare
  totalCost: number;
  // avgPrice and currentPrice will be derived or fetched separately if needed.
}

export interface PortfolioStats {
  totalValue: number;
  totalGain: number;
  gainPercentage: number;
  dayChange: number;
  dayChangePercentage: number;
}

export interface AnalysisInsight {
  title: string;
  content: string;
  type: 'positive' | 'warning' | 'neutral';
}

export interface BrokerageInfo {
  name: string;
  color: string;
  icon: string;
}

export type DateRangeType = 'all' | '30d' | '90d' | 'ytd' | 'custom';

export interface Transaction {
  id: string;
  date: string; // ISO date string
  type: 'BUY' | 'SELL' | 'BTO'; // Or more types if applicable
  quantity: number;
  price: number;
  brokerage: string;
  ticker: string;
  name: string;
  action: string;
  costPerShare: number; // Corresponds to backend's costPerShare
  totalCost: number;
}

export interface RealizedGain {
  id: string;
  ticker: string;
  buyDate: string;
  sellDate: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  gain: number;
  isLongTerm: boolean;
  brokerage: string;
}

export interface UnrealizedLot {
  id: string;
  ticker: string;
  buyDate: string;
  quantity: number;
  buyPrice: number;
  currentPrice: number;
  gain: number;
  isLongTerm: boolean;
  brokerage: string;
}