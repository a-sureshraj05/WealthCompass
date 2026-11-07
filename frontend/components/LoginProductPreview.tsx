import React, { useId, useState } from 'react';

type PreviewView = 'overview' | 'performance' | 'news';
const views: { id:PreviewView; label:string }[] = [
  { id:'overview',label:'Overview' },{ id:'performance',label:'Performance' },{ id:'news',label:'Portfolio news' },
];
export default function LoginProductPreview({ initialView = 'overview' }: { initialView?:PreviewView }) {
  const [view,setView] = useState<PreviewView>(initialView);
  const id = useId();
  const keyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = views.findIndex(item => item.id === view);
    const next = event.key === 'ArrowRight' ? (index + 1) % views.length : event.key === 'ArrowLeft' ? (index + views.length - 1) % views.length : event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : null;
    if (next === null) return;
    event.preventDefault(); setView(views[next].id);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-view="${views[next].id}"]`)?.focus();
  };
  return <div className="login-product-example" aria-label="Illustrative portfolio preview">
    <div className="login-example-heading"><span><i />Your portfolio, connected</span><small>ILLUSTRATIVE VIEW</small></div>
    <div className="login-example-tabs" role="tablist" aria-label="Explore the product preview">{views.map(item => <button key={item.id} type="button" role="tab" data-view={item.id} id={`${id}-${item.id}-tab`} aria-selected={view === item.id} aria-controls={`${id}-panel`} tabIndex={view === item.id ? 0 : -1} onClick={() => setView(item.id)} onKeyDown={keyDown}>{item.label}</button>)}</div>
    <div className="login-example-panel" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${view}-tab`} tabIndex={0}>
      {view === 'overview' ? <div className="login-example-layout"><div className="login-example-compass" aria-hidden="true"><svg viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="48" stroke="#e5edf7" strokeWidth="10" /><circle cx="60" cy="60" r="48" stroke="#5e88bd" strokeWidth="10" strokeDasharray="125 302" transform="rotate(-90 60 60)" /><circle cx="60" cy="60" r="48" stroke="#a7c8c2" strokeWidth="10" strokeDasharray="92 302" strokeDashoffset="-130" transform="rotate(-90 60 60)" /><path d="m60 33 10 27-10 27-10-27Z" fill="#527baa" /><path d="m60 33 10 27H60Z" fill="#a8c3e1" /></svg></div><div className="login-example-rows">{['A consolidated view','Performance in context','The detail behind each lot'].map((label,index) => <div key={label}><span><i style={{background:['#5e88bd','#91b8ae','#b8a6c5'][index]}} />{label}</span><div><span style={{width:`${[84,65,47][index]}%`}} /></div></div>)}</div></div> : view === 'performance' ? <div className="login-example-performance"><div className="login-example-chart-legend"><span><i />Portfolio</span><span><i />SPY</span><small>Illustrative comparison</small></div><svg viewBox="0 0 440 112" role="img" aria-label="Illustrative portfolio and SPY chart, not historical returns" preserveAspectRatio="none"><defs><linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8baed4" stopOpacity=".25" /><stop offset="100%" stopColor="#8baed4" stopOpacity="0" /></linearGradient></defs><path d="M0 24h440M0 57h440M0 90h440" stroke="#e7edf5" strokeDasharray="3 5" fill="none" /><path d="M0 88C30 85 30 65 55 70S95 88 120 60S160 76 190 46S220 65 250 36S288 55 320 27S365 43 400 18L440 12V112H0Z" fill={`url(#${id}-area)`} /><path d="M0 88C30 85 30 65 55 70S95 88 120 60S160 76 190 46S220 65 250 36S288 55 320 27S365 43 400 18L440 12" stroke="#5b83b4" strokeWidth="2.5" fill="none" /><path d="M0 88C35 88 45 77 70 79S115 69 150 72S195 53 225 59S275 44 310 49S365 31 400 36L440 24" stroke="#a594b5" strokeWidth="2" strokeDasharray="5 4" fill="none" /></svg><p>See performance with a benchmark beside it.</p></div> : <div className="login-example-news">{['News for what you own','Earnings and company updates','Context from the broader market'].map((title,index) => <div key={title}><span aria-hidden="true">{String(index + 1).padStart(2,'0')}</span><div><strong>{title}</strong><i /></div><span aria-hidden="true">↗</span></div>)}</div>}
    </div>
    <p>{view === 'overview' ? 'Move from the big picture to the details, at your own pace.' : view === 'performance' ? 'Illustration only · no historical returns or account data.' : 'Feature preview · no live headlines or account data.'}</p>
  </div>;
}
