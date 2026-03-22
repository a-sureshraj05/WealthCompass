
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StockHolding, PortfolioStats, Transaction, DateRangeType, RealizedGain, UnrealizedLot } from './types';
import DashboardView from './components/Dashboard/DashboardView';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import LoginPage from './components/LoginPage';
import { fetchHoldings, fetchTransactions, fetchRealizedGains, fetchUnrealizedGains, removeTransaction, softDeleteTransaction, updateTransaction, revertTransaction, triggerRealizedGainsProcess, resetTransactions, clearProcessedData, fetchCashBalance, fetchAnalystData } from './services/apiService';

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
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [cashBalance, setCashBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [realizedGains, setRealizedGains] = useState<RealizedGain[]>([]);
  const [unrealizedGains, setUnrealizedGains] = useState<UnrealizedLot[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboardView' | 'holdings' | 'importData' | 'transactions' | 'gainsLosses'>('dashboardView');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const transactionsDirty = React.useRef(false);

  // Filter states for transactions
  const [selectedBrokerages, setSelectedBrokerages] = useState<string[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('all'); // New date range type state

  const getHoldings = useCallback(async () => {
    try {
      const [h, cash] = await Promise.all([fetchHoldings(), fetchCashBalance()]);
      const tickers = [...new Set(h.map(x => x.ticker))];
      const analystData = tickers.length > 0 ? await fetchAnalystData(tickers) : [];
      const sectorMap: Record<string, string> = {};
      analystData.forEach(a => { if (a.sector) sectorMap[a.ticker] = a.sector; });
      setHoldings(h.map(x => ({ ...x, sector: sectorMap[x.ticker] })));
      setCashBalance(cash);
    } catch (error) {
      console.error("Failed to fetch holdings:", error);
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
  }, [getHoldings, getRealizedGains, getUnrealizedGains]);

  // Fetch transactions from backend with filters
  const getTransactions = useCallback(async () => { // Wrapped in useCallback
    setLoading(true);
    let finalStartDate: string | null = startDate;
    let finalEndDate: string | null = endDate;

    // Calculate start and end dates based on dateRangeType
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
    } // 'custom' range uses existing startDate/endDate states

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
    } finally {
      setLoading(false);
    }
  }, [setTransactions, setLoading, selectedBrokerages, selectedTickers, startDate, endDate, dateRangeType]); // Added dependencies

  useEffect(() => {
    getTransactions();
  }, [getTransactions]); // Depend on getTransactions

  const stats = useMemo((): PortfolioStats => {
    const investmentValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
    const totalValue = investmentValue + cashBalance;
    const totalCost = holdings.reduce((sum, h) => sum + h.totalCost, 0);
    const totalGain = investmentValue - totalCost;
    const gainPercentage = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    const dayChange = investmentValue * 0.012;
    const dayChangePercentage = 1.2;

    return { totalValue, investmentValue, totalGain, gainPercentage, dayChange, dayChangePercentage, buyingPower: cashBalance };
  }, [holdings, cashBalance]);

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
      await updateTransaction(id, updates as any);
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
      await Promise.all([getTransactions(), getHoldings(), getRealizedGains(), getUnrealizedGains()]);
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
      await Promise.all([getTransactions(), getHoldings(), getRealizedGains(), getUnrealizedGains()]);
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
      await Promise.all([getHoldings(), getRealizedGains(), getUnrealizedGains()]);
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
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar activeTab={activeTab} setActiveTab={handleSetActiveTab} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar stats={stats} onLogout={onLogout} sidebarCollapsed={sidebarCollapsed} />

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <DashboardView
            activeTab={activeTab}
            setActiveTab={handleSetActiveTab}
            holdings={holdings}
            transactions={transactions}
            realizedGains={realizedGains}
            unrealizedGains={unrealizedGains}
            stats={stats}
            onAddTransactions={handleAddTransactions}
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
          />
        </main>
      </div>

      {loading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
            <p className="mt-4 font-medium text-slate-700">Processing your statements...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
