
export interface StockHolding {
  id: string;
  ticker: string;
  name: string;
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  brokerage: string;
  category: string;
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
