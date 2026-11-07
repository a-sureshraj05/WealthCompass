import React, { useState } from 'react';
import PreviewHoldingPerformance from '../../../preview/PreviewHoldingPerformance';
import { previewHoldings, previewTransactions } from '../../../preview/data';
import TickerTypeContext from '../../../contexts/TickerTypeContext';

const sampleTypes = Object.fromEntries(previewHoldings.filter(row => row.assetType !== 'Options').map(row => [row.ticker,row.assetType || 'Equity']));
/** Staging example deliberately accepts no account holdings or transactions. */
export default function SampleHoldingPerformance({ numbersVisible }: { numbersVisible:boolean }) {
  const [brokerages,setBrokerages] = useState<string[]>([]);
  return <TickerTypeContext.Provider value={sampleTypes}><PreviewHoldingPerformance presentation="staging-sample" holdings={previewHoldings} transactions={previewTransactions} selectedBrokerages={brokerages} onBrokeragesChange={setBrokerages} numbersVisible={numbersVisible} /></TickerTypeContext.Provider>;
}
