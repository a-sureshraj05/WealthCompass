
import React from 'react';
import { PortfolioStats } from '../types';

interface Props {
  stats: PortfolioStats;
  onLogout: () => void;
  sidebarCollapsed: boolean;
}

const Navbar: React.FC<Props> = ({ stats, onLogout, sidebarCollapsed }) => {
  return (
    <nav className="h-16 border-b border-[#E5E5E5] bg-white flex items-center justify-between px-8 shrink-0">
      <div className="flex items-center">
        {sidebarCollapsed && (
          <span className="text-lg font-bold text-[#0052FF]">WealthCompass</span>
        )}
      </div>

      <div className="flex items-center gap-6">
        <span className="text-sm font-semibold text-[#1A1C1D]">
          Portfolio:{' '}
          <span className="text-[#0052FF]">
            ${stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </span>

        {/* Bell */}
        <button className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-[#1A1C1D] transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </button>

        {/* Settings */}
        <button className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-[#1A1C1D] transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* User + Avatar */}
        <div className="flex items-center gap-3 border-l border-[#E5E5E5] pl-6">
          <div className="text-right hidden lg:block">
            <span className="block text-xs font-bold text-[#1A1C1D]">Account Holder</span>
            <span className="block text-[10px] text-slate-400 uppercase tracking-widest">Premium Member</span>
          </div>
          <button
            onClick={onLogout}
            title="Sign out"
            className="w-9 h-9 rounded-full bg-[#0052FF] flex items-center justify-center text-white font-bold text-xs hover:bg-[#003EC7] transition-colors"
          >
            SA
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
