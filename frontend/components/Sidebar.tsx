import React from 'react';
import { NAV_ITEMS, TabId } from './navItems';
import BrandLogo from './BrandLogo';
import './sidebar.css';

interface Props {
  activeTab: string;
  setActiveTab: (tab: TabId) => void;
  collapsed: boolean;
  setCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
}

const Sidebar: React.FC<Props> = ({ activeTab, setActiveTab, collapsed, setCollapsed }) => (
  <aside className={`portfolio-sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="Portfolio workspace">
    <button className="sidebar-home" onClick={() => setActiveTab('dashboardView')} aria-label="WealthCompass home" title={collapsed ? 'WealthCompass home' : undefined}>
      <BrandLogo compact={collapsed} tagline size={36} />
    </button>
    <div className="sidebar-body">
      {!collapsed && <p className="sidebar-section-label">WORKSPACE</p>}
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {NAV_ITEMS.map(item => <button key={item.id} onClick={() => setActiveTab(item.id)} className={`sidebar-nav-item ${activeTab === item.id ? 'is-active' : ''}`} aria-current={activeTab === item.id ? 'page' : undefined} aria-label={item.label} title={collapsed ? item.label : item.description}>
          <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.65} d={item.icon} /></svg>
          {!collapsed && <><span>{item.label}</span>{activeTab === item.id && <i className="sidebar-active-dot" aria-hidden="true" />}</>}
        </button>)}
      </nav>
      {!collapsed && <><div className="sidebar-section-divider" /><section className="sidebar-connect-card" aria-label="Connect investments">
        <span className="sidebar-connect-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 10h18L12 4 3 10ZM5 10v8m7-8v8m7-8v8M3 21h18M3 18h18" /></svg></span>
        <h2>Your complete picture</h2><p>Bring your investments together in one clear view.</p>
        <button className="sidebar-connect-button" onClick={() => setActiveTab('importData')}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Connect brokerage</button>
      </section></>}
    </div>
    <footer className="sidebar-footer">
      {!collapsed && <div className="sidebar-security"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></svg><div><strong>Protected by encryption</strong><p>Sensitive portfolio amounts are encrypted on the server.</p></div></div>}
      <button className="sidebar-collapse" onClick={() => setCollapsed(v => !v)} aria-expanded={!collapsed} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : undefined}>
        {!collapsed && <span>Collapse sidebar</span>}<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M9 4v16" /><path d={collapsed ? 'm13 9 3 3-3 3' : 'm16 9-3 3 3 3'} /></svg>
      </button>
    </footer>
  </aside>
);

export default Sidebar;
