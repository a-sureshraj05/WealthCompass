import { StockHolding, Transaction, RealizedGain, UnrealizedLot } from "../types";

const getToken = () => localStorage.getItem("wc_token");

const authHeaders = (extra: Record<string, string> = {}): Record<string, string> => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}`, ...extra } : extra;
};

const apiFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers as Record<string, string> || {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem("wc_token");
    window.location.reload();
  }
  return res;
};

export const parseStatement = async (text: string, brokerageName: string): Promise<Transaction[]> => {
  const response = await apiFetch("/api/v1/import/parse-statement", {
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
  const response = await apiFetch("/api/v1/holdings");
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

  const response = await apiFetch(url);
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
  const response = await apiFetch(`/api/v1/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error(`Failed to update transaction: ${response.status}`);
};

export const revertTransaction = async (id: string): Promise<void> => {
  const response = await apiFetch(`/api/v1/transactions/${id}/revert`, { method: "POST" });
  if (!response.ok) throw new Error(`Failed to revert transaction: ${response.status}`);
  await response.json();
};

export const softDeleteTransaction = async (id: string, isDeleted: boolean): Promise<void> => {
  const response = await apiFetch(`/api/v1/transactions/${id}/hidden?is_deleted=${isDeleted}`, {
    method: "PATCH",
  });
  if (!response.ok) {
    throw new Error(`Failed to update transaction: ${response.status} ${response.statusText}`);
  }
};

export const removeTransaction = async (id: string): Promise<void> => {
  const response = await apiFetch(`/api/v1/transactions/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to remove transaction: ${response.status} ${response.statusText}`);
  }
};

