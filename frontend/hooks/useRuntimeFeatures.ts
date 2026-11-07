import { useEffect, useState } from 'react';
import { fetchRuntimeFeatures } from '../services/apiService';
import type { RuntimeFeatures } from '../services/apiService';

const disabled: RuntimeFeatures = { performanceDemo:false, refinedUi:false, holdingPerformancePreview:false };
export default function useRuntimeFeatures() {
  const [state,setState] = useState({ ...disabled, ready:false });
  useEffect(() => {
    let active = true;
    fetchRuntimeFeatures().then(features => { if (active) setState({ ...features, ready:true }); })
      .catch(() => { if (active) setState({ ...disabled, ready:true }); });
    return () => { active = false; };
  },[]);
  return state;
}
