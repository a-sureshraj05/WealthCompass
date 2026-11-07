import { useEffect, useRef, useState } from 'react';
import { fetchPortfolioNews } from '../services/apiService';
import type { PortfolioNewsFeed } from '../services/apiService';

/** Owned by the authenticated shell, so tab changes reuse the session feed.
 * A new sign-in mounts a new hook/request. StrictMode effect replay shares the
 * same in-flight request, never a prior user's result or persistent browser cache.
 */
export default function usePortfolioNews() {
  const [nonce,setNonce] = useState(0);
  const [data,setData] = useState<PortfolioNewsFeed | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const request = useRef<{ nonce:number; promise:Promise<PortfolioNewsFeed> } | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    if (!request.current || request.current.nonce !== nonce) request.current = { nonce, promise:fetchPortfolioNews() };
    request.current.promise.then(feed => { if (active) setData(feed); }).catch(() => {
      if (active) setError('News could not be refreshed. Please try again.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [nonce]);
  return { data, loading, error, refresh:() => setNonce(value => value + 1) };
}