export const fetchRealizedGains = async (): Promise<RealizedGain[]> => {
  const response = await apiFetch("/api/v1/realized-gains");
  if (!response.ok) {
    throw new Error(`Failed to fetch realized gains: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data.map((item: any) => ({ ...item, id: String(item.id) }));
};

export const fetchUnrealizedGains = async (): Promise<UnrealizedLot[]> => {
  const response = await apiFetch("/api/v1/unrealized-gains");
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
  const response = await apiFetch("/api/v1/plaid/create-link-token", { method: "POST" });
  if (!response.ok) throw new Error("Failed to create Plaid link token");
  const data = await response.json();
  return data.link_token;
};

export const exchangePlaidToken = async (publicToken: string, brokerage: string): Promise<void> => {
  const response = await apiFetch("/api/v1/plaid/exchange-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_token: publicToken, brokerage }),
  });
  if (!response.ok) throw new Error("Failed to exchange Plaid token");
};

export const syncPlaidTransactions = async (): Promise<{ message: string }> => {
  const response = await apiFetch("/api/v1/plaid/sync", { method: "POST" });
  if (!response.ok) throw new Error("Failed to sync Plaid transactions");
  return response.json();
};

export const fetchConnectedBrokerages = async (): Promise<{ id: number; brokerage: string }[]> => {
  const response = await apiFetch("/api/v1/plaid/connected-brokerages");
  if (!response.ok) throw new Error("Failed to fetch connected brokerages");
  return response.json();
};

export const getBrokerageConnectUrl = async (brokerage: string): Promise<string> => {
  const response = await apiFetch(`/api/v1/brokerage/connect-url?brokerage=${encodeURIComponent(brokerage)}`);
  if (!response.ok) throw new Error("Failed to get connect URL");
  const data = await response.json();
  return data.url;
};

export const fetchBrokerageConnections = async (): Promise<{ id: number; brokerage: string; authorization_id: string }[]> => {
  const response = await apiFetch("/api/v1/brokerage/connections");
  if (!response.ok) throw new Error("Failed to fetch connections");
  return response.json();
};

export const fetchBrokerageAccounts = async (): Promise<{ id: string; name: string; brokerage: string; authorization_id: string }[]> => {
  const response = await apiFetch("/api/v1/brokerage/accounts");
  if (!response.ok) throw new Error("Failed to fetch accounts");
  return response.json();
};

export const ignoreBrokerageAccount = async (accountId: string): Promise<void> => {
  const response = await apiFetch(`/api/v1/brokerage/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Failed to hide account");
};

export const deleteBrokerageConnection = async (authorizationId: string): Promise<void> => {
  const response = await apiFetch(`/api/v1/brokerage/connections/${authorizationId}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Failed to delete connection");
};

export const syncBrokerageTransactions = async (startDate?: string, endDate?: string, accountIds?: string[], tickers?: string[]): Promise<{ message: string }> => {
  const params = new URLSearchParams();
  if (startDate) params.append("start_date", startDate);
  if (endDate) params.append("end_date", endDate);
  if (accountIds && accountIds.length > 0) accountIds.forEach(id => params.append("account_ids", id));
  if (tickers && tickers.length > 0) tickers.forEach(t => params.append("tickers", t));
  const query = params.toString() ? `?${params.toString()}` : "";
  const response = await apiFetch(`/api/v1/brokerage/sync${query}`, { method: "POST" });
  if (!response.ok) throw new Error("Failed to sync transactions");
  return response.json();
};

export const deleteRawData = async (source?: 'manual' | 'snaptrade'): Promise<{ message: string }> => {
  const params = source ? `?source=${source}` : "";
  const response = await apiFetch(`/api/v1/transactions/raw${params}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Failed to delete raw data");
  return response.json();
};

export const clearProcessedData = async (): Promise<{ message: string }> => {
  const response = await apiFetch("/api/v1/transactions/clear", { method: "POST" });
  if (!response.ok) throw new Error("Failed to clear data");
  return response.json();
};

export const resetTransactions = async (brokerage?: string): Promise<void> => {
  const params = brokerage ? `?brokerage=${encodeURIComponent(brokerage)}` : "";
  const response = await apiFetch(`/api/v1/transactions/reset${params}`, { method: "POST" });
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
  const response = await apiFetch("/api/v1/analyst/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tickers),
  });
  if (!response.ok) throw new Error("Failed to fetch analyst data");
  return response.json();
};

export const fetchCashBalance = async (): Promise<number> => {
  const response = await apiFetch("/api/v1/cash-balance");
  if (!response.ok) throw new Error("Failed to fetch cash balance");
  const data = await response.json();
  return data.balance;
};

export const triggerRealizedGainsProcess = async (): Promise<void> => {
  const response = await apiFetch("/api/v1/realized-gains/process", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to trigger realized gains processing: ${response.status} ${response.statusText}`);
  }
};

// --- Lot Assignments ---

export interface OpenBuyLot {
  id: number;
  date: string;
  ticker: string;
  quantity: number;
  available_quantity: number;
  price: number;
  brokerage: string;
}

export interface LotAssignment {
  id: number;
  sell_transaction_id: number;
  buy_transaction_id: number;
  quantity: number;
}

export const fetchOpenBuys = async (sellTransactionId: string): Promise<OpenBuyLot[]> => {
  const response = await apiFetch(`/api/v1/lot-assignments/open-buys?sell_transaction_id=${sellTransactionId}`);
  if (!response.ok) throw new Error("Failed to fetch open buy lots");
  return response.json();
};

export const fetchLotAssignments = async (sellTransactionId?: string): Promise<LotAssignment[]> => {
  const query = sellTransactionId ? `?sell_transaction_id=${sellTransactionId}` : '';
  const response = await apiFetch(`/api/v1/lot-assignments${query}`);
  if (!response.ok) throw new Error("Failed to fetch lot assignments");
  return response.json();
};

export const createLotAssignment = async (
  sellTransactionId: string,
  buyTransactionId: number,
  quantity: number,
): Promise<LotAssignment> => {
  const response = await apiFetch("/api/v1/lot-assignments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sell_transaction_id: parseInt(sellTransactionId),
      buy_transaction_id: buyTransactionId,
      quantity,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create lot assignment");
  }
  return response.json();
};

export const deleteLotAssignment = async (assignmentId: number): Promise<void> => {
  const response = await apiFetch(`/api/v1/lot-assignments/${assignmentId}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Failed to delete lot assignment");
};

// --- Options ---

export interface OptionsPosition {
  id: number;
  brokerage: string;
  ticker: string;
  buyDate: string;
  quantity: number;
  retainQuantity: number;
  sellableQuantity: number;
  buyPrice: number;
  currentPrice: number;
  unrealizedGain: number;
  isLongTerm: boolean;
}

export interface OptionsCalculator {
  outstandingPremium: number;
  realizedLosses: number;
  currentYearShortTermGains: number;
  unrealizedGains: number;
  taxEstimate: number;
  totalNeeded: number;
  totalSellableValue: number;
  totalSellableQty: number;
  projectedGainPct: number | null;
  targetPricePerContract: number | null;
  taxYear: number;
}

export const fetchOptionsPositions = async (): Promise<OptionsPosition[]> => {
  const response = await apiFetch("/api/v1/options/positions");
  if (!response.ok) throw new Error("Failed to fetch options positions");
  return response.json();
};

export const updateOptionsRetain = async (
  brokerage: string,
  ticker: string,
  buyDate: string,
  retainQuantity: number,
): Promise<void> => {
  const response = await apiFetch("/api/v1/options/retain", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brokerage, ticker, buy_date: buyDate, retain_quantity: retainQuantity }),
  });
  if (!response.ok) throw new Error("Failed to update retain quantity");
};

export const fetchOptionsCalculator = async (): Promise<OptionsCalculator> => {
  const response = await apiFetch("/api/v1/options/calculator");
  if (!response.ok) throw new Error("Failed to fetch options calculator");
  return response.json();
};
