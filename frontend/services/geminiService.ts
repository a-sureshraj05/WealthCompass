import { StockHolding } from "../types";

export const parseStatement = async (text: string, brokerageName: string): Promise<StockHolding[]> => {
  const response = await fetch("/api/v1/manual/parse-statement", {
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
  // Assuming the backend now returns { message, holdings } or similar
  return parsedData.holdings.map((item: any) => ({
    ...item,
    id: String(item.id), // Ensure ID is a string
    avgPrice: item.costPerShare, // Map backend's costPerShare to avgPrice for frontend compatibility
    currentPrice: undefined, // Current price not available from this endpoint
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

export const getPortfolioInsights = async (holdings: StockHolding[]): Promise<string> => {
  if (holdings.length === 0) return "Add holdings to get AI insights.";

  // This will be implemented in the backend in the next step.
  return "Insights are not yet implemented in the new architecture.";
};
