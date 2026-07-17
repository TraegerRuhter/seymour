'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreIcon, type IconComponent } from './icons';

export interface ActionMenuItem {
  label: string;
  icon?: IconComponent;
  onSelect: () => void;
  /** 'danger' renders in terracotta for destructive actions. */
  tone?: 'default' | 'danger';
}

/**
 * A three-dot action menu rendered through a portal to document.body.
 *
 * The portal matters: list rows and plan tiles live inside framer-motion
 * `layout` elements, each of which creates its own stacking context — an
 * absolutely-positioned popover anchored inside one paints *behind* later
 * siblings and its clicks get eaten. Fixed-position coordinates from
 * getBoundingClientRect sidestep that entirely, with an upward flip when
 * there isn't room below.
 */
export default function ActionMenu({
  ariaLabel,
  items,
  className,
}: {
  ariaLabel: string;
  items: ActionMenuItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top?: number; bottom?: number; right: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function updatePosition() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const MENU_HEIGHT_ESTIMATE = 44 * items.length + 12;
    const openUpward =
      window.innerHeight - rect.bottom < MENU_HEIGHT_ESTIMATE && rect.top > MENU_HEIGHT_ESTIMATE;
    setCoords({
      right: window.innerWidth - rect.right,
      ...(openUpward ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  }

  useEffect(() => {
    if (!open) return;
    updatePosition();
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={
          className ??
          'rounded-lg p-1.5 text-charcoal/40 transition-colors hover:bg-charcoal/5 hover:text-charcoal'
        }
      >
        <MoreIcon className="h-4 w-4" />
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: coords.top, bottom: coords.bottom, right: coords.right }}
            className="fixed z-50 w-52 overflow-hidden rounded-xl border border-charcoal/10 bg-surface py-1 shadow-card-hover"
          >
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-charcoal/5 ${
                    item.tone === 'danger' ? 'text-terracotta-dark' : 'text-charcoal'
                  }`}
                >
                  {Icon && <Icon className="h-4 w-4 shrink-0" />}
                  {item.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
