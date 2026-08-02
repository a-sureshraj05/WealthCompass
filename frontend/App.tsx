
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StockHolding, PortfolioStats, Transaction, DateRangeType, RealizedGain, UnrealizedLot } from './types';
import DashboardView from './components/Dashboard/DashboardView';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import MobileTabBar from './components/MobileTabBar';
import LoginPage from './components/LoginPage';
import { fetchHoldings, fetchTransactions, fetchRealizedGains, fetchUnrealizedGains, removeTransaction, softDeleteTransaction, updateTransaction, revertTransaction, triggerRealizedGainsProcess, resetTransactions, clearProcessedData, fetchCashBalance, fetchBuyingPower, fetchBuyingPowerCached, fetchAnalystData, fetchAnalystDataCached, fetchAccounts, refreshPrices } from './services/apiService';
import { BrokerageAccount } from './types';
import TickerTypeContext from './contexts/TickerTypeContext';

const App: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [validating, setValidating] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('wc_token');
    if (!stored) { setValidating(false); return; }
    fetch('/api/v1/auth/me', { headers: { Authorization: `Bearer ${stored}` } })
      .then(res => { if (res.ok) setToken(stored); else localStorage.removeItem('wc_token'); })
      .catch(() => { localStorage.removeItem('wc_token'); })
      .finally(() => setValidating(false));
  }, []);

  const handleLogin = (newToken: string) => {
    localStorage.setItem('wc_token', newToken);
    setToken(newToken);
  };

  const handleLogout = () => {
    localStorage.removeItem('wc_token');
    setToken(null);
  };

  if (validating) return null;
  if (!token) return <LoginPage onLogin={handleLogin} />;
  return <AuthenticatedApp onLogout={handleLogout} />;
};

