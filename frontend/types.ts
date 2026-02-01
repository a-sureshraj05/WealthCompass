
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
  // These might be computed on the frontend or fetched separately
  avgPrice?: number; 
  currentPrice?: number;
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
