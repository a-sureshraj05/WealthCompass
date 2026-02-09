import { StockHolding, Transaction, RealizedGain } from "../types";

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
    avgPrice: item.costPerShare, // Map backend's costPerShare to avgPrice for frontend compatibility
    currentPrice: undefined, // Current price not available from this endpoint
  }));
};

export const fetchTransactions = async (
  brokerages?: string[],
  tickers?: string[],
  startDate?: string | null,
  endDate?: string | null
): Promise<Transaction[]> => {
  const params = new URLSearchParams();
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

  const queryString = params.toString();
  const url = `/api/v1/transactions${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch transactions: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  return data.map((item: any) => ({ ...item, id: String(item.id), type: item.action }));
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

export const getPortfolioInsights = async (holdings: StockHolding[]): Promise<string> => {
  if (holdings.length === 0) return "Add holdings to get AI insights.";

  // This will be implemented in the backend in the next step.
  return "Insights are not yet implemented in the new architecture.";
};

export const triggerRealizedGainsProcess = async (): Promise<void> => {
  const response = await fetch("/api/v1/realized-gains/process", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to trigger realized gains processing: ${response.status} ${response.statusText}`);
  }
};
