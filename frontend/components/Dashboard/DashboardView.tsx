import React, { useState, useEffect } from 'react';
import { StockHolding, PortfolioStats, Transaction, RealizedGain, UnrealizedLot } from '../../types';
import SummaryCards from './SummaryCards';
import PortfolioVisuals from './PortfolioVisuals';
import HoldingsView from '../HoldingsView';
import ImportDataView from '../ImportDataView';
import AIInsights from './AIInsights';
import TransactionsView from '../TransactionsView';
import GainsLossesView from '../GainsLossesView';
import OptionsView from '../OptionsView';
import TickerLogo from '../TickerLogo';

interface Props {
  activeTab: string;
  setActiveTab: (tab: 'dashboardView' | 'holdings' | 'importData' | 'transactions' | 'gainsLosses') => void;
  holdings: StockHolding[];
  transactions: Transaction[];
  realizedGains: RealizedGain[];
  unrealizedGains: UnrealizedLot[];
  stats: PortfolioStats;
  onAddTransactions: (t: Transaction[]) => void;
  onRefresh: () => void | Promise<unknown>;
  onRemoveHolding: (id: string) => void;
  onRemoveTransaction: (id: string) => void;
  onSoftDeleteTransaction: (id: string, isDeleted: boolean) => void;
  onUpdateTransaction: (id: string, updates: Partial<Transaction>) => void;
  onRevertTransaction: (id: string) => void;
  onResetData: (brokerage?: string) => void;
  onClearData: () => void;
  onSyncTransactions: () => Promise<string>;
  onProcessGains: () => void;
  setLoading: (l: boolean) => void;
  numbersVisible?: boolean;
  onToggleNumbers?: () => void;
  selectedBrokerages: string[];
  setSelectedBrokerages: (v: string[]) => void;
  selectedAssetTypes: string[];
  setSelectedAssetTypes: (v: string[]) => void;
  selectedTickers: string[];
  setSelectedTickers: (v: string[]) => void;
  allKnownBrokerages: string[];
  buyingPower: Record<string, number>;
  accounts: import('../../types').BrokerageAccount[];
}

