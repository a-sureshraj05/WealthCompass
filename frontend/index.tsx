
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Imported here rather than <link>ed from index.html so PostCSS/Tailwind
// actually process it and Vite fingerprints the output.
import './index.css';
import './components/workspace-theme.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
// An explicit development-only route: never bypass authentication in production.
const localPreview = import.meta.env.DEV && window.location.pathname === '/design-preview';
const DashboardPreview = localPreview ? React.lazy(() => import('./components/Dashboard/DashboardPreview')) : null;
root.render(
  <React.StrictMode>
    {DashboardPreview ? <React.Suspense fallback={<p className="p-8 text-slate-500">Loading design preview…</p>}><DashboardPreview /></React.Suspense> : <App />}
  </React.StrictMode>
);
