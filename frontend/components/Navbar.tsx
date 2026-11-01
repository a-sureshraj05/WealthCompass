import React from 'react';
import { PortfolioStats } from '../types';
import BrandLogo from './BrandLogo';
import ProfileMenu from './ProfileMenu';
import { NAV_ITEMS } from './navItems';
import type { FinancialVisibility } from '../hooks/useFinancialVisibility';

interface Props {
  stats: PortfolioStats;
  onLogout: () => void | Promise<void>;
  sidebarCollapsed: boolean;
  numbersVisible?: boolean;
  activeTab?: string;
  privacy: FinancialVisibility;
}

const Navbar: React.FC<Props> = ({ stats, onLogout, sidebarCollapsed, numbersVisible = true, activeTab = 'dashboardView', privacy }) => (
  <nav className="h-16 border-b border-[#e7ecf3] bg-white flex items-center justify-between gap-3 px-4 md:px-8 shrink-0" aria-label="Account controls">
    <div className="text-xs text-slate-400 min-w-0">
      <span className="lg:hidden"><BrandLogo size={28} className="brand-mobile" /></span>
      <span className="hidden lg:inline">{sidebarCollapsed ? 'WealthCompass' : 'Workspace'} <span className="mx-2 text-slate-300">/</span> <span className="text-slate-600">{NAV_ITEMS.find(item => item.id === activeTab)?.label || 'Your portfolio'}</span></span>
    </div>
    <div className="flex items-center gap-3 md:gap-5 shrink-0">
      {import.meta.env.DEV && <a href="/design-preview?portfolio=100-mixed#dashboardView" className="text-xs font-medium text-[#526c91] hover:text-[#2458d3]">Sample portfolios</a>}
      <span className="hidden sm:block text-xs text-slate-500">Portfolio <span className="ml-1 font-semibold text-[#354762] tabular-nums">{numbersVisible ? `$${stats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '••••••'}</span></span>
      <ProfileMenu onLogout={onLogout} privacy={privacy} />
    </div>
  </nav>
);

export default Navbar;
