import React, { useEffect, useMemo, useRef, useState } from 'react';
import DashboardView from './DashboardView';
import Sidebar from '../Sidebar';
import MobileTabBar from '../MobileTabBar';
import BrandLogo from '../BrandLogo';
import ProfileMenu from '../ProfileMenu';
import useFinancialVisibility from '../../hooks/useFinancialVisibility';
import FinancialVisibilityNotice from '../FinancialVisibilityNotice';
import { NAV_ITEMS, TabId } from '../navItems';
import { StockHolding, Transaction } from '../../types';
import TickerTypeContext from '../../contexts/TickerTypeContext';
import { portfolioModel } from './portfolioModel';
import { PREVIEW_SCENARIOS, previewDataset, previewScenario } from '../../preview/portfolioScenarios';
import './portfolio-overview.css';

export default function DashboardPreview({ initialTab }: { initialTab?: TabId } = {}) {
  const [activeTab, setActiveTab] = useState<TabId>(() => initialTab || NAV_ITEMS.find(item => typeof window !== 'undefined' && `#${item.id}` === window.location.hash)?.id || 'dashboardView');
  const [search] = useState(() => typeof window === 'undefined' ? '' : window.location.search || '');
  const sample = previewDataset(search);
  const scenario = previewScenario(search);
  const { accounts: previewAccounts, cash: previewCash, holdings: previewHoldings, realized: previewRealized, transactions: previewTransactions, unrealized: previewUnrealized } = sample;
  const privacy = useFinancialVisibility();
  const visible = privacy.visible;
  const [signedOut, setSignedOut] = useState(false);
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
  const equityCount = new Set(holdings.filter(holding => holding.assetType !== 'Options').map(holding => holding.ticker)).size;
  const optionCount = holdings.filter(holding => holding.assetType === 'Options').length;
  const tickerTypes = useMemo(() => Object.fromEntries(holdings.filter(h => h.assetType !== 'Options').map(h => [h.ticker, h.assetType || 'Equity'])), [holdings]);
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
  if (signedOut) return <div className="preview-session-exit"><div><BrandLogo size={38} /><h1>Preview session closed</h1><p>You signed out of the fictional preview. Your real WealthCompass session was not changed.</p><button onClick={() => setSignedOut(false)}>Return to design preview</button></div></div>;
  return <TickerTypeContext.Provider value={tickerTypes}><div className="wealth-workspace preview-shell">
    <Sidebar activeTab={activeTab} setActiveTab={navigate} collapsed={collapsed} setCollapsed={setCollapsed} />
    <div className="preview-content">
      <header className="preview-topbar"><div className="preview-breadcrumb"><span className="preview-mobile-brand"><BrandLogo size={30} className="brand-mobile" /></span><span className="preview-workspace-label">Workspace</span><span>/</span><strong>{NAV_ITEMS.find(item => item.id === activeTab)?.label}</strong></div><div className="preview-topbar-right"><ProfileMenu preview privacy={privacy} onLogout={() => setSignedOut(true)} /></div></header>
      <main ref={main} className="workspace-canvas preview-main">
        <FinancialVisibilityNotice privacy={privacy} />
        <section className="preview-scenario" aria-label="Sample portfolios">
          <div><strong>Choose a sample portfolio</strong><span>Fictional data · switching samples resets preview edits</span></div>
          <nav className="preview-scenario-choices" aria-label="Choose sample portfolio">
            {PREVIEW_SCENARIOS.map(sample => <a key={sample.id} href={`/design-preview${sample.id === 'standard' ? '' : `?portfolio=${sample.id}`}#${activeTab}`} aria-current={sample.id === scenario ? 'page' : undefined}>
              <strong>{sample.label}</strong><span>{sample.description}</span>
            </a>)}
          </nav>
          <div className="preview-scenario-loaded"><span><strong>Loaded: {equityCount} stocks &amp; ETFs + {optionCount} option positions</strong><small>Overview shows the largest five. Open Holdings for the full list.</small></span><button type="button" onClick={() => { setBrokerages([]); setAssetTypes([]); setTickers([]); navigate('holdings'); }}>Open Holdings →</button></div>
        </section>
        {activeTab !== 'dashboardView' && <div className="preview-page-notice"><span /><strong>Design preview</strong><span>Fictional portfolio · changes stay in this preview</span></div>}
        <DashboardView activeTab={activeTab} setActiveTab={navigate} preview
          holdings={holdings} transactions={transactions} realizedGains={previewRealized} unrealizedGains={previewUnrealized.filter(l => holdings.some(h => h.ticker === l.ticker && h.brokerage === l.brokerage && h.assetType === l.assetType))}
          stats={{ totalValue: model.totalValue, investmentValue: model.investmentValue, totalGain: model.gain, gainPercentage: model.gainPercent || 0, dayChange: model.dayChange, dayChangePercentage: model.dayPercent || 0, buyingPower: model.cashValue }}
          numbersVisible={visible}
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
