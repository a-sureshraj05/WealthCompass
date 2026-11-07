import type { StockHolding } from '../types';
import { portfolioModel } from '../components/Dashboard/portfolioModel.ts';

/** Deterministic observations for the design preview; never calls an AI service. */
export function sampleInsightSnapshot(holdings: StockHolding[], cash: Record<string, number>) {
  const model = portfolioModel(holdings, cash);
  const largest = model.tickers.find(position => position.value > 0);
  const gaining = holdings.filter(h => Number.isFinite(h.marketValue) && Number.isFinite(h.totalCost) && h.marketValue > h.totalCost).length;
  const losing = holdings.filter(h => Number.isFinite(h.marketValue) && Number.isFinite(h.totalCost) && h.marketValue < h.totalCost).length;
  const concentration = largest && model.allocationTotal > 0
    ? `${largest.ticker} represents ${(largest.value / model.allocationTotal * 100).toFixed(1)}% of positive invested assets. Your five largest holdings together represent ${model.topFivePercent.toFixed(1)}%.`
    : 'There are no positive invested assets to compare yet. Add priced positions to explore concentration.';
  const cashContext = model.cashValue < 0
    ? 'The sample portfolio has a negative cash / margin balance. This reduces net portfolio value and is shown separately from invested assets.'
    : model.totalValue > 0
      ? `Cash represents ${(model.cashValue / model.totalValue * 100).toFixed(1)}% of net portfolio value, alongside investments across ${model.brokers.length} brokerages. It is excluded from the investment allocation chart.`
      : 'There is no positive net portfolio value available for a cash percentage yet.';
  const gains = `${gaining} brokerage ${gaining === 1 ? 'position is' : 'positions are'} above cost and ${losing} ${losing === 1 ? 'is' : 'are'} below cost. Review the individual tax lots to understand the short- and long-term breakdown.`;
  const observations = holdings.length ? [
    { title: 'Position concentration', text: concentration, target: 'holdings' as const, ticker: largest?.ticker },
    { title: 'Cash in context', text: cashContext, target: 'holdings' as const },
    { title: 'Gains beneath the total', text: gains, target: 'gains' as const },
  ] : [];
  return {
    observations,
    answer(question: string) {
      if (!holdings.length) return 'Add fictional holdings to explore the sample portfolio.';
      if (/largest|concentrat|position mix/i.test(question)) return concentration;
      if (/cash|margin/i.test(question)) return cashContext;
      if (/gain|loss|cost|tax lot/i.test(question)) return gains;
      return 'This sample Q&A supports questions about the largest holding, cash and the mix of gains and losses. It uses fictional data and does not contact an AI service. The signed-in portfolio chat supports broader questions.';
    },
  };
}
