
import React from 'react';
import { PortfolioStats } from '../types';

interface Props {
  stats: PortfolioStats;
}

const Navbar: React.FC<Props> = ({ stats }) => {
  return (
    <nav className="h-16 border-b bg-white flex items-center justify-between px-8 shrink-0">
      <div className="flex items-center space-x-2">
        <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
          WealthCompass
        </h1>
      </div>

      <div className="hidden md:flex items-center space-x-8">
        <div className="flex flex-col items-end">
          <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Total Value</span>
          <span className="text-lg font-bold text-slate-900">
            ${stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        
        <div className="flex flex-col items-end">
          <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">Daily Change</span>
          <span className={`text-lg font-bold ${stats.dayChange >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            {stats.dayChange >= 0 ? '+' : ''}${Math.abs(stats.dayChange).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-sm font-medium ml-1">({stats.dayChangePercentage}%)</span>
          </span>
        </div>

        <div className="w-px h-8 bg-slate-200" />

        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
            SA
          </div>
<span className="text-sm font-medium text-slate-700">Account Holder</span>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
