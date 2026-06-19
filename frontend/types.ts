export interface BrokerageAccount {
  id: number;
  snaptrade_account_id: string;
  brokerage: string;
  name: string;
}

export interface StockHolding {
  id: string;
  brokerage: string;
  account_id?: number | null;
  ticker: string;
  quantity: number;
  averageCostPerShare: number;
  totalCost: number;
  currentPrice: number;
  previousClose: number;
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
  price: number | null;
  brokerage: string;
  account_id?: number | null;
  ticker: string;
  name: string | null;
  action: string;
  costPerShare: number | null;
  totalCost: number | null;
  assetType: string | null;
  is_deleted: boolean;
  is_override: boolean;
  is_duplicate: boolean;
  is_backend_verified?: boolean;
  current_brokerage?: string | null;
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
  is_wash_sale?: boolean;
  wash_sale_disallowed_amount?: number;
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
  account_id?: number | null;
  assetType?: string;
  // Type 1: this lot absorbed a disallowed wash sale loss
  wash_sale_adjustment?: number;
  wash_sale_clear_date?: string | null;
  // Type 2: selling at a loss today would be disallowed (recent same-ticker buy exists)
  wash_sale_at_risk?: boolean;
  wash_sale_risk_trigger_date?: string | null;
  option_symbol?: string | null;
}