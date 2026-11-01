import React from 'react';
import { NAV_ITEMS, TabId } from './navItems';
import './workspace.css';

export default function WorkspacePage({ tab, actions, children }: { tab: TabId; actions?: React.ReactNode; children: React.ReactNode }) {
  const page = NAV_ITEMS.find(item => item.id === tab)!;
  return <section className="workspace-page" aria-labelledby={`page-${tab}`}>
    <header className="workspace-heading"><div><p className="workspace-eyebrow">{page.eyebrow}</p><h1 id={`page-${tab}`}>{page.label}</h1><p className="workspace-description">{page.description}</p></div>{actions && <div className="workspace-actions">{actions}</div>}</header>
    <div className="workspace-content">{children}</div>
  </section>;
}
