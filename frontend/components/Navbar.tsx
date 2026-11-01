import React from 'react';
import { PortfolioStats } from '../types';
import BrandLogo from './BrandLogo';
import { NAV_ITEMS } from './navItems';

interface Props {
  stats: PortfolioStats;
  onLogout: () => void;
  sidebarCollapsed: boolean;
  numbersVisible?: boolean;
  onToggleNumbers?: () => void;
  activeTab?: string;
}

const Navbar: React.FC<Props> = ({ stats, onLogout, sidebarCollapsed, numbersVisible = true, onToggleNumbers, activeTab = 'dashboardView' }) => (
  <nav className="h-16 border-b border-[#e7ecf3] bg-white flex items-center justify-between gap-3 px-4 md:px-8 shrink-0" aria-label="Account controls">
    <div className="text-xs text-slate-400 min-w-0">
      <span className="lg:hidden"><BrandLogo size={28} className="brand-mobile" /></span>
      <span className="hidden lg:inline">{sidebarCollapsed ? 'WealthCompass' : 'Workspace'} <span className="mx-2 text-slate-300">/</span> <span className="text-slate-600">{NAV_ITEMS.find(item => item.id === activeTab)?.label || 'Your portfolio'}</span></span>
    </div>
    <div className="flex items-center gap-3 md:gap-5 shrink-0">
      <span className="hidden sm:block text-xs text-slate-500">Portfolio <span className="ml-1 font-semibold text-[#354762] tabular-nums">{numbersVisible ? `$${stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '••••••'}</span></span>
      {onToggleNumbers && <button onClick={onToggleNumbers} aria-pressed={!numbersVisible} className="px-3 py-2 rounded-lg border border-[#e7ecf3] text-xs text-slate-500 hover:bg-slate-50" title={numbersVisible ? 'Hide financial figures' : 'Show financial figures'}>{numbersVisible ? 'Hide figures' : 'Show figures'}</button>}
      <button onClick={onLogout} className="text-xs font-medium text-slate-500 hover:text-[#2458d3] py-2">Sign out</button>
    </div>
  </nav>
);

export default Navbar;
