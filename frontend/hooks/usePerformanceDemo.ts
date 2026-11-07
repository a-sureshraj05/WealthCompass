import { useEffect, useState } from 'react';
import { fetchPerformanceDemoEnabled } from '../services/apiService';

export default function usePerformanceDemo() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    fetchPerformanceDemoEnabled().then(value => { if (active) setEnabled(value); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return enabled;
}
