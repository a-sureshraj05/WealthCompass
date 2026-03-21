import React, { useState, useEffect } from 'react';
import { StockHolding, PortfolioStats, Transaction, RealizedGain, UnrealizedLot } from '../../types';
import SummaryCards from './SummaryCards';
import PortfolioVisuals from './PortfolioVisuals';
import HoldingsView from '../HoldingsView';
import ImportDataView from '../ImportDataView';
import AIInsights from './AIInsights';
import TransactionsView from '../TransactionsView';
import GainsLossesView from '../GainsLossesView';

interface Props {
  activeTab: string;
  setActiveTab: (tab: 'dashboardView' | 'holdings' | 'importData' | 'transactions' | 'gainsLosses') => void;
  holdings: StockHolding[];
  transactions: Transaction[];
  realizedGains: RealizedGain[];
  unrealizedGains: UnrealizedLot[];
  stats: PortfolioStats;
  onAddTransactions: (t: Transaction[]) => void;
  onRemoveHolding: (id: string) => void;
  onRemoveTransaction: (id: string) => void;
  onSoftDeleteTransaction: (id: string, isDeleted: boolean) => void;
  onUpdateTransaction: (id: string, updates: Partial<Transaction>) => void;
  onRevertTransaction: (id: string) => void;
  onResetData: () => void;
  onSyncTransactions: () => Promise<string>;
  onProcessGains: () => void;
  setLoading: (l: boolean) => void;
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
  onRemoveHolding,
  onRemoveTransaction,
  onSoftDeleteTransaction,
  onUpdateTransaction,
  onRevertTransaction,
  onResetData,
  onSyncTransactions,
  onProcessGains,
  setLoading,
}) => {
  const [syncMessage, setSyncMessage] = useState('');

  useEffect(() => { setSyncMessage(''); }, [activeTab]);

  if (activeTab === 'importData') {
    return <ImportDataView onAddTransactions={onAddTransactions} setLoading={setLoading} initialTab="connect" />;
  }

  if (activeTab === 'holdings') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Portfolio Holdings</h2>
          <button
            onClick={onProcessGains}
            className="px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-200"
          >
            Refresh Data
          </button>
        </div>
        <HoldingsView holdings={holdings} unrealizedGains={unrealizedGains} onRemove={onRemoveHolding} />
      </div>
    );
  }

  if (activeTab === 'transactions') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Transaction History</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => { setSyncMessage(''); const msg = await onSyncTransactions(); setSyncMessage(msg); }}
              className="px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-200"
            >
              Sync Transactions
            </button>
            <button
              onClick={onResetData}
              className="px-4 py-2 text-sm font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-amber-200"
            >
              Reset Data
            </button>
          </div>
        </div>
        {syncMessage && (
          <p className={`text-sm font-medium px-4 py-2 rounded-lg ${syncMessage.startsWith('Failed') ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
            {syncMessage}
          </p>
        )}
        <TransactionsView transactions={transactions} onRemove={onRemoveTransaction} onSoftDelete={onSoftDeleteTransaction} onUpdate={onUpdateTransaction} onRevert={onRevertTransaction} />
      </div>
    );
  }

  if (activeTab === 'gainsLosses') {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900">Realized Gains & Losses</h2>
          <button
            onClick={onProcessGains}
            className="px-4 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-indigo-200"
          >
            Refresh Data
          </button>
        </div>
        <GainsLossesView realizedGains={realizedGains} unrealizedGains={unrealizedGains} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SummaryCards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 h-full">
          <PortfolioVisuals holdings={holdings} />
        </div>

        <div className="space-y-6">
          <AIInsights holdings={holdings} />

          <div className="bg-gradient-to-br from-slate-900 to-indigo-900 p-6 rounded-2xl text-white shadow-xl">
            <h3 className="text-lg font-bold mb-2">Connect More</h3>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              Consolidate your Robinhood, Schwab, and Fidelity accounts for a 360° view of your net worth.
            </p>
            <button
              className="w-full py-3 bg-white text-indigo-900 font-bold rounded-xl shadow-lg hover:bg-indigo-50 transition-colors"
              onClick={() => setActiveTab('importData')}
            >
              Get Started
            </button>
          </div>
        </div>
      </div>

      {holdings.length > 0 && (() => {
        const withGain = holdings
          .filter(h => h.averageCostPerShare > 0)
          .map(h => ({ ...h, gainPct: ((h.currentPrice - h.averageCostPerShare) / h.averageCostPerShare) * 100 }));
        const topMovers = [...withGain].sort((a, b) => b.gainPct - a.gainPct).slice(0, 5);
        const worstMovers = [...withGain].sort((a, b) => a.gainPct - b.gainPct).slice(0, 5);

        const MoverRow = ({ h }: { h: typeof withGain[0] }) => (
          <div className="flex items-center justify-between py-2.5 border-b last:border-0 border-slate-50">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                <span className="text-[10px] font-black text-slate-600">{h.ticker.slice(0, 3)}</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">{h.ticker}</p>
                <p className="text-xs text-slate-400">{h.brokerage}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold ${h.gainPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {h.gainPct >= 0 ? '+' : ''}{h.gainPct.toFixed(2)}%
              </p>
              <p className="text-xs text-slate-400">${h.currentPrice.toFixed(2)}</p>
            </div>
          </div>
        );

        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <h3 className="text-lg font-bold text-slate-900">Top Movers</h3>
              </div>
              {topMovers.map(h => <MoverRow key={h.id} h={h} />)}
            </div>
            <div className="bg-white p-6 rounded-2xl border shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <h3 className="text-lg font-bold text-slate-900">Worst Movers</h3>
              </div>
              {worstMovers.map(h => <MoverRow key={h.id} h={h} />)}
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default DashboardView;
