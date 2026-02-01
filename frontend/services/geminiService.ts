import { StockHolding } from "../types";

export const parseStatement = async (text: string, brokerageName: string): Promise<StockHolding[]> => {
  const response = await fetch("/api/ai/parse-statement", {
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
  return parsedData.map((item: any) => ({
    ...item,
    id: Math.random().toString(36).substr(2, 9),
    brokerage: brokerageName
  }));
};

export const getPortfolioInsights = async (holdings: StockHolding[]): Promise<string> => {
  if (holdings.length === 0) return "Add holdings to get AI insights.";

  // This will be implemented in the backend in the next step.
  return "Insights are not yet implemented in the new architecture.";
};
