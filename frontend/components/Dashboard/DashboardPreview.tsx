import React, { useEffect, useMemo, useRef, useState } from 'react';
import DashboardView from './DashboardView';
import Sidebar from '../Sidebar';
import MobileTabBar from '../MobileTabBar';
import BrandLogo from '../BrandLogo';
import { NAV_ITEMS, TabId } from '../navItems';
import { StockHolding, Transaction } from '../../types';
import TickerTypeContext from '../../contexts/TickerTypeContext';
import { portfolioModel } from './portfolioModel';
import { previewAccounts, previewCash, previewHoldings, previewRealized, previewTransactions, previewUnrealized } from '../../preview/data';
import './portfolio-overview.css';

export default function DashboardPreview({ initialTab }: { initialTab?: TabId } = {}) {
  const [activeTab, setActiveTab] = useState<TabId>(() => initialTab || NAV_ITEMS.find(item => typeof window !== 'undefined' && `#${item.id}` === window.location.hash)?.id || 'dashboardView');
  const [visible, setVisible] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [brokerages, setBrokerages] = useState<string[]>([]);
  const [assetTypes, setAssetTypes] = useState<string[]>([]);
  const [tickers, setTickers] = useState<string[]>([]);
  const [holdings, setHoldings] = useState<StockHolding[]>(() => [...previewHoldings]);
  const [transactions, setTransactions] = useState<Transaction[]>(() => previewTransactions.map(t => ({ ...t })));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const main = useRef<HTMLElement>(null);
  const model = useMemo(() => portfolioModel(holdings, previewCash), [holdings]);
  const tickerTypes = useMemo(() => Object.fromEntries(holdings.map(h => [h.ticker, h.assetType || 'Equity'])), [holdings]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { main.current?.scrollTo({ top: 0 }); }, [activeTab]);
  useEffect(() => {
    const onHash = () => { const item = NAV_ITEMS.find(item => `#${item.id}` === window.location.hash); if (item) setActiveTab(item.id); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const notify = (text: string) => {
    setMessage(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 4200);
  };
  const navigate = (tab: TabId) => {
    setActiveTab(tab);
    window.history.replaceState(null, '', `#${tab}`);
  };
  const reset = () => { setHoldings([...previewHoldings]); setTransactions(previewTransactions.map(t => ({ ...t }))); notify('Fictional sample data restored. No live records were changed.'); };
  return <TickerTypeContext.Provider value={tickerTypes}><div className="wealth-workspace preview-shell">
    <Sidebar activeTab={activeTab} setActiveTab={navigate} collapsed={collapsed} setCollapsed={setCollapsed} />
    <div className="preview-content">
      <header className="preview-topbar"><div className="preview-breadcrumb"><span className="preview-mobile-brand"><BrandLogo size={30} className="brand-mobile" /></span><span className="preview-workspace-label">Workspace</span><span>/</span><strong>{NAV_ITEMS.find(item => item.id === activeTab)?.label}</strong></div><div className="preview-topbar-right"><button className="preview-visibility" aria-pressed={!visible} onClick={() => setVisible(v => !v)}>{visible ? 'Hide figures' : 'Show figures'}</button><span className="preview-avatar" aria-label="Sample account">JD</span></div></header>
      <main ref={main} className="workspace-canvas preview-main">
        {activeTab !== 'dashboardView' && <div className="preview-page-notice"><span /><strong>Design preview</strong><span>Fictional portfolio · changes stay in this preview</span></div>}
        <DashboardView activeTab={activeTab} setActiveTab={navigate} preview
          holdings={holdings} transactions={transactions} realizedGains={previewRealized} unrealizedGains={previewUnrealized.filter(l => holdings.some(h => h.ticker === l.ticker && h.brokerage === l.brokerage && h.assetType === l.assetType))}
          stats={{ totalValue: model.totalValue, investmentValue: model.investmentValue, totalGain: model.gain, gainPercentage: model.gainPercent || 0, dayChange: model.dayChange, dayChangePercentage: model.dayPercent || 0, buyingPower: model.cashValue }}
          numbersVisible={visible} onToggleNumbers={() => setVisible(v => !v)}
          selectedBrokerages={brokerages} setSelectedBrokerages={setBrokerages}
          selectedAssetTypes={assetTypes} setSelectedAssetTypes={setAssetTypes}
          selectedTickers={tickers} setSelectedTickers={setTickers}
          allKnownBrokerages={previewAccounts.map(a => a.brokerage)} accounts={previewAccounts} buyingPower={previewCash} refreshNonce={0}
          setLoading={setBusy}
          onRefresh={() => notify('Sample data loaded. No network request or brokerage sync was made.')}
          onProcessGains={() => notify('Preview only: calculations use fixed sample positions and tax lots.')}
          onSyncTransactions={async () => 'Synced fictional sample activity. No brokerage was contacted.'}
          onAddTransactions={added => { setTransactions(prev => [...prev, ...added]); notify('Example statement rows added to the preview ledger only.'); }}
          onRemoveHolding={id => setHoldings(prev => prev.filter(h => h.id !== id))}
          onRemoveTransaction={id => { setTransactions(prev => prev.filter(t => t.id !== id)); notify('Sample transaction removed from this preview only.'); }}
          onSoftDeleteTransaction={(id, is_deleted) => setTransactions(prev => prev.map(t => t.id === id ? { ...t, is_deleted } : t))}
          onUpdateTransaction={(id, updates) => { setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates, is_override: true } : t)); notify('Sample ledger row updated. Position calculations remain illustrative.'); }}
          onRevertTransaction={id => setTransactions(prev => prev.map(t => t.id === id ? { ...(previewTransactions.find(original => original.id === id) || t) } : t))}
          onClearData={() => notify('Clearing calculated data is unavailable in this design preview.')}
          onResetData={reset}
        />
      </main>
    </div>
    <MobileTabBar activeTab={activeTab} setActiveTab={navigate} />
    {busy && <div className="workspace-busy" role="status">Working with sample data…</div>}
    {message && <div className="preview-toast" role="status">{message}</div>}
  </div></TickerTypeContext.Provider>;
}
