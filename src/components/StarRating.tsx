'use client';

import { useState } from 'react';
import { StarIcon } from './icons';

const STAR_COUNT = 5;

/**
 * A 5-star rating control with half-star precision. Read-only (just the
 * stars, no buttons) when `onChange` is omitted, e.g. on a recipe card;
 * interactive otherwise. Each star is two stacked half-width buttons so
 * every half-star value is its own keyboard-focusable target, rather than
 * inferring a fractional rating from pointer position (which only mouse
 * users could reach).
 */
export default function StarRating({
  value,
  onChange,
  size = 'md',
  label = 'Rating',
}: {
  value?: number;
  onChange?: (value: number | undefined) => void;
  size?: 'sm' | 'md';
  label?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const interactive = !!onChange;
  const shown = hover ?? value ?? 0;
  const starSize = size === 'sm' ? 'h-4 w-4' : 'h-6 w-6';

  return (
    <span
      role={interactive ? 'group' : undefined}
      aria-label={label}
      className="inline-flex items-center gap-0.5"
      onMouseLeave={() => setHover(null)}
    >
      {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map((star) => {
        const fillPercent = Math.max(0, Math.min(1, shown - (star - 1))) * 100;
        return (
          <span key={star} className={`relative inline-block ${starSize}`}>
            <StarIcon className={`absolute inset-0 ${starSize} text-charcoal/25`} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fillPercent}%` }}>
              <StarIcon filled className={starSize} />
            </span>
            {interactive && (
              <>
                <button
                  type="button"
                  aria-label={`Rate ${star - 0.5} stars`}
                  onMouseEnter={() => setHover(star - 0.5)}
                  onFocus={() => setHover(star - 0.5)}
                  onBlur={() => setHover(null)}
                  onClick={() => onChange?.(value === star - 0.5 ? undefined : star - 0.5)}
                  className="absolute inset-y-0 left-0 w-1/2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/60"
                />
                <button
                  type="button"
                  aria-label={`Rate ${star} stars`}
                  onMouseEnter={() => setHover(star)}
                  onFocus={() => setHover(star)}
                  onBlur={() => setHover(null)}
                  onClick={() => onChange?.(value === star ? undefined : star)}
                  className="absolute inset-y-0 right-0 w-1/2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/60"
                />
              </>
            )}
          </span>
        );
      })}
      {interactive && value != null && (
        <button
          type="button"
          onClick={() => onChange?.(undefined)}
          className="ml-1.5 text-xs font-medium text-charcoal/40 hover:text-charcoal hover:underline"
        >
          Clear
        </button>
      )}
    </span>
  );
}
