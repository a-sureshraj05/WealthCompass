
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { StockHolding, PortfolioStats, Transaction, DateRangeType, RealizedGain, UnrealizedLot } from './types';
import DashboardView from './components/Dashboard/DashboardView';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import { fetchHoldings, fetchTransactions, fetchRealizedGains, fetchUnrealizedGains, removeTransaction, softDeleteTransaction, triggerRealizedGainsProcess } from './services/apiService';

const App: React.FC = () => {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [realizedGains, setRealizedGains] = useState<RealizedGain[]>([]);
  const [unrealizedGains, setUnrealizedGains] = useState<UnrealizedLot[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboardView' | 'holdings' | 'importData' | 'transactions' | 'gainsLosses'>('dashboardView');

  // Filter states for transactions
  const [selectedBrokerages, setSelectedBrokerages] = useState<string[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('all'); // New date range type state

  const getHoldings = useCallback(async () => {
    try {
      setHoldings(await fetchHoldings());
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
    const totalValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
    const totalCost = holdings.reduce((sum, h) => sum + h.totalCost, 0);
    const totalGain = totalValue - totalCost;
    const gainPercentage = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    
    const dayChange = totalValue * 0.012; 
    const dayChangePercentage = 1.2;

    return { totalValue, totalGain, gainPercentage, dayChange, dayChangePercentage };
  }, [holdings]);

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

  const handleSoftDeleteTransaction = async (id: string, isDeleted: boolean) => {
    // Optimistic update — flip immediately so checkbox responds instantly
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, is_deleted: isDeleted } : t));
    try {
      await softDeleteTransaction(id, isDeleted);
    } catch (error) {
      // Revert on failure
      setTransactions(prev => prev.map(t => t.id === id ? { ...t, is_deleted: !isDeleted } : t));
      console.error("Failed to update transaction:", error);
    }
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to clear all data? This cannot be undone.")) {
      setHoldings([]);
      setTransactions([]);
      // TODO: Implement backend call to clear all holdings and transactions
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} onProcessGains={async () => {
        setLoading(true);
        try {
          await triggerRealizedGainsProcess();
          await Promise.all([getHoldings(), getRealizedGains(), getUnrealizedGains()]);
        } catch (error) {
          console.error("Failed to process gains:", error);
        } finally {
          setLoading(false);
        }
      }} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar stats={stats} />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <DashboardView
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            holdings={holdings}
            transactions={transactions}
            realizedGains={realizedGains}
            unrealizedGains={unrealizedGains}
            stats={stats}
            onAddTransactions={handleAddTransactions}
            onRemoveHolding={handleRemoveHolding}
            onRemoveTransaction={handleRemoveTransaction}
            onSoftDeleteTransaction={handleSoftDeleteTransaction}
            onClearAll={handleClearAll}
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
