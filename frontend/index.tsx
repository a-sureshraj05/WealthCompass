
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Imported here rather than <link>ed from index.html so PostCSS/Tailwind
// actually process it and Vite fingerprints the output.
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
