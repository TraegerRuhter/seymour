/**
 * Isomorphic theme constants (no 'use client' so the server-rendered layout
 * can inline the init script).
 */

export const THEME_STORAGE_KEY = 'seymour-theme';

/**
 * Inline <script> body run before hydration so the right theme class is on
 * <html> before first paint (no light flash in dark mode).
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;
