import React, { useMemo, useState } from 'react';
import type { StockHolding } from '../types';
import InsightsPanel from '../components/Dashboard/Insights/InsightsPanel';
import AIChat from '../components/Dashboard/AIChat';
import { sampleInsightSnapshot } from './insights';

export default function PreviewInsights({ holdings, cashByBrokerage, numbersVisible, scopeFiltered, onOpenHoldings, onOpenGains }: {
  holdings: StockHolding[]; cashByBrokerage: Record<string, number>; numbersVisible: boolean; scopeFiltered: boolean;
  onOpenHoldings: (ticker?: string) => void; onOpenGains: () => void;
}) {
  const snapshot = useMemo(() => sampleInsightSnapshot(holdings, cashByBrokerage), [holdings, cashByBrokerage]);
  const [chatOpen, setChatOpen] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const items = snapshot.observations.map(item => ({
    title: item.title, text: item.text, action: {
      label: item.target === 'gains' ? 'Explore gains & losses' : item.ticker ? `Review ${item.ticker}` : 'Review holdings',
      onClick: () => item.target === 'gains' ? onOpenGains() : onOpenHoldings(item.ticker),
    }
  }));
  return <InsightsPanel items={items} sample hasHoldings={holdings.length > 0} numbersVisible={numbersVisible}
    scopeFiltered={scopeFiltered} generatedAt={refreshedAt} onGenerate={() => setRefreshedAt(Date.now() / 1000)}
    onAsk={() => setChatOpen(true)} onOpenHoldings={() => onOpenHoldings()} onOpenGains={onOpenGains}>
    {chatOpen && numbersVisible && <AIChat open onClose={() => setChatOpen(false)} preview previewReply={snapshot.answer} />}
  </InsightsPanel>;
}
