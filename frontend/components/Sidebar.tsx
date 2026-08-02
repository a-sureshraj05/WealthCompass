import React from 'react';
import { NAV_ITEMS, TabId } from './navItems';

interface Props {
  activeTab: string;
  setActiveTab: (tab: TabId) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
}

const Sidebar: React.FC<Props> = ({ activeTab, setActiveTab, collapsed, setCollapsed }) => {

  const menuItems = NAV_ITEMS;

  const handleClick = (id: string) => {
    if (activeTab === id) {
      setCollapsed(prev => !prev);
    } else {
      setActiveTab(id as any);
    }
  };

  return (
    <aside className={`bg-white border-r border-[#D2D2D7] flex flex-col shrink-0 hidden lg:flex transition-all duration-300 ${collapsed ? 'w-16' : 'w-64'}`}>
      {/* Logo */}
      <button
        onClick={() => setActiveTab('dashboardView')}
        className={`border-b border-[#D2D2D7] hover:bg-[#F5F5F7] transition-colors ${collapsed ? 'p-4 flex justify-center items-center h-16' : 'px-6 py-4'}`}
      >
        {collapsed ? (
          <span className="text-[#0F52BA] font-black text-lg">W</span>
        ) : (
          <div className="text-left">
            <span className="font-display text-lg font-bold text-[#0F52BA] block">WealthCompass</span>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.1em]">Wealth Management</span>
          </div>
        )}
      </button>

      {/* Nav */}
      <nav className="flex-1 mt-4 px-2 space-y-0.5">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleClick(item.id)}
            title={collapsed ? item.label : undefined}
            className={`w-full flex items-center px-3 py-2.5 transition-all duration-150 ${collapsed ? 'justify-center rounded' : 'space-x-3'} ${
              activeTab === item.id
                ? 'border-r-4 border-[#0F52BA] bg-[#0F52BA]/5 text-[#0F52BA] font-semibold'
                : 'rounded text-slate-600 hover:bg-[#F5F5F7] hover:text-[#1D1D1F]'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
            </svg>
            {!collapsed && <span className="text-sm font-medium whitespace-nowrap overflow-hidden">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Connect More */}
      {!collapsed && (
        <div className="px-4 pb-4">
          <button
            onClick={() => setActiveTab('importData')}
            className="w-full py-2.5 bg-[#0F52BA] text-white text-sm font-semibold rounded hover:bg-[#0A3E8F] transition-colors"
          >
            Connect More
          </button>
        </div>
      )}

      {/* Security note */}
      {!collapsed && (
        <div className="px-4 pb-5 border-t border-[#D2D2D7] pt-3">
          <div className="flex items-center gap-1.5 text-slate-400">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-[11px] font-medium">Security Note</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">All data processed locally. No personal data stored on servers.</p>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
