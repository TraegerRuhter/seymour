'use client';

import { useEffect, useState } from 'react';
import { THEME_STORAGE_KEY as STORAGE_KEY } from './theme-script';

export type ThemePreference = 'light' | 'dark' | 'system';

export function getStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyTheme(pref: ThemePreference): void {
  const dark = pref === 'dark' || (pref === 'system' && systemPrefersDark());
  document.documentElement.classList.toggle('dark', dark);
}

export function setTheme(pref: ThemePreference): void {
  if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, pref);
  applyTheme(pref);
}

/**
 * Reactive theme preference + setter. (Live OS-change tracking for "system"
 * mode lives in AppProviders so it runs app-wide.)
 */
export function useTheme(): [ThemePreference, (p: ThemePreference) => void] {
  const [pref, setPref] = useState<ThemePreference>('system');

  useEffect(() => {
    setPref(getStoredTheme());
  }, []);

  const update = (p: ThemePreference) => {
    setPref(p);
    setTheme(p);
  };
  return [pref, update];
}
