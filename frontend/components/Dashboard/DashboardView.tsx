import React, { useState, useEffect } from 'react';
import { StockHolding, PortfolioStats, Transaction, RealizedGain, UnrealizedLot } from '../../types';
import PortfolioOverview from './PortfolioOverview';
import HoldingsView from '../HoldingsView';
import ImportDataView from '../ImportDataView';
import AIInsights from './AIInsights';
import PreviewPerformance from '../../preview/PreviewPerformance';
import TransactionsView from '../TransactionsView';
import GainsLossesView from '../GainsLossesView';
import OptionsView from '../OptionsView';
import WorkspacePage from '../WorkspacePage';

interface Props {
  activeTab: string;
  preview?: boolean;
  setActiveTab: (tab: 'dashboardView' | 'holdings' | 'importData' | 'transactions' | 'gainsLosses') => void;
  holdings: StockHolding[];
  transactions: Transaction[];
  realizedGains: RealizedGain[];
  unrealizedGains: UnrealizedLot[];
  stats: PortfolioStats;
  onAddTransactions: (t: Transaction[]) => void;
  onRefresh: () => void | Promise<unknown>;
  /** Bumped on an explicit refresh; AIInsights regenerates when it changes. */
  refreshNonce: number;
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
  preview = false,
  setActiveTab,
  holdings,
  transactions,
  realizedGains,
  unrealizedGains,
  stats,
  onAddTransactions,
  onRefresh,
  refreshNonce,
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
  const [syncing, setSyncing] = useState(false);
  const [holdingsSection, setHoldingsSection] = useState<'equity' | 'options'>('equity');
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
    return <WorkspacePage tab="importData"><ImportDataView onAddTransactions={onAddTransactions} onRefresh={onRefresh} setLoading={setLoading} initialTab="connect" onViewTransactions={() => { setSelectedBrokerages([]); setSelectedTickers([]); setSelectedAssetTypes([]); setFocusTicker(null); setFocusDate(null); setActiveTab('transactions'); }} /></WorkspacePage>;
  }

  if (activeTab === 'holdings') {
    return <WorkspacePage tab="holdings" actions={<button onClick={onProcessGains} className="workspace-button">Recalculate positions</button>}>
      <div className="space-y-6">
        <div className="workspace-section-note"><span><strong>From position to transaction.</strong> Expand position or brokerage rows to inspect individual tax lots. Select a lot to find its source transaction.</span><button onClick={() => setActiveTab('gainsLosses')}>Review gains &amp; losses →</button></div>
        <div className="holdings-tabs-row">
          <div className="workspace-segments" aria-label="Holding type">
            <button aria-pressed={holdingsSection === 'equity'} className={holdingsSection === 'equity' ? 'active' : ''} onClick={() => setHoldingsSection('equity')}>Stocks &amp; funds</button>
            <button aria-pressed={holdingsSection === 'options'} className={holdingsSection === 'options' ? 'active' : ''} onClick={() => setHoldingsSection('options')}>Options</button>
          </div>
          <p className="holdings-tax-note">Gain to Sell uses ST {stTaxRate}% / LT {ltTaxRate}% assumptions from Gains &amp; Losses.</p>
        </div>
        {holdingsSection === 'equity' ? <HoldingsView
          title="Stocks & funds"
          numbersVisible={numbersVisible}
          holdings={holdings.filter(h => (h.assetType || '').toLowerCase() !== 'options')}
          unrealizedGains={unrealizedGains.filter(u => (u.assetType || '').toLowerCase() !== 'options')}
          realizedGains={realizedGains.filter(r => (r.assetType || '').toLowerCase() !== 'options')}
          onRemove={onRemoveHolding}
          autoExpand={autoExpand}
          onNavigateToTransactions={(ticker, brokerage, buyDate) => {
            setAutoExpand({ ticker, brokerage });
            setSelectedBrokerages([brokerage]);
            setSelectedTickers([ticker]);
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
        /> : <OptionsView onBrokeragesChange={setSelectedBrokerages} onTickersChange={setSelectedTickers} onTermsChange={setSelectedTerms} onViewModeChange={setHoldingsViewMode} selectedBrokerages={selectedBrokerages} selectedTickers={selectedTickers} selectedTerms={selectedTerms} holdings={holdings} unrealizedGains={unrealizedGains} realizedGains={realizedGains} stTaxRate={stTaxRate} ltTaxRate={ltTaxRate} accounts={accounts} viewMode={holdingsViewMode} numbersVisible={numbersVisible} />}
      </div>
    </WorkspacePage>;
  }

  if (activeTab === 'transactions') {
    return <WorkspacePage tab="transactions" actions={<button disabled={syncing} onClick={async () => {
      setSyncing(true); setSyncMessage('');
      try { setSyncMessage(await onSyncTransactions()); } catch { setSyncMessage('Failed to sync transactions. Please try again.'); }
      finally { setSyncing(false); }
    }} className="workspace-button primary">{syncing ? 'Syncing…' : 'Sync transactions'}</button>}>
      <div className="space-y-6">
        <div className="workspace-section-note"><span><strong>The source behind your numbers.</strong> Filter by brokerage, ticker or date. Review flagged entries and edit transactions when reconciliation is needed.</span><button onClick={() => setActiveTab('importData')}>Manage accounts →</button></div>
        {syncMessage && <p role="status" className={`workspace-status ${syncMessage.startsWith('Failed') ? 'is-error' : ''}`}>{syncMessage}</p>}
        <TransactionsView transactions={transactions} onRemove={onRemoveTransaction} onSoftDelete={onSoftDeleteTransaction} onUpdate={onUpdateTransaction} onRevert={onRevertTransaction} selectedBrokerages={selectedBrokerages} setSelectedBrokerages={setSelectedBrokerages} selectedAssetTypes={selectedAssetTypes} setSelectedAssetTypes={setSelectedAssetTypes} selectedTickers={selectedTickers} setSelectedTickers={setSelectedTickers} focusTicker={focusTicker} focusDate={focusDate} onClearFocus={() => { setFocusTicker(null); setFocusDate(null); }} allKnownBrokerages={allKnownBrokerages} accounts={accounts} numbersVisible={numbersVisible} />
        <details className="workspace-maintenance"><summary>Data maintenance</summary><p>Use these tools when rebuilding or troubleshooting your portfolio. Clearing calculated data preserves original imported records.</p><div className="flex flex-wrap gap-3"><button className="workspace-button" onClick={() => { if (window.confirm('Clear calculated positions and gains? Your original imported records will be preserved.')) onClearData(); }}>Clear calculated data</button><button className="workspace-button" onClick={() => onResetData()}>Reset processed transactions</button></div></details>
      </div>
    </WorkspacePage>;
  }

  if (activeTab === 'gainsLosses') {
    return <WorkspacePage tab="gainsLosses" actions={<button onClick={onProcessGains} className="workspace-button">Recalculate gains</button>}>
        <GainsLossesView realizedGains={realizedGains} unrealizedGains={unrealizedGains} selectedBrokerages={selectedBrokerages} setSelectedBrokerages={setSelectedBrokerages} selectedTickers={selectedTickers} setSelectedTickers={setSelectedTickers} stTaxRate={stTaxRate} setStTaxRate={setStTaxRate} ltTaxRate={ltTaxRate} setLtTaxRate={setLtTaxRate} numbersVisible={numbersVisible} />
    </WorkspacePage>;
  }

  return (
    <div className="space-y-6">
      <PortfolioOverview
        preview={preview}
        performance={import.meta.env.DEV && preview ? <PreviewPerformance numbersVisible={numbersVisible} scopeFiltered={selectedBrokerages.length > 0} /> : undefined}
        insights={<AIInsights holdings={holdings} cashByBrokerage={buyingPower} refreshNonce={refreshNonce}
          preview={preview} numbersVisible={numbersVisible} scopeFiltered={selectedBrokerages.length > 0}
          onOpenHoldings={ticker => { setSelectedBrokerages([]); setSelectedTickers(ticker ? [ticker] : []); setSelectedAssetTypes([]); setSelectedTerms([]); setActiveTab('holdings'); }}
          onOpenGains={() => { setSelectedBrokerages([]); setSelectedTickers([]); setActiveTab('gainsLosses'); }} />}
        holdings={holdings}
        cashByBrokerage={buyingPower}
        numbersVisible={numbersVisible}
        selectedBrokerages={selectedBrokerages}
        onBrokeragesChange={setSelectedBrokerages}
        onRefresh={onRefresh}
        onConnect={() => setActiveTab('importData')}
        onOpenHoldings={ticker => {
          setSelectedTickers(ticker ? [ticker] : []);
          setSelectedAssetTypes([]);
          setSelectedTerms([]);
          setHoldingsSection('equity');
          setAutoExpand(null);
          setActiveTab('holdings');
        }}
      />
    </div>
  );
};

export default DashboardView;
