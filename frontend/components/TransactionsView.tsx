
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Transaction } from '../types';

type DateRangeType = 'all' | '30d' | '90d' | 'ytd' | 'custom';
type SortKey = 'date' | 'brokerage' | 'assetType' | 'ticker' | 'type' | 'quantity' | 'price' | 'amount';
type SortDirection = 'asc' | 'desc' | null;

interface Props {
  transactions: Transaction[];
  onRemove: (id: string) => void;
}

const TransactionsView: React.FC<Props> = ({ transactions, onRemove }) => {
  const [selectedBrokerages, setSelectedBrokerages] = useState<string[]>([]);
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Sorting state
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  
  const [isBrokerageMenuOpen, setIsBrokerageMenuOpen] = useState(false);
  const [isAssetTypeMenuOpen, setIsAssetTypeMenuOpen] = useState(false);
  const [isTickerMenuOpen, setIsTickerMenuOpen] = useState(false);
  
  const brokerageMenuRef = useRef<HTMLDivElement>(null);
  const assetTypeMenuRef = useRef<HTMLDivElement>(null);
  const tickerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (brokerageMenuRef.current && !brokerageMenuRef.current.contains(event.target as Node)) {
        setIsBrokerageMenuOpen(false);
      }
      if (assetTypeMenuRef.current && !assetTypeMenuRef.current.contains(event.target as Node)) {
        setIsAssetTypeMenuOpen(false);
      }
      if (tickerMenuRef.current && !tickerMenuRef.current.contains(event.target as Node)) {
        setIsTickerMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatAssetType = (type: string) => {
    if (!type) return '';
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  };

  const allBrokerages = useMemo(() => {
    const brokers = new Set(transactions.map(t => t.brokerage));
    return Array.from(brokers).sort();
  }, [transactions]);

  const allAssetTypes = ['EQUITY', 'OPTION'];

  const allTickers = useMemo(() => {
    const tickers = new Set(transactions.map(t => t.ticker));
    return Array.from(tickers).sort();
  }, [transactions]);

  const toggleBrokerage = (broker: string) => {
    setSelectedBrokerages(prev => 
      prev.includes(broker) ? prev.filter(b => b !== broker) : [...prev, broker]
    );
  };

  const toggleAssetType = (type: string) => {
    setSelectedAssetTypes(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const toggleTicker = (ticker: string) => {
    setSelectedTickers(prev => 
      prev.includes(ticker) ? prev.filter(t => t !== ticker) : [...prev, ticker]
    );
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') {
        setSortKey(null);
        setSortDirection(null);
      }
      else setSortDirection('asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
    const startOfYear = new Date(now.getFullYear(), 0, 1);

    let result = transactions.filter((t) => {
      const matchesBrokerage = selectedBrokerages.length === 0 || selectedBrokerages.includes(t.brokerage);
      const matchesAssetType = selectedAssetTypes.length === 0 || selectedAssetTypes.includes(t.assetType);
      const matchesTicker = selectedTickers.length === 0 || selectedTickers.includes(t.ticker);
      
      const transactionDate = new Date(t.date).getTime();
      
      let matchesDate = true;
      if (dateRangeType === '30d') matchesDate = transactionDate >= thirtyDaysAgo.getTime();
      else if (dateRangeType === '90d') matchesDate = transactionDate >= ninetyDaysAgo.getTime();
      else if (dateRangeType === 'ytd') matchesDate = transactionDate >= startOfYear.getTime();
      else if (dateRangeType === 'custom') {
        const matchesStart = !startDate || transactionDate >= new Date(startDate).getTime();
        const matchesEnd = !endDate || transactionDate <= new Date(endDate).getTime();
        matchesDate = matchesStart && matchesEnd;
      }

      return matchesBrokerage && matchesAssetType && matchesTicker && matchesDate;
    });

    // Apply Sorting
    if (sortKey && sortDirection) {
      result = [...result].sort((a, b) => {
        let valA: any;
        let valB: any;

        switch (sortKey) {
          case 'date':
            valA = new Date(a.date).getTime();
            valB = new Date(b.date).getTime();
            break;
          case 'brokerage':
            valA = a.brokerage.toLowerCase();
            valB = b.brokerage.toLowerCase();
            break;
          case 'assetType':
            valA = a.assetType.toLowerCase();
            valB = b.assetType.toLowerCase();
            break;
          case 'ticker':
            valA = a.ticker.toLowerCase();
            valB = b.ticker.toLowerCase();
            break;
          case 'type':
            valA = a.type.toLowerCase();
            valB = b.type.toLowerCase();
            break;
          case 'quantity':
            valA = a.quantity;
            valB = b.quantity;
            break;
          case 'price':
            valA = a.price;
            valB = b.price;
            break;
          case 'amount':
            valA = a.quantity * a.price;
            valB = b.quantity * b.price;
            break;
          default:
            return 0;
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      // Default Sort: Descending Date
      result = [...result].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    return result;
  }, [transactions, selectedBrokerages, selectedAssetTypes, selectedTickers, dateRangeType, startDate, endDate, sortKey, sortDirection]);

  const resetFilters = () => {
    setSelectedBrokerages([]);
    setSelectedAssetTypes([]);
    setSelectedTickers([]);
    setDateRangeType('all');
    setStartDate('');
    setEndDate('');
    setSortKey(null);
    setSortDirection(null);
  };

  const SortIndicator = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <svg className="w-3 h-3 ml-1 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>;
    return (
      <span className="ml-1 text-indigo-600">
        {sortDirection === 'asc' ? (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 15l7-7 7 7" /></svg>
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
        )}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative z-30">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center space-x-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <span className="text-sm font-bold text-slate-700">Refine List</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 flex-1">
            {/* Brokerage Filter */}
            <div className="relative" ref={brokerageMenuRef}>
              <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter z-10">Brokerage</label>
              <button
                onClick={() => setIsBrokerageMenuOpen(!isBrokerageMenuOpen)}
                className="flex items-center justify-between pl-3 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer min-w-[140px] text-left"
              >
                <span className="truncate max-w-[100px]">
                  {selectedBrokerages.length === 0 ? 'All Brokers' : 
                   selectedBrokerages.length === 1 ? selectedBrokerages[0] : 
                   `${selectedBrokerages.length} Brokers`}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isBrokerageMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {isBrokerageMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                  <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-[10px] font-black text-slate-400 uppercase px-2">Select Brokerages</span>
                    {selectedBrokerages.length > 0 && (
                      <button onClick={() => setSelectedBrokerages([])} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-2">Clear</button>
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                    {allBrokerages.map(broker => (
                      <label key={broker} className="flex items-center px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedBrokerages.includes(broker)}
                          onChange={() => toggleBrokerage(broker)}
                        />
                        <span className="ml-3 text-sm font-bold text-slate-700">{broker}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Asset Type Filter */}
            <div className="relative" ref={assetTypeMenuRef}>
              <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter z-10">Asset Type</label>
              <button
                onClick={() => setIsAssetTypeMenuOpen(!isAssetTypeMenuOpen)}
                className="flex items-center justify-between pl-3 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer min-w-[130px] text-left"
              >
                <span className="truncate max-w-[90px]">
                  {selectedAssetTypes.length === 0 ? 'All Types' : 
                   selectedAssetTypes.length === 1 ? formatAssetType(selectedAssetTypes[0]) : 
                   `${selectedAssetTypes.length} Types`}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isAssetTypeMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {isAssetTypeMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-48 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                  <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-[10px] font-black text-slate-400 uppercase px-2">Asset Types</span>
                    {selectedAssetTypes.length > 0 && (
                      <button onClick={() => setSelectedAssetTypes([])} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-2">Clear</button>
                    )}
                  </div>
                  <div className="p-2 space-y-1">
                    {allAssetTypes.map(type => (
                      <label key={type} className="flex items-center px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedAssetTypes.includes(type)}
                          onChange={() => toggleAssetType(type)}
                        />
                        <span className="ml-3 text-sm font-bold text-slate-700">{formatAssetType(type)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ticker Filter */}
            <div className="relative" ref={tickerMenuRef}>
              <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter z-10">Ticker</label>
              <button
                onClick={() => setIsTickerMenuOpen(!isTickerMenuOpen)}
                className="flex items-center justify-between pl-3 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer min-w-[140px] text-left"
              >
                <span className="truncate max-w-[100px]">
                  {selectedTickers.length === 0 ? 'All Tickers' : 
                   selectedTickers.length === 1 ? selectedTickers[0] : 
                   `${selectedTickers.length} Tickers`}
                </span>
                <svg className={`w-4 h-4 text-slate-400 transition-transform ${isTickerMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {isTickerMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50">
                  <div className="p-2 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <span className="text-[10px] font-black text-slate-400 uppercase px-2">Select Tickers</span>
                    {selectedTickers.length > 0 && (
                      <button onClick={() => setSelectedTickers([])} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 px-2">Clear</button>
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                    {allTickers.map(ticker => (
                      <label key={ticker} className="flex items-center px-3 py-2 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          checked={selectedTickers.includes(ticker)}
                          onChange={() => toggleTicker(ticker)}
                        />
                        <span className="ml-3 text-sm font-bold text-slate-700">{ticker}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative group">
                <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter">Timeframe</label>
                <select 
                  value={dateRangeType}
                  onChange={(e) => setDateRangeType(e.target.value as DateRangeType)}
                  className="appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer min-w-[150px]"
                >
                  <option value="all">All Time</option>
                  <option value="30d">Last 30 Days</option>
                  <option value="90d">Last 90 Days</option>
                  <option value="ytd">Year to Date</option>
                  <option value="custom">Custom Range...</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>

              {dateRangeType === 'custom' && (
                <div className="flex items-center space-x-2 animate-in slide-in-from-left-2 duration-200">
                  <input 
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <span className="text-slate-300 text-xs font-bold">to</span>
                  <input 
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              )}
            </div>
          </div>

          <button 
            onClick={resetFilters}
            className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-widest px-2"
          >
            Reset
          </button>
        </div>
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="py-20 text-center bg-white border border-slate-200 rounded-3xl shadow-sm">
          <div className="max-w-xs mx-auto space-y-4">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h4 className="text-slate-900 font-bold">No results found</h4>
            <p className="text-sm text-slate-400">No transactions match these criteria.</p>
            <button onClick={resetFilters} className="text-indigo-600 text-sm font-bold hover:underline">Clear all filters</button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200">
                <th 
                  className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors group/header"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center">
                    Date <SortIndicator column="date" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors group/header"
                  onClick={() => handleSort('brokerage')}
                >
                  <div className="flex items-center">
                    Brokerage <SortIndicator column="brokerage" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors group/header"
                  onClick={() => handleSort('assetType')}
                >
                  <div className="flex items-center">
                    Asset Type <SortIndicator column="assetType" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors group/header"
                  onClick={() => handleSort('ticker')}
                >
                  <div className="flex items-center">
                    Ticker <SortIndicator column="ticker" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors group/header"
                  onClick={() => handleSort('type')}
                >
                  <div className="flex items-center">
                    Action <SortIndicator column="type" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors group/header text-right"
                  onClick={() => handleSort('quantity')}
                >
                  <div className="flex items-center justify-end">
                    Quantity <SortIndicator column="quantity" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors group/header text-right"
                  onClick={() => handleSort('price')}
                >
                  <div className="flex items-center justify-end">
                    Price <SortIndicator column="price" />
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-indigo-600 transition-colors group/header text-right"
                  onClick={() => handleSort('amount')}
                >
                  <div className="flex items-center justify-end">
                    Total Amount ($) <SortIndicator column="amount" />
                  </div>
                </th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTransactions.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4 text-sm text-slate-500 font-medium whitespace-nowrap">
                    {new Date(t.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${
                      t.brokerage.toLowerCase().includes('robinhood') ? 'bg-orange-100 text-orange-700' :
                      t.brokerage.toLowerCase().includes('schwab') ? 'bg-fuchsia-100 text-fuchsia-800' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {t.brokerage}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${
                      t.assetType === 'OPTION' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {formatAssetType(t.assetType)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-tight">
                      {t.ticker}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${
                      t.type === 'BUY' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>
                      {t.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-700 font-bold text-right">{t.quantity}</td>
                  <td className="px-6 py-4 text-sm text-slate-500 font-medium text-right">${t.price.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-sm font-black text-slate-900">
                      ${(t.quantity * t.price).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => onRemove(t.id)}
                      className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TransactionsView;
