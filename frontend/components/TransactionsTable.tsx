import React, { useState, useMemo } from 'react';
import { Transaction, DateRangeType } from '../types';

interface Props {
  transactions: Transaction[];
  onRemove: (id: string) => void;
  // Filter props from App.tsx
  selectedBrokerages: string[];
  setSelectedBrokerages: (b: string[]) => void;
  selectedTickers: string[];
  setSelectedTickers: (t: string[]) => void;
  startDate: string | null;
  setStartDate: (d: string | null) => void;
  endDate: string | null;
  setEndDate: (d: string | null) => void;
  dateRangeType: DateRangeType;
  setDateRangeType: (d: DateRangeType) => void;
}

const TransactionsTable: React.FC<Props> = ({
  transactions,
  onRemove,
  selectedBrokerages,
  setSelectedBrokerages,
  selectedTickers,
  setSelectedTickers,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  dateRangeType,
  setDateRangeType,
}) => {
  const uniqueBrokerages = useMemo(() => [
    'All',
    ...new Set(transactions.map(t => t.brokerage))
  ].sort((a, b) => {
    if (a === 'All') return -1;
    if (b === 'All') return 1;
    return a.localeCompare(b);
  }), [transactions]);

  const uniqueTickers = useMemo(() => [
    'All',
    ...new Set(transactions.map(t => t.ticker))
  ].sort((a, b) => {
    if (a === 'All') return -1;
    if (b === 'All') return 1;
    return a.localeCompare(b);
  }), [transactions]);

  const handleBrokerageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const options = Array.from(e.target.options);
    let value = options.filter(option => option.selected).map(option => option.value);

    if (value.includes('All')) {
      // If 'All' is selected, and it's the only selection, clear the filter (empty array)
      // If 'All' is selected along with other options, then only 'All' should be kept
      if (value.length === 1) {
        setSelectedBrokerages([]); // Empty array means all brokerages are selected
      } else {
        setSelectedBrokerages(value.filter(item => item !== 'All'));
      }
    } else {
      setSelectedBrokerages(value);
    }
  };

  const handleTickerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const options = Array.from(e.target.options);
    let value = options.filter(option => option.selected).map(option => option.value);

    if (value.includes('All')) {
      // If 'All' is selected, and it's the only selection, clear the filter (empty array)
      // If 'All' is selected along with other options, then only 'All' should be kept
      if (value.length === 1) {
        setSelectedTickers([]); // Empty array means all tickers are selected
      } else {
        setSelectedTickers(value.filter(item => item !== 'All'));
      }
    } else {
      setSelectedTickers(value);
    }
  };

  const handleDateChange = (setter: (d: string | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateValue = e.target.value;
    // Check if the date string is valid by attempting to create a Date object and checking its validity
    if (dateValue && !isNaN(new Date(dateValue).getTime())) {
      setter(dateValue);
    } else {
      setter(null);
    }
  };

  const resetFilters = () => {
    setSelectedBrokerages([]);
    setSelectedTickers([]);
    setStartDate(null);
    setEndDate(null);
    setDateRangeType('all'); // Reset date range type
  };

  // Client-side filtering (though backend also filters)
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const transactionDate = new Date(t.date);
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      if (selectedBrokerages.length > 0 && !selectedBrokerages.includes(t.brokerage)) {
        return false;
      }
      if (selectedTickers.length > 0 && !selectedTickers.includes(t.ticker)) {
        return false;
      }
      // Ensure valid date objects for comparison
      if (start && isNaN(start.getTime())) return false;
      if (end && isNaN(end.getTime())) return false;

      if (start && transactionDate < start) {
        return false;
      }
      if (end && transactionDate > end) {
        // Adjust end date to include the entire day
        const adjustedEndDate = new Date(end);
        adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);
        if (transactionDate >= adjustedEndDate) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, selectedBrokerages, selectedTickers, startDate, endDate]);

  const sortedTransactions = [...filteredTransactions].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const hasActiveFilters = selectedBrokerages.length > 0 || selectedTickers.length > 0 || startDate !== null || endDate !== null || dateRangeType !== 'all';

  if (transactions.length === 0 && !hasActiveFilters) {
    return (
      <div className="py-12 text-center text-slate-400 border-2 border-dashed rounded-xl border-slate-200">
        No transaction history found. Import your statements to populate this list.
      </div>
    );
  }

  if (filteredTransactions.length === 0 && hasActiveFilters) {
    return (
      <div className="py-12 text-center text-slate-400 border-2 border-dashed rounded-xl border-slate-200">
        No transactions match the current filter criteria. Please adjust your filters.
        <button onClick={resetFilters} className="ml-2 text-indigo-600 font-medium hover:underline">Reset Filters</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter Controls (Adopted styling from v3) */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex items-center space-x-2">
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  <span className="text-sm font-bold text-slate-700">Filters</span>
                </div>
                <div className="flex flex-wrap items-center gap-4 flex-1">
              {/* Brokerage Filter */}
              <div className="relative group flex-1 min-w-[150px]">
                <label htmlFor="brokerage-filter" className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter">Brokerage</label>
                <select
                  id="brokerage-filter"
                  multiple
                  value={selectedBrokerages}
                  onChange={handleBrokerageChange}
                  className="appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer w-full"
                >
                  {uniqueBrokerages.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
      
              {/* Symbol Filter */}
              <div className="relative group flex-1 min-w-[150px]">
                <label htmlFor="ticker-filter" className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter">Symbol</label>
                <select
                  id="ticker-filter"
                  multiple
                  value={selectedTickers}
                  onChange={handleTickerChange}
                  className="appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer w-full"
                >
                  {uniqueTickers.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              </div>
      
              {/* Date Range Type Filter */}
              <div className="relative group flex-1 min-w-[150px]">
                <label htmlFor="date-range-type" className="absolute -top-2 left-2 bg-white px-1 text-[9px] font-black text-indigo-500 uppercase tracking-tighter">Timeframe</label>
                <select
                  id="date-range-type"
                  value={dateRangeType}
                  onChange={(e) => setDateRangeType(e.target.value as DateRangeType)}
                  className="appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer w-full"
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
      
              {/* Custom Date Range Inputs */}
              {dateRangeType === 'custom' && (
                    <div className="flex items-center space-x-2 animate-in slide-in-from-left-2 duration-200">
                      <input
                        type="date"
                        value={startDate || ''}
                        onChange={handleDateChange(setStartDate)}
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <span className="text-slate-300 text-xs font-bold">to</span>
                      <input
                        type="date"
                        value={endDate || ''}
                        onChange={handleDateChange(setEndDate)}
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                  )}
                </div> {/* Closing div for "flex flex-wrap items-center gap-4 flex-1" */}
              <button
                onClick={resetFilters}
                className="text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-widest px-2"
              >
                Clear Filters
              </button>
              </div> {/* Closing div for "flex flex-wrap items-center gap-6" */}
            </div>
      {/* Transactions Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Brokerage</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Symbol</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Action</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Quantity</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Price</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Total Amount ($)</th>
              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {sortedTransactions.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-6 py-4 text-sm text-slate-600 font-medium whitespace-nowrap">
                  {new Date(t.date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                    t.brokerage === 'Robinhood' ? 'bg-emerald-50 text-emerald-600' :
                    t.brokerage === 'Schwab' ? 'bg-indigo-50 text-indigo-600' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {t.brokerage}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center space-x-2">
                    <div className="inline-flex items-center justify-center rounded bg-slate-100 px-2 py-1 font-bold uppercase text-slate-600 text-xs">
                      {t.ticker}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded-md text-[10px] font-bold uppercase ${
                    t.action === 'BUY' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {t.action}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-700">{t.quantity}</td>
                <td className="px-6 py-4 text-sm text-slate-700">{t.price.toFixed(2)}</td>
                <td className="px-6 py-4 font-bold text-slate-900">
                  {t.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => onRemove(t.id)}
                    className="p-1 text-slate-300 hover:text-rose-600 transition-colors"
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
    </div>
  );
};

export default TransactionsTable;