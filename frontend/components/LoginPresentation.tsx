import React from 'react';
import BrandLogo from './BrandLogo';
import LoginProductPreview from './LoginProductPreview';
import './login-page.css';

const features = [
  { number:'01',title:'See the whole picture',text:'Bring holdings, cash and transactions across your brokerages into one clear portfolio view.',icon:'M4 5h16v14H4zM4 10h16M10 10v9' },
  { number:'02',title:'Understand your results',text:'Explore performance against SPY, daily contributors and the gains behind each holding.',icon:'m4 17 5-6 4 3 7-9M15 5h5v5' },
  { number:'03',title:'Go deeper when it matters',text:'Inspect individual tax lots, review imports and follow news connected to the investments you own.',icon:'M5 4h14v16H5zM8 8h8M8 12h8M8 16h5' },
];
export default function LoginPresentation({ children, preview = false }: { children:React.ReactNode; preview?:boolean }) {
  return <div className="login-shell">
    <header className="login-header"><a href="#signin" aria-label="WealthCompass sign in"><BrandLogo size={38} tagline /></a><nav aria-label="Learn about WealthCompass"><a href="#features">What you can do</a><a href="#how-it-works">How it works</a><a href="#privacy">Your data</a></nav></header>
    {preview && <div className="login-preview-note">Local design preview · sign-in is disabled here.<a href="/design-preview?design=refined">Open dashboard preview →</a></div>}
    <main className="login-main">
      <div className="login-top-grid">
        <section className="login-story" aria-labelledby="login-headline"><p className="login-eyebrow">A LITTLE MORE PERSPECTIVE</p><h1 id="login-headline">Your investments.<br /><span>A clearer direction.</span></h1><p className="login-intro">One place to understand what you own, how it’s performing and what deserves your attention.</p>
          <div className="login-capabilities"><span>Stocks &amp; ETFs</span><i /><span>Options</span><i /><span>Multiple brokerages</span></div>
          <a className="login-explore-link" href="#features">Explore what you can do<span aria-hidden="true">↗</span></a>
          <LoginProductPreview />
        </section>
        <section id="signin" className="login-access" aria-label="Account access"><div className="login-access-card">{children}</div><p className="login-access-note"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>Your portfolio is associated with your account.</p></section>
      </div>
      <section id="features" className="login-features" aria-label="What you can do">{features.map(feature => <article key={feature.number}><div><span>{feature.number}</span><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={feature.icon} /></svg></div><h2>{feature.title}</h2><p>{feature.text}</p></article>)}</section>
      <div className="login-bottom-grid"><section id="how-it-works" className="login-how"><p className="login-eyebrow">GET YOUR BEARINGS</p><h2>A simpler way to stay informed</h2><ol><li><b>1</b><div><strong>Bring in your investments</strong><p>Connect a supported brokerage or import your transaction records.</p></div></li><li><b>2</b><div><strong>Explore your portfolio</strong><p>Review holdings, performance, cash and gains together.</p></div></li><li><b>3</b><div><strong>Keep the context close</strong><p>Follow portfolio news and inspect the records behind your results.</p></div></li></ol></section>
        <section id="privacy" className="login-questions"><p className="login-eyebrow">GOOD TO KNOW</p><h2>Your account, explained</h2><details><summary>How is my portfolio data handled?</summary><p>Your portfolio records are scoped to your signed-in account. Sensitive financial values are encrypted at rest. Use the profile visibility setting to hide figures on screen.</p></details><details><summary>What if I lose my password?</summary><p>Save the recovery key shown when you create your account. It is shown once and is needed to recover access to encrypted portfolio data.</p></details><details><summary>Can I use imported transactions?</summary><p>Yes. Accounts &amp; Imports supports importing transaction records as well as supported brokerage connections. Review imported records in Transactions.</p></details></section></div>
    </main><footer className="login-footer"><span>WealthCompass · Portfolio intelligence</span><p>A portfolio tracking tool. Market data may be delayed. Information is not investment or tax advice.</p><a href="#signin">Back to sign in ↑</a></footer>
  </div>;
}
