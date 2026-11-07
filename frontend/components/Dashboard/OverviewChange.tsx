import React from 'react';
import { SignedValue } from '../TrendIndicator';

/** Overview uses the same directional triangles as the Holdings tables. */
export default function OverviewChange({ value, format, size = 'compact', numbersVisible = true }: {
  value:number | null; format:(absolute:number) => string; size?:'metric' | 'compact'; numbersVisible?:boolean;
}) {
  const className = `overview-change overview-change--${size}`;
  if (!numbersVisible) return <span className={className}>••••••</span>;
  if (value === null || !Number.isFinite(value)) return <span className={className}>—</span>;
  if (value === 0) return <span className={`${className} is-neutral`}><span className="sr-only">unchanged</span>{format(0)}</span>;
  return <SignedValue value={value} format={format} className={className} arrowClass="overview-change-arrow" />;
}