const AuthenticatedApp: React.FC<{ onLogout: () => void }> = ({ onLogout }) => {
  const [accounts, setAccounts] = useState<BrokerageAccount[]>([]);
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [buyingPower, setBuyingPower] = useState<Record<string, number>>({});
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [realizedGains, setRealizedGains] = useState<RealizedGain[]>([]);
  const [unrealizedGains, setUnrealizedGains] = useState<UnrealizedLot[]>([]);
  const [loading, setLoading] = useState(false);
  const [numbersVisible, setNumbersVisible] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboardView' | 'holdings' | 'importData' | 'transactions' | 'gainsLosses'>('dashboardView');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const transactionsDirty = React.useRef(false);

  // Ticker → assetType lookup, drives TickerLogo icon selection across all pages
  const tickerTypeMap = useMemo(() => {
    const map: Record<string, string> = {};
    holdings.forEach(h => { if (h.ticker && h.assetType) map[h.ticker.toUpperCase()] = h.assetType; });
    return map;
  }, [holdings]);

  // All known brokerages from unfiltered holdings — used for transfer destination picker
  const allKnownBrokerages = useMemo(
    () => Array.from(new Set(holdings.map(h => h.brokerage))).sort(),
    [holdings],
  );

  // Shared filters — reflected across all pages
  const [selectedBrokerages, setSelectedBrokerages] = useState<string[]>([]);
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('all');

  const getHoldings = useCallback(async () => {
    try {
      const [h, accts, cash, cachedBP, cachedAnalyst] = await Promise.all([
        fetchHoldings(), fetchAccounts(), fetchCashBalance(), fetchBuyingPowerCached(), fetchAnalystDataCached(),
      ]);
      setAccounts(accts);
      setCashBalance(cash);
      setBuyingPower(cachedBP);
      if (cachedAnalyst.length > 0) {
        const sectorMap: Record<string, string> = {};
        cachedAnalyst.forEach((a: any) => { if (a.sector) sectorMap[a.ticker] = a.sector; });
        setHoldings(h.map((x: any) => ({ ...x, sector: sectorMap[x.ticker] })));
      } else {
        setHoldings(h);
      }
    } catch (error) {
      console.error("Failed to fetch holdings:", error);
    }
  }, []);

  // Hits SnapTrade live — only called on explicit sync/refresh, result cached in DB
  const getBuyingPower = useCallback(async () => {
    try {
      setBuyingPower(await fetchBuyingPower());
    } catch (error) {
      console.error("Failed to fetch buying power:", error);
    }
  }, []);

  // Hits yfinance for all tickers — fires in background after main refresh, result cached in DB
  // Fetches fresh holdings to get current tickers (avoids stale closure on holdings state)
  const refreshAnalystData = useCallback(async () => {
    try {
      const h = await fetchHoldings();
      const tickers = [...new Set(h.map(x => x.ticker))];
      if (tickers.length === 0) return;
      const analystData = await fetchAnalystData(tickers);
      const sectorMap: Record<string, string> = {};
      analystData.forEach((a: any) => { if (a.sector) sectorMap[a.ticker] = a.sector; });
      setHoldings(h.map(x => ({ ...x, sector: sectorMap[x.ticker] })));
    } catch (error) {
      console.error("Failed to refresh analyst data:", error);
    }
  }, []);

  // Hits yfinance for every open lot, then re-reads the rows it rewrote.
  // Non-blocking by design: callers render cached prices first and get patched
  // when the quotes land, same as refreshAnalystData.
  const refreshLivePrices = useCallback(async () => {
    try {
      const result = await refreshPrices();
      if (result.failed.length > 0) {
        console.warn(`Price refresh could not quote ${result.failed.length} symbol(s):`, result.failed);
      }
      const [h, u] = await Promise.all([fetchHoldings(), fetchUnrealizedGains()]);
      setHoldings(prev => {
        // Keep sector/target that refreshAnalystData patched on; the price
        // endpoint doesn't know about them.
        const extras = new Map(prev.map(x => [`${x.brokerage}|${x.ticker}|${x.assetType}`, x.sector]));
        return h.map(x => ({ ...x, sector: extras.get(`${x.brokerage}|${x.ticker}|${x.assetType}`) ?? x.sector }));
      });
      setUnrealizedGains(u);
    } catch (error) {
      console.error("Failed to refresh live prices:", error);
    }
  }, []);

  const getRealizedGains = useCallback(async () => {
    try {
      setRealizedGains(await fetchRealizedGains());
    } catch (error) {
      console.error("Failed to fetch realized gains:", error);
    }
  }, []);

  const getUnrealizedGains = useCallback(async () => {
    try {
      setUnrealizedGains(await fetchUnrealizedGains());
    } catch (error) {
      console.error("Failed to fetch unrealized gains:", error);
    }
  }, []);

  useEffect(() => {
    getHoldings();
    getRealizedGains();
    getUnrealizedGains();
    refreshAnalystData(); // background — renders from cache above, then patches when yfinance returns
    refreshLivePrices();  // background — same pattern, patches prices when quotes land
  }, [getHoldings, getRealizedGains, getUnrealizedGains, refreshAnalystData, refreshLivePrices]);

  // Fetch transactions from backend with filters
  const getTransactions = useCallback(async () => {
    let finalStartDate: string | null = startDate;
    let finalEndDate: string | null = endDate;

    const now = new Date();
    if (dateRangeType === '30d') {
      const d = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      finalStartDate = d.toISOString().split('T')[0];
      finalEndDate = now.toISOString().split('T')[0];
    } else if (dateRangeType === '90d') {
      const d = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
      finalStartDate = d.toISOString().split('T')[0];
      finalEndDate = now.toISOString().split('T')[0];
    } else if (dateRangeType === 'ytd') {
      const d = new Date(now.getFullYear(), 0, 1);
      finalStartDate = d.toISOString().split('T')[0];
      finalEndDate = now.toISOString().split('T')[0];
    } else if (dateRangeType === 'all') {
      finalStartDate = null;
      finalEndDate = null;
    }

    try {
      const fetchedTransactions = await fetchTransactions(
        selectedBrokerages,
        selectedTickers,
        finalStartDate,
        finalEndDate
      );
      setTransactions(fetchedTransactions);
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
    }
  }, [setTransactions, selectedBrokerages, selectedTickers, startDate, endDate, dateRangeType]); // Added dependencies

  useEffect(() => {
    getTransactions();
  }, [getTransactions]); // Depend on getTransactions

  const stats = useMemo((): PortfolioStats => {
    const investmentValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
    const totalValue = investmentValue + cashBalance;
    const totalCost = holdings.reduce((sum, h) => sum + h.totalCost, 0);
    const totalGain = investmentValue - totalCost;
    const gainPercentage = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    const dayChange = holdings.reduce((sum, h) => sum + h.quantity * (h.currentPrice - (h.previousClose > 0 ? h.previousClose : h.currentPrice)), 0);
    const dayChangePercentage = investmentValue > 0 ? (dayChange / (investmentValue - dayChange)) * 100 : 0;

    const totalBuyingPower = Object.values(buyingPower).reduce((s, v) => s + v, 0);
    const netValue = investmentValue + totalBuyingPower;
    return { totalValue: netValue, investmentValue, totalGain, gainPercentage, dayChange, dayChangePercentage, buyingPower: totalBuyingPower };
  }, [holdings, cashBalance, buyingPower]);

  const handleAddHoldings = (newHoldings: StockHolding[]) => {
    setHoldings(newHoldings);
  };

  // New handler for adding transactions
  const handleAddTransactions = (newTransactions: Transaction[]) => {
    setTransactions(newTransactions);
    getHoldings(); // Re-fetch holdings after transactions are added
  };

  const handleRemoveHolding = (id: string) => {
    setHoldings(prev => prev.filter(h => h.id !== id));
  };

  const handleRemoveTransaction = async (id: string) => {
    try {
      await removeTransaction(id);
      setTransactions(prev => prev.filter(t => t.id !== id));
    } catch (error) {
      console.error("Failed to remove transaction:", error);
    }
  };

  const handleUpdateTransaction = async (id: string, updates: Partial<Transaction>) => {
    try {
      await updateTransaction(id, updates);
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates, is_override: true } : t));
      transactionsDirty.current = true;
    } catch (error) {
      console.error("Failed to update transaction:", error);
    }
  };

  const handleRevertTransaction = async (id: string) => {
    try {
      await revertTransaction(id);
      await getTransactions();
      transactionsDirty.current = true;
    } catch (error) {
      console.error("Failed to revert transaction:", error);
    }
  };

  const handleSoftDeleteTransaction = async (id: string, isDeleted: boolean) => {
    // Optimistic update — flip immediately so checkbox responds instantly
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, is_deleted: isDeleted } : t));
    try {
      await softDeleteTransaction(id, isDeleted);
      transactionsDirty.current = true;
    } catch (error) {
      // Revert on failure
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, is_deleted: !isDeleted } : t));
      console.error("Failed to update transaction:", error);
    }
  };

  const handleResetData = async (brokerage?: string) => {
    setLoading(true);
    try {
      await resetTransactions(brokerage);
      await Promise.all([getTransactions(), getHoldings(), getRealizedGains(), getUnrealizedGains(), getBuyingPower()]); refreshAnalystData();
    } catch (error) {
      console.error('Failed to reset data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearData = async () => {
    setLoading(true);
    try {
      await clearProcessedData();
      setTransactions([]);
      setHoldings([]);
      setRealizedGains([]);
      setUnrealizedGains([]);
      setCashBalance(0);
      setBuyingPower({});
    } catch (error) {
      console.error('Failed to clear data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncTransactions = async (): Promise<string> => {
    setLoading(true);
    try {
      await resetTransactions();
      await Promise.all([getTransactions(), getHoldings(), getRealizedGains(), getUnrealizedGains(), getBuyingPower()]); refreshAnalystData();
      return 'Transactions reprocessed from raw data.';
    } catch (error) {
      console.error('Failed to reprocess transactions:', error);
      return 'Failed to reprocess transactions.';
    } finally {
      setLoading(false);
    }
  };


  const handleProcessGains = async () => {
    setLoading(true);
    try {
      await triggerRealizedGainsProcess();
      await Promise.all([getHoldings(), getRealizedGains(), getUnrealizedGains(), getBuyingPower()]); refreshAnalystData();
      transactionsDirty.current = false;
    } catch (error) {
      console.error("Failed to process gains:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetActiveTab = (tab: typeof activeTab) => {
    if (tab === 'gainsLosses' && transactionsDirty.current) {
      handleProcessGains();
    }
    setActiveTab(tab);
  };

  return (
    <TickerTypeContext.Provider value={tickerTypeMap}>
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar activeTab={activeTab} setActiveTab={handleSetActiveTab} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar stats={stats} onLogout={onLogout} sidebarCollapsed={sidebarCollapsed} numbersVisible={numbersVisible} onToggleNumbers={() => setNumbersVisible(v => !v)} />

        {/* px/pt rather than the p- shorthand: `md:p-8` resets every side, which
            would override .pb-tabbar's clearance between md and lg — exactly the
            range where the bar is still visible. See .pb-tabbar in index.html. */}
        <main className="flex-1 overflow-y-auto px-4 pt-4 md:px-8 md:pt-8 pb-tabbar">
          <DashboardView
            activeTab={activeTab}
            setActiveTab={handleSetActiveTab}
            numbersVisible={numbersVisible}
            onToggleNumbers={() => setNumbersVisible(v => !v)}
            holdings={holdings}
            transactions={transactions}
            realizedGains={realizedGains}
            unrealizedGains={unrealizedGains}
            stats={stats}
            onAddTransactions={handleAddTransactions}
            onRefresh={() => { Promise.all([getTransactions(), getHoldings(), getRealizedGains(), getUnrealizedGains(), getBuyingPower()]); refreshAnalystData(); refreshLivePrices(); }}
            onRemoveHolding={handleRemoveHolding}
            onRemoveTransaction={handleRemoveTransaction}
            onSoftDeleteTransaction={handleSoftDeleteTransaction}
            onUpdateTransaction={handleUpdateTransaction}
            onRevertTransaction={handleRevertTransaction}
            onResetData={handleResetData}
            onClearData={handleClearData}
            onSyncTransactions={handleSyncTransactions}
            onProcessGains={handleProcessGains}
            setLoading={setLoading}
            selectedBrokerages={selectedBrokerages}
            setSelectedBrokerages={setSelectedBrokerages}
            selectedAssetTypes={selectedAssetTypes}
            setSelectedAssetTypes={setSelectedAssetTypes}
            selectedTickers={selectedTickers}
            setSelectedTickers={setSelectedTickers}
            allKnownBrokerages={allKnownBrokerages}
            buyingPower={buyingPower}
            accounts={accounts}
          />
        </main>
      </div>

      <MobileTabBar activeTab={activeTab} setActiveTab={handleSetActiveTab} />

      {loading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
            <p className="mt-4 font-medium text-slate-700">Processing your statements...</p>
          </div>
        </div>
      )}
    </div>
    </TickerTypeContext.Provider>
  );
};

export default App;
