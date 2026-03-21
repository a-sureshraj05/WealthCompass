import { StockHolding, Transaction, RealizedGain, UnrealizedLot } from "../types";

export const parseStatement = async (text: string, brokerageName: string): Promise<Transaction[]> => {
  const response = await fetch("/api/v1/import/parse-statement", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, brokerageName }),
  });

  if (!response.ok) {
    throw new Error("Failed to parse statement");
  }

  const parsedData = await response.json();
  // Assuming the backend now returns { message, transactions } or similar
  return parsedData.transactions.map((item: any) => ({
    ...item,
    id: String(item.id), // Ensure ID is a string
    // No longer mapping costPerShare to avgPrice for frontend compatibility here as it's a transaction
    // currentPrice is also not applicable for transactions
  }));
};

export const fetchHoldings = async (): Promise<StockHolding[]> => {
  const response = await fetch("/api/v1/holdings");
  if (!response.ok) {
    throw new Error(`Failed to fetch holdings: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data.map((item: any) => ({
    ...item,
    id: String(item.id), // Ensure ID is a string
    averageCostPerShare: item.averageCostPerShare,
    currentPrice: item.currentPrice,
    marketValue: item.marketValue,
  }));
};

export const fetchTransactions = async (
  brokerages?: string[],
  tickers?: string[],
  startDate?: string | null,
  endDate?: string | null
): Promise<Transaction[]> => {
  const params = new URLSearchParams();
  params.append("visibility", "all"); // always fetch all so frontend can filter active/hidden
  if (brokerages && brokerages.length > 0) {
    brokerages.forEach(b => params.append("brokerages", b));
  }
  if (tickers && tickers.length > 0) {
    tickers.forEach(t => params.append("tickers", t));
  }
  if (startDate) {
    params.append("start_date", startDate);
  }
  if (endDate) {
    params.append("end_date", endDate);
  }

  const url = `/api/v1/transactions?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data.map((item: any) => ({ ...item, id: String(item.id), is_deleted: !!item.is_deleted, is_override: !!item.is_override }));
};

export const updateTransaction = async (id: string, updates: {
  date?: string; brokerage?: string; ticker?: string; name?: string; action?: string;
  quantity?: number; price?: number; costPerShare?: number; totalCost?: number; assetType?: string;
}): Promise<void> => {
  const response = await fetch(`/api/v1/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error(`Failed to update transaction: ${response.status}`);
};

export const revertTransaction = async (id: string): Promise<void> => {
  console.log('[revertTransaction] POST', `/api/v1/transactions/${id}/revert`);
  const response = await fetch(`/api/v1/transactions/${id}/revert`, { method: "POST" });
  console.log('[revertTransaction] status:', response.status);
  if (!response.ok) throw new Error(`Failed to revert transaction: ${response.status}`);
  const data = await response.json();
  console.log('[revertTransaction] response:', data);
};

export const softDeleteTransaction = async (id: string, isDeleted: boolean): Promise<void> => {
  const response = await fetch(`/api/v1/transactions/${id}/hidden?is_deleted=${isDeleted}`, {
    method: "PATCH",
  });
  if (!response.ok) {
    throw new Error(`Failed to update transaction: ${response.status} ${response.statusText}`);
  }
};

export const removeTransaction = async (id: string): Promise<void> => {
  const response = await fetch(`/api/v1/transactions/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to remove transaction: ${response.status} ${response.statusText}`);
  }
};

export const fetchRealizedGains = async (): Promise<RealizedGain[]> => {
  const response = await fetch("/api/v1/realized-gains");
  if (!response.ok) {
    throw new Error(`Failed to fetch realized gains: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data.map((item: any) => ({ ...item, id: String(item.id) }));
};

export const fetchUnrealizedGains = async (): Promise<UnrealizedLot[]> => {
  const response = await fetch("/api/v1/unrealized-gains");
  if (!response.ok) {
    throw new Error(`Failed to fetch unrealized gains: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data.map((item: any) => ({ ...item, id: String(item.id), gain: item.unrealizedGain }));
};

export const getPortfolioInsights = async (holdings: StockHolding[]): Promise<string> => {
  if (holdings.length === 0) return "Add holdings to get AI insights.";

  // This will be implemented in the backend in the next step.
  return "Insights are not yet implemented in the new architecture.";
};

export const createPlaidLinkToken = async (): Promise<string> => {
  const response = await fetch("/api/v1/plaid/create-link-token", { method: "POST" });
  if (!response.ok) throw new Error("Failed to create Plaid link token");
  const data = await response.json();
  return data.link_token;
};

export const exchangePlaidToken = async (publicToken: string, brokerage: string): Promise<void> => {
  const response = await fetch("/api/v1/plaid/exchange-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_token: publicToken, brokerage }),
  });
  if (!response.ok) throw new Error("Failed to exchange Plaid token");
};

export const syncPlaidTransactions = async (): Promise<{ message: string }> => {
  const response = await fetch("/api/v1/plaid/sync", { method: "POST" });
  if (!response.ok) throw new Error("Failed to sync Plaid transactions");
  return response.json();
};

export const fetchConnectedBrokerages = async (): Promise<{ id: number; brokerage: string }[]> => {
  const response = await fetch("/api/v1/plaid/connected-brokerages");
  if (!response.ok) throw new Error("Failed to fetch connected brokerages");
  return response.json();
};

export const getBrokerageConnectUrl = async (brokerage: string): Promise<string> => {
  const response = await fetch(`/api/v1/brokerage/connect-url?brokerage=${encodeURIComponent(brokerage)}`);
  if (!response.ok) throw new Error("Failed to get connect URL");
  const data = await response.json();
  return data.url;
};

export const fetchBrokerageConnections = async (): Promise<{ id: number; brokerage: string }[]> => {
  const response = await fetch("/api/v1/brokerage/connections");
  if (!response.ok) throw new Error("Failed to fetch connections");
  return response.json();
};

export const deleteBrokerageConnection = async (authorizationId: string): Promise<void> => {
  const response = await fetch(`/api/v1/brokerage/connections/${authorizationId}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Failed to delete connection");
};

export const syncBrokerageTransactions = async (): Promise<{ message: string }> => {
  const response = await fetch("/api/v1/brokerage/sync", { method: "POST" });
  if (!response.ok) throw new Error("Failed to sync transactions");
  return response.json();
};

export const resetTransactions = async (): Promise<void> => {
  const response = await fetch("/api/v1/transactions/reset", { method: "POST" });
  if (!response.ok) throw new Error(`Failed to reset transactions: ${response.status}`);
};

export interface AnalystData {
  ticker: string;
  currentPrice?: number;
  targetLow?: number;
  targetHigh?: number;
  targetMedian?: number;
  targetMean?: number;
  analystCount?: number;
  recommendation?: string;
  sector?: string;
}

export const fetchAnalystData = async (tickers: string[]): Promise<AnalystData[]> => {
  const response = await fetch("/api/v1/analyst/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tickers),
  });
  if (!response.ok) throw new Error("Failed to fetch analyst data");
  return response.json();
};

export const fetchCashBalance = async (): Promise<number> => {
  const response = await fetch("/api/v1/cash-balance");
  if (!response.ok) throw new Error("Failed to fetch cash balance");
  const data = await response.json();
  return data.balance;
};

export const triggerRealizedGainsProcess = async (): Promise<void> => {
  const response = await fetch("/api/v1/realized-gains/process", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to trigger realized gains processing: ${response.status} ${response.statusText}`);
  }
};
