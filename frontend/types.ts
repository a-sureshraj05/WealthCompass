export interface StockHolding {
  id: string;
  brokerage: string;
  ticker: string;
  quantity: number;
  averageCostPerShare: number;
  totalCost: number;
  currentPrice: number;
  marketValue: number;
  assetType?: string;
  sector?: string;
}

export interface PortfolioStats {
  totalValue: number;
  investmentValue: number;
  totalGain: number;
  gainPercentage: number;
  dayChange: number;
  dayChangePercentage: number;
  buyingPower: number;
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
  quantity: number;
  price: number;
  brokerage: string;
  ticker: string;
  name: string;
  action: string;
  costPerShare: number;
  totalCost: number;
  assetType: string;
  is_deleted: boolean;
  is_override: boolean;
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
  assetType?: string;
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
  assetType?: string;
}