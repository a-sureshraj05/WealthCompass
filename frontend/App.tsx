
import React, { useState, useEffect, useMemo } from 'react';
import { StockHolding, PortfolioStats } from './types';
import Dashboard from './components/Dashboard';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

const App: React.FC = () => {
  const [holdings, setHoldings] = useState<StockHolding[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'holdings' | 'import'>('dashboard');

  // Load initial data from local storage for persistence (secured locally)
  useEffect(() => {
    const saved = localStorage.getItem('wealthcompass_holdings');
    if (saved) {
      try {
        setHoldings(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved data");
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('wealthcompass_holdings', JSON.stringify(holdings));
  }, [holdings]);

  const stats = useMemo((): PortfolioStats => {
    const totalValue = holdings.reduce((sum, h) => sum + (h.quantity * h.currentPrice), 0);
    const totalCost = holdings.reduce((sum, h) => sum + (h.quantity * h.avgPrice), 0);
    const totalGain = totalValue - totalCost;
    const gainPercentage = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    
    // Simulating day change for demo
    const dayChange = totalValue * 0.012; 
    const dayChangePercentage = 1.2;

    return { totalValue, totalGain, gainPercentage, dayChange, dayChangePercentage };
  }, [holdings]);

  const handleAddHoldings = (newHoldings: StockHolding[]) => {
    setHoldings(prev => [...prev, ...newHoldings]);
  };

  const handleRemoveHolding = (id: string) => {
    setHoldings(prev => prev.filter(h => h.id !== id));
  };

  const handleClearAll = () => {
    if (window.confirm("Are you sure you want to clear all data? This cannot be undone.")) {
      setHoldings([]);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <Navbar stats={stats} />
        
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <Dashboard 
            activeTab={activeTab} 
            holdings={holdings} 
            stats={stats}
            onAddHoldings={handleAddHoldings}
            onRemoveHolding={handleRemoveHolding}
            onClearAll={handleClearAll}
            setLoading={setLoading}
            loading={loading}
          />
        </main>
      </div>

      {loading && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent"></div>
            <p className="mt-4 font-medium text-slate-700">Gemini AI is analyzing your statements...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