const DashboardView: React.FC<Props> = ({
  activeTab,
  setActiveTab,
  holdings,
  transactions,
  realizedGains,
  unrealizedGains,
  stats,
  onAddTransactions,
  onRefresh,
  onRemoveHolding,
  onRemoveTransaction,
  onSoftDeleteTransaction,
  onUpdateTransaction,
  onRevertTransaction,
  onResetData,
  onClearData,
  onSyncTransactions,
  onProcessGains,
  setLoading,
  numbersVisible = true,
  onToggleNumbers,
  selectedBrokerages,
  setSelectedBrokerages,
  selectedAssetTypes,
  setSelectedAssetTypes,
  selectedTickers,
  setSelectedTickers,
  allKnownBrokerages,
  buyingPower,
  accounts,
}) => {
  const [syncMessage, setSyncMessage] = useState('');
  const [focusTicker, setFocusTicker] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  const [autoExpand, setAutoExpand] = useState<{ ticker: string; brokerage: string } | null>(null);
  const [holdingsViewMode, setHoldingsViewMode] = useState<'ticker' | 'brokerage'>('ticker');
  // Short-/long-term tax rates edited in the Gains & Losses tab, shared with the
  // Options table's Gain-to-Sell calculation (long positions taxed at the LT rate).
  const [stTaxRate, setStTaxRate] = useState<number>(37);
  const [ltTaxRate, setLtTaxRate] = useState<number>(20);
  // Term Type filter shared by the Equity (HoldingsView) and Options tables.
  const [selectedTerms, setSelectedTerms] = useState<('long' | 'short')[]>([]);

  useEffect(() => { setSyncMessage(''); }, [activeTab]);
  useEffect(() => { if (activeTab !== 'transactions') { setFocusTicker(null); setFocusDate(null); } }, [activeTab]);

  if (activeTab === 'importData') {
    return <ImportDataView onAddTransactions={onAddTransactions} onRefresh={onRefresh} setLoading={setLoading} initialTab="connect" />;
  }

  if (activeTab === 'holdings') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-[#1D1D1F]">Portfolio Holdings</h2>
          <button
            onClick={onProcessGains}
            className="px-4 py-2 text-sm font-medium text-[#0F52BA] hover:bg-[#F5F5F7] rounded transition-colors border border-[#D2D2D7]"
          >
            Refresh Data
          </button>
        </div>
        <HoldingsView
          title="Equity"
          numbersVisible={numbersVisible}
          holdings={holdings.filter(h => (h.assetType || '').toLowerCase() !== 'options')}
          unrealizedGains={unrealizedGains.filter(u => (u.assetType || '').toLowerCase() !== 'options')}
          realizedGains={realizedGains.filter(r => (r.assetType || '').toLowerCase() !== 'options')}
          onRemove={onRemoveHolding}
          autoExpand={autoExpand}
          onNavigateToTransactions={(ticker, brokerage, buyDate) => {
            setAutoExpand({ ticker, brokerage });
            setFocusTicker(ticker);
            setFocusDate(buyDate);
            setActiveTab('transactions');
          }}
          selectedBrokerages={selectedBrokerages} setSelectedBrokerages={setSelectedBrokerages}
          selectedAssetTypes={selectedAssetTypes} setSelectedAssetTypes={setSelectedAssetTypes}
          selectedTickers={selectedTickers} setSelectedTickers={setSelectedTickers}
          selectedTerms={selectedTerms} setSelectedTerms={setSelectedTerms}
          accounts={accounts}
          viewMode={holdingsViewMode}
          onViewModeChange={setHoldingsViewMode}
        />
        <div className="space-y-2">
          <div className="flex items-start justify-between">
            <h3 className="font-display text-2xl font-bold text-[#1D1D1F]">Options</h3>
            <p className="text-[10px] text-slate-400 mt-1 text-right">Gain to Sell uses ST {stTaxRate}% / LT {ltTaxRate}% rates<br />from the Gains &amp; Losses tab</p>
          </div>
          <OptionsView selectedBrokerages={selectedBrokerages} selectedTickers={selectedTickers} selectedTerms={selectedTerms} holdings={holdings} unrealizedGains={unrealizedGains} realizedGains={realizedGains} stTaxRate={stTaxRate} ltTaxRate={ltTaxRate} accounts={accounts} viewMode={holdingsViewMode} numbersVisible={numbersVisible} />
        </div>
      </div>
    );
  }

  if (activeTab === 'transactions') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-[#1D1D1F]">Transaction History</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => { setSyncMessage(''); const msg = await onSyncTransactions(); setSyncMessage(msg); }}
              className="px-4 py-2 text-sm font-medium text-[#0F52BA] hover:bg-[#F5F5F7] rounded transition-colors border border-[#D2D2D7]"
            >
              Sync Transactions
            </button>
            <button
              onClick={() => { if (window.confirm('Clear all processed data? Raw tables (uploaded statements, SnapTrade) will be preserved.')) onClearData(); }}
              className="px-4 py-2 text-sm font-medium text-[#FF3B30] hover:bg-[#FFDAD6] rounded transition-colors border border-[#D2D2D7]"
            >
              Clear Processed Data
            </button>
            <button
              onClick={() => onResetData()}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-[#F5F5F7] rounded transition-colors border border-[#D2D2D7]"
            >
              Reset Data
            </button>
          </div>
        </div>

        {syncMessage && (
          <p className={`text-sm font-medium px-4 py-2 rounded border ${syncMessage.startsWith('Failed') ? 'bg-[#FFDAD6] text-[#FF3B30] border-[#D2D2D7]' : 'bg-emerald-50 text-emerald-700 border-[#D2D2D7]'}`}>
            {syncMessage}
          </p>
        )}
        <TransactionsView transactions={transactions} onRemove={onRemoveTransaction} onSoftDelete={onSoftDeleteTransaction} onUpdate={onUpdateTransaction} onRevert={onRevertTransaction} selectedBrokerages={selectedBrokerages} setSelectedBrokerages={setSelectedBrokerages} selectedAssetTypes={selectedAssetTypes} setSelectedAssetTypes={setSelectedAssetTypes} selectedTickers={selectedTickers} setSelectedTickers={setSelectedTickers} focusTicker={focusTicker} focusDate={focusDate} onClearFocus={() => { setFocusTicker(null); setFocusDate(null); }} allKnownBrokerages={allKnownBrokerages} accounts={accounts} numbersVisible={numbersVisible} />
      </div>
    );
  }

  if (activeTab === 'gainsLosses') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold text-[#1D1D1F]">Realized Gains & Losses</h2>
          <button
            onClick={onProcessGains}
            className="px-4 py-2 text-sm font-medium text-[#0F52BA] hover:bg-[#F5F5F7] rounded transition-colors border border-[#D2D2D7]"
          >
            Refresh Data
          </button>
        </div>
        <GainsLossesView realizedGains={realizedGains} unrealizedGains={unrealizedGains} selectedBrokerages={selectedBrokerages} setSelectedBrokerages={setSelectedBrokerages} selectedTickers={selectedTickers} setSelectedTickers={setSelectedTickers} stTaxRate={stTaxRate} setStTaxRate={setStTaxRate} ltTaxRate={ltTaxRate} setLtTaxRate={setLtTaxRate} numbersVisible={numbersVisible} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-[#1D1D1F]">Dashboard</h1>
        <div className="mt-1 w-8 h-0.5 bg-[#0F52BA]" />
      </div>

      <SummaryCards stats={stats} cashByBrokerage={buyingPower} numbersVisible={numbersVisible} onToggleNumbers={onToggleNumbers} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-full">
          <PortfolioVisuals holdings={holdings} cashByBrokerage={buyingPower} numbersVisible={numbersVisible} onToggleNumbers={onToggleNumbers} />
        </div>

        <div>
          <AIInsights holdings={holdings} />
        </div>
      </div>

      {holdings.length > 0 && (() => {
        // Aggregate by ticker across all brokerages, compute daily % change
        const byTicker: Record<string, { ticker: string; currentPrice: number; previousClose: number; assetType: string }> = {};
        for (const h of holdings) {
          if ((h.assetType || '').toLowerCase() === 'options') continue;
          if (h.previousClose <= 0) continue;
          if (!byTicker[h.ticker]) {
            byTicker[h.ticker] = { ticker: h.ticker, currentPrice: h.currentPrice, previousClose: h.previousClose, assetType: h.assetType || 'Equity' };
          }
        }
        const withGain = Object.values(byTicker).map(t => ({
          ...t,
          gainPct: ((t.currentPrice - t.previousClose) / t.previousClose) * 100,
        }));
        const topMovers = [...withGain].sort((a, b) => b.gainPct - a.gainPct).slice(0, 5);
        const worstMovers = [...withGain].sort((a, b) => a.gainPct - b.gainPct).slice(0, 5);

        const MoverRow = ({ h }: { h: typeof withGain[0] }) => (
          <div className="flex items-center justify-between py-3 border-b last:border-0 border-[#D2D2D7]">
            <div className="flex items-center gap-3">
              <TickerLogo ticker={h.ticker} size={32} assetType={h.assetType} />
              <div>
                <p className="text-sm font-semibold text-[#1D1D1F]">{h.ticker}</p>
                <p className="text-xs text-slate-400">${h.currentPrice.toFixed(2)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold ${h.gainPct >= 0 ? 'text-emerald-600' : 'text-[#FF3B30]'}`}>
                {h.gainPct >= 0 ? '+' : ''}{h.gainPct.toFixed(2)}%
              </p>
              <p className="text-xs text-slate-400">prev ${h.previousClose.toFixed(2)}</p>
            </div>
          </div>
        );

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded border border-[#D2D2D7]" style={{ boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <h3 className="text-sm font-semibold text-[#1D1D1F]">Top Movers</h3>
              </div>
              {topMovers.map(h => <MoverRow key={h.ticker} h={h} />)}
            </div>
            <div className="bg-white p-6 rounded border border-[#D2D2D7]" style={{ boxShadow: '0px 2px 4px rgba(0,0,0,0.05)' }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#FF3B30]"></span>
                <h3 className="text-sm font-semibold text-[#1D1D1F]">Worst Movers</h3>
              </div>
              {worstMovers.map(h => <MoverRow key={h.ticker} h={h} />)}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default DashboardView;
