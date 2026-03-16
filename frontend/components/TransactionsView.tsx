import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Transaction } from '../types';

type DateRangeType = 'all' | '30d' | '90d' | 'ytd' | 'custom';
type SortKey = 'date' | 'brokerage' | 'assetType' | 'ticker' | 'action' | 'quantity' | 'price' | 'amount';
type SortDirection = 'asc' | 'desc' | null;

type VisibilityFilter = 'active' | 'hidden' | 'all';

interface Props {
  transactions: Transaction[];
  onRemove: (id: string) => void;
  onSoftDelete: (id: string, isDeleted: boolean) => void;
  onUpdate: (id: string, updates: Partial<Transaction>) => void;
  onRevert: (id: string) => void;
}

const TransactionsView: React.FC<Props> = ({ transactions, onRemove, onSoftDelete, onUpdate, onRevert }) => {
  const [selectedBrokerages, setSelectedBrokerages] = useState<string[]>([]);
  const [selectedAssetTypes, setSelectedAssetTypes] = useState<string[]>([]);
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [dateRangeType, setDateRangeType] = useState<DateRangeType>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Sorting state
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  
  const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('active');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<Transaction>>({});

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

  const allAssetTypes = useMemo(() => {
    const assetTypes = new Set(
      transactions
        .map(t => t.assetType && t.assetType.toUpperCase())
        .filter(Boolean) as string[]
    );
    return Array.from(assetTypes).sort();
  }, [transactions]);

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
    const normalizedType = type.toUpperCase(); // Normalize to uppercase
    setSelectedAssetTypes(prev => 
      prev.includes(normalizedType) ? prev.filter(t => t !== normalizedType) : [...prev, normalizedType]
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
      const matchesVisibility =
        visibilityFilter === 'all' ||
        (visibilityFilter === 'active' && !t.is_deleted) ||
        (visibilityFilter === 'hidden' && t.is_deleted);
      const matchesBrokerage = selectedBrokerages.length === 0 || selectedBrokerages.map(b => b.toLowerCase().trim()).includes((t.brokerage || '').toLowerCase().trim());
      const matchesAssetType = selectedAssetTypes.length === 0 || selectedAssetTypes.map(at => at.toLowerCase()).includes((t.assetType || '').toLowerCase());
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

      return matchesVisibility && matchesBrokerage && matchesAssetType && matchesTicker && matchesDate;
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
            valA = (a.assetType || '').toLowerCase();
            valB = (b.assetType || '').toLowerCase();
            break;
          case 'ticker':
            valA = a.ticker.toLowerCase();
            valB = b.ticker.toLowerCase();
            break;
          case 'action':
            valA = a.action.toLowerCase();
            valB = b.action.toLowerCase();
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
  }, [transactions, visibilityFilter, selectedBrokerages, selectedAssetTypes, selectedTickers, dateRangeType, startDate, endDate, sortKey, sortDirection]);

  const resetFilters = () => {
    setSelectedBrokerages([]);
    setSelectedAssetTypes([]);
    setSelectedTickers([]);
    setDateRangeType('all');
    setStartDate('');
    setEndDate('');
    setSortKey(null);
    setSortDirection(null);
    setVisibilityFilter('active');
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

          {/* Visibility Filter */}
          <div className="relative">
            <label className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter z-10">Show</label>
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
              {(['active', 'hidden', 'all'] as VisibilityFilter[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setVisibilityFilter(v)}
                  className={`px-3 py-2 text-xs font-bold capitalize transition-colors ${
                    visibilityFilter === v
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-500 hover:text-indigo-600'
                  }`}
                >
                  {v}
                </button>
              ))}
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
                <th className="px-4 py-4 w-10" title="Hide transaction from calculations">
                  <svg className="w-3.5 h-3.5 text-slate-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                </th>
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
                  onClick={() => handleSort('action')}
                >
                  <div className="flex items-center">
                    Action <SortIndicator column="action" />
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
              {filteredTransactions.map((t) => {
                const isEditing = editingId === t.id;
                const inputCls = "w-full px-2 py-1 text-xs border border-indigo-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400";

                const startEdit = () => {
                  setEditingId(t.id);
                  setEditDraft({
                    date: t.date.slice(0, 10),
                    brokerage: t.brokerage,
                    assetType: t.assetType,
                    ticker: t.ticker,
                    action: t.action,
                    quantity: t.quantity,
                    price: t.price,
                  });
                };

                const saveEdit = () => {
                  onUpdate(t.id, editDraft);
                  setEditingId(null);
                  setEditDraft({});
                };

                const cancelEdit = () => {
                  setEditingId(null);
                  setEditDraft({});
                };

                return (
                  <tr key={`${t.brokerage}-${t.id}`} className={`transition-colors group ${isEditing ? 'bg-indigo-50/60' : 'hover:bg-slate-50'} ${t.is_deleted && !isEditing ? 'opacity-40' : ''}`}>
                    {/* Hide checkbox */}
                    <td className="px-4 py-4 text-center">
                      {!isEditing && (
                        <input
                          type="checkbox"
                          checked={t.is_deleted}
                          onChange={() => onSoftDelete(t.id, !t.is_deleted)}
                          className="w-4 h-4 rounded border-slate-300 text-slate-400 focus:ring-slate-400 cursor-pointer"
                          title={t.is_deleted ? 'Restore transaction' : 'Hide from calculations'}
                        />
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {isEditing ? (
                        <input type="date" className={inputCls} value={editDraft.date as string || ''}
                          onChange={e => setEditDraft(d => ({ ...d, date: e.target.value }))} />
                      ) : (
                        <span className="text-sm text-slate-500 font-medium">{new Date(t.date).toLocaleDateString('en-CA')}</span>
                      )}
                    </td>

                    {/* Brokerage */}
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <input className={inputCls} value={editDraft.brokerage || ''}
                          onChange={e => setEditDraft(d => ({ ...d, brokerage: e.target.value }))} />
                      ) : (
                        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${
                          t.brokerage.toLowerCase().includes('robinhood') ? 'bg-orange-100 text-orange-700' :
                          t.brokerage.toLowerCase().includes('schwab') ? 'bg-fuchsia-100 text-fuchsia-800' :
                          'bg-slate-100 text-slate-600'
                        }`}>{t.brokerage}</span>
                      )}
                    </td>

                    {/* Asset Type */}
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <input className={inputCls} value={editDraft.assetType || ''}
                          onChange={e => setEditDraft(d => ({ ...d, assetType: e.target.value }))} />
                      ) : (
                        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${
                          (t.assetType || '').toLowerCase() === 'options' ? 'bg-purple-100 text-purple-700' :
                          (t.assetType || '').toLowerCase() === 'equity' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>{formatAssetType(t.assetType || '')}</span>
                      )}
                    </td>

                    {/* Ticker */}
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <input className={inputCls} value={editDraft.ticker || ''}
                          onChange={e => setEditDraft(d => ({ ...d, ticker: e.target.value.toUpperCase() }))} />
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-bold uppercase tracking-tight">{t.ticker}</span>
                      )}
                    </td>

                    {/* Action */}
                    <td className="px-6 py-4">
                      {isEditing ? (
                        <input className={inputCls} value={editDraft.action || ''}
                          onChange={e => setEditDraft(d => ({ ...d, action: e.target.value.toUpperCase() }))} />
                      ) : (
                        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${
                          ['BUY', 'BTO'].includes(t.action.toUpperCase()) ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>{t.action}</span>
                      )}
                    </td>

                    {/* Quantity */}
                    <td className="px-6 py-4 text-right">
                      {isEditing ? (
                        <input type="number" className={inputCls + ' text-right'} value={editDraft.quantity ?? ''}
                          onChange={e => setEditDraft(d => ({ ...d, quantity: parseFloat(e.target.value) }))} />
                      ) : (
                        <span className="text-sm text-slate-700 font-bold">{t.quantity}</span>
                      )}
                    </td>

                    {/* Price */}
                    <td className="px-6 py-4 text-right">
                      {isEditing ? (
                        <input type="number" className={inputCls + ' text-right'} value={editDraft.price ?? ''}
                          onChange={e => setEditDraft(d => ({ ...d, price: parseFloat(e.target.value) }))} />
                      ) : (
                        <span className="text-sm text-slate-500 font-medium">${t.price.toFixed(2)}</span>
                      )}
                    </td>

                    {/* Total Amount */}
                    <td className="px-6 py-4 text-right">
                      <div className="text-sm font-black text-slate-900">
                        ${((isEditing ? (editDraft.quantity ?? t.quantity) * (editDraft.price ?? t.price) : t.quantity * t.price)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={saveEdit} className="p-1.5 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-all" title="Save">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                          </button>
                          <button onClick={cancelEdit} className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-all" title="Cancel">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1.5">
                          {t.is_override && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest bg-amber-100 text-amber-600">edited</span>
                          )}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            {t.is_override && (
                              <button onClick={() => onRevert(t.id)} className="p-1.5 text-slate-300 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all" title="Revert to original">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                              </button>
                            )}
                            <button onClick={startEdit} className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Edit transaction">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => onRemove(t.id)} className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="Delete transaction">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TransactionsView;
