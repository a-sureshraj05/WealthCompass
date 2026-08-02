import React from 'react';

/**
 * Shared gain/loss presentation.
 *
 * Direction is carried by an arrow, not by a +/- sign or by colour alone.
 * Red and green are the pair most people with colour vision deficiency cannot
 * separate, so a sign encoded only in hue is a sign some readers never get.
 *
 * The steps below are darker than the emerald-600 / #FF3B30 previously used
 * around the app: at 11-12px those score 3.8:1 and 3.6:1 against white, under
 * the 4.5:1 WCAG AA floor for normal text. These pass at every size in use.
 *   emerald-700 #047857 -> 5.5:1
 *   rose-600    #e11d48 -> 4.7:1
 * On the dark tooltip surface (#1D1D1F) the lighter -400 steps are correct
 * instead; see SummaryCards.
 */
export const POSITIVE = 'text-emerald-700';
export const NEGATIVE = 'text-rose-600';

export const trendColor = (n: number) => (n >= 0 ? POSITIVE : NEGATIVE);

/** Direction triangle. Decorative — sign is announced via sr-only text. */
export const TrendArrow: React.FC<{ up: boolean; className?: string }> = ({ up, className = 'w-4 h-4' }) => (
  <svg className={`${className} shrink-0`} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {up ? <path d="M12 5l7 11H5z" /> : <path d="M12 19L5 8h14z" />}
  </svg>
);

/**
 * Arrow + unsigned amount, coloured by direction.
 *
 * `arrowClass` should shrink with the surrounding type — an arrow sized for a
 * 24px heading is comical beside 11px table text.
 */
export const SignedValue: React.FC<{
  value: number;
  format: (n: number) => string;
  className?: string;
  arrowClass?: string;
  suffix?: React.ReactNode;
}> = ({ value, format, className = '', arrowClass = 'w-3 h-3', suffix }) => {
  const up = value >= 0;
  return (
    <span className={`inline-flex items-center gap-1 ${trendColor(value)} ${className}`}>
      <TrendArrow up={up} className={arrowClass} />
      <span className="sr-only">{up ? 'up' : 'down'}</span>
      {format(Math.abs(value))}
      {suffix}
    </span>
  );
};
