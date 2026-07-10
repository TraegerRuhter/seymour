'use client';

import { useEffect, useRef, useState } from 'react';
import { exportBundle, importBundle, validateBundle } from '@/lib/actions';
import { useRecipeStore, useShoppingStore, usePlanStore, useSettingsStore } from '@/lib/stores';
import { useTheme, type ThemePreference } from '@/lib/theme';
import type { UnitSystem } from '@/lib/units';
import DangerZone from '@/components/DangerZone';
import { SunIcon, MoonIcon, SystemIcon, InstallIcon, type IconComponent } from '@/components/icons';

const UNIT_OPTIONS: Array<{ value: UnitSystem; label: string; hint: string }> = [
  { value: 'imperial', label: 'Imperial', hint: 'cups, oz, lb' },
  { value: 'metric', label: 'Metric', hint: 'mL, g, kg' },
];

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; Icon: IconComponent }> = [
  { value: 'light', label: 'Light', Icon: SunIcon },
  { value: 'dark', label: 'Dark', Icon: MoonIcon },
  { value: 'system', label: 'System', Icon: SystemIcon },
];

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function SettingsPage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [theme, setThemePref] = useTheme();
  const unitSystem = useSettingsStore((s) => s.unitSystem);
  const setUnitSystem = useSettingsStore((s) => s.setUnitSystem);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') setInstallEvent(null);
  }
  const recipeCount = useRecipeStore((s) => Object.keys(s.recipes).length);
  const planDays = usePlanStore((s) => s.plan?.length ?? 0);
  const itemCount = useShoppingStore((s) => s.items.length);

  function handleExport() {
    const bundle = exportBundle();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `seymour-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: 'ok', text: 'Backup downloaded.' });
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text());
      if (!validateBundle(data)) {
        setMessage({ kind: 'error', text: 'That file is not a valid Seymour backup.' });
        return;
      }
      const ok = window.confirm(
        `Importing will replace your current data (${recipeCount} recipes). Continue?`,
      );
      if (!ok) return;
      importBundle(data);
      setMessage({ kind: 'ok', text: 'Data imported successfully.' });
    } catch {
      setMessage({ kind: 'error', text: 'Could not read that file as JSON.' });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="mt-1 text-charcoal/60">
          Everything lives in this browser&apos;s storage — nothing is sent to a server.
        </p>
      </header>

      <section aria-label="Data summary" className="glass-card grid grid-cols-3 gap-4 p-5 text-center">
        <div>
          <p className="text-2xl font-bold">{recipeCount}</p>
          <p className="text-sm text-charcoal/60">recipes</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{planDays}</p>
          <p className="text-sm text-charcoal/60">days planned</p>
        </div>
        <div>
          <p className="text-2xl font-bold">{itemCount}</p>
          <p className="text-sm text-charcoal/60">list items</p>
        </div>
      </section>

      <section aria-label="Appearance" className="glass-card space-y-3 p-5">
        <div>
          <h2 className="text-xl font-semibold">Appearance</h2>
          <p className="mt-1 text-sm text-charcoal/60">
            Pick a theme, or follow your device&apos;s setting.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Theme">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={theme === opt.value}
              onClick={() => setThemePref(opt.value)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                theme === opt.value
                  ? 'bg-terracotta text-white'
                  : 'border border-charcoal/15 bg-surface/70 text-charcoal/70 hover:bg-surface'
              }`}
            >
              <opt.Icon className="h-5 w-5" />
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Units" className="glass-card space-y-3 p-5">
        <div>
          <h2 className="text-xl font-semibold">Units</h2>
          <p className="mt-1 text-sm text-charcoal/60">
            Your shopping list is shown in one system, rounded up to tidy amounts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Measurement system">
          {UNIT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={unitSystem === opt.value}
              onClick={() => setUnitSystem(opt.value)}
              className={`inline-flex items-baseline gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                unitSystem === opt.value
                  ? 'bg-terracotta text-white'
                  : 'border border-charcoal/15 bg-surface/70 text-charcoal/70 hover:bg-surface'
              }`}
            >
              {opt.label}
              <span
                className={`text-xs ${unitSystem === opt.value ? 'text-white/70' : 'text-charcoal/40'}`}
              >
                {opt.hint}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Backup" className="glass-card space-y-4 p-5">
        <div>
          <h2 className="text-xl font-semibold">Backup & restore</h2>
          <p className="mt-1 text-sm text-charcoal/60">
            Your data is only in this browser. If you clear site data, it&apos;s gone — export a
            backup now and then.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={handleExport} className="btn-primary">
            Export all data
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} className="btn-secondary">
            Import data
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            onChange={handleImport}
            className="sr-only"
            aria-label="Import backup file"
          />
        </div>
        {message && (
          <p
            role="status"
            className={`rounded-xl px-4 py-2 text-sm ${
              message.kind === 'ok' ? 'bg-olive/15 text-olive-dark' : 'bg-terracotta/10 text-terracotta-dark'
            }`}
          >
            {message.text}
          </p>
        )}
      </section>

      <DangerZone />

      <section aria-label="About" className="glass-card space-y-3 p-5 text-sm text-charcoal/60">
        <h2 className="text-base font-semibold text-charcoal">About Seymour</h2>
        <p>
          A personal recipe collection, randomized meal planner, and smart shopping list. Feed it
          recipes and it grows. Install it to your home screen to use it like a native app — your
          library and list work offline.
        </p>
        {installEvent ? (
          <button type="button" onClick={handleInstall} className="btn-secondary text-sm">
            <InstallIcon className="h-5 w-5" /> Install Seymour
          </button>
        ) : (
          <p className="text-xs text-charcoal/40">
            If you don&apos;t see an install button, use your browser menu&apos;s &ldquo;Add to Home
            Screen&rdquo; / &ldquo;Install app&rdquo; option (or the app is already installed).
          </p>
        )}
      </section>
    </div>
  );
}
