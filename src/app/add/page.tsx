'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ParseResult } from '@/lib/types';
import { recipeFromParsed, saveRecipes } from '@/lib/actions';
import RecipeForm, { type RecipeFormInitialValues } from '@/components/RecipeForm';
import PasteImport from '@/components/PasteImport';

type Mode = 'url' | 'manual';

function AddRecipe() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get('mode') === 'manual' ? 'manual' : 'url');
  const [urlsText, setUrlsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [errors, setErrors] = useState<Array<{ url: string; message: string }>>([]);
  const [pastePrefill, setPastePrefill] = useState<RecipeFormInitialValues | undefined>();
  // Bumped on every successful paste-extraction to force RecipeForm to
  // remount with the new prefill values (it only reads them on mount).
  const [formKey, setFormKey] = useState(0);

  async function handleParse(e: React.FormEvent) {
    e.preventDefault();
    const urls = urlsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (urls.length === 0) return;

    setBusy(true);
    setErrors([]);
    setProgress(`Fetching ${urls.length} page${urls.length === 1 ? '' : 's'}…`);
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (HTTP ${res.status})`);
      }
      const { results } = (await res.json()) as { results: ParseResult[] };

      const succeeded = results.filter((r) => r.status === 'success');
      const failed = results.filter((r) => r.status === 'error');

      if (succeeded.length > 0) {
        saveRecipes(succeeded.map((r) => recipeFromParsed(r.data)));
      }
      setErrors(failed.map((r) => ({ url: r.url, message: r.message })));

      if (failed.length === 0) {
        router.push('/recipes');
        return;
      }
      if (succeeded.length > 0) {
        setProgress(
          `Saved ${succeeded.length} recipe${succeeded.length === 1 ? '' : 's'}. ${failed.length} URL${failed.length === 1 ? '' : 's'} failed:`,
        );
        setUrlsText(failed.map((r) => r.url).join('\n'));
      } else {
        setProgress('');
      }
    } catch (err) {
      setErrors([
        { url: '', message: err instanceof Error ? err.message : 'Something went wrong.' },
      ]);
      setProgress('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Add a recipe</h1>
        <p className="mt-1 text-charcoal/60">
          Paste recipe URLs and Seymour will extract everything, or type one in by hand.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Add method"
        className="inline-flex rounded-full border border-charcoal/15 bg-surface/60 p-1"
      >
        {(['url', 'manual'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === m ? 'bg-terracotta text-white' : 'text-charcoal/60 hover:text-charcoal'
            }`}
          >
            {m === 'url' ? 'From a URL' : 'Enter manually'}
          </button>
        ))}
      </div>

      {mode === 'url' ? (
        <form onSubmit={handleParse} className="space-y-4">
          <div>
            <label htmlFor="add-urls" className="mb-1 block text-sm font-medium">
              Recipe URLs{' '}
              <span className="font-normal text-charcoal/40">(one per line, up to 10)</span>
            </label>
            <textarea
              id="add-urls"
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              rows={6}
              className="input-base font-mono text-sm"
              placeholder={
                'https://cooking.example.com/best-pancakes\nhttps://blog.example.org/weeknight-curry'
              }
              disabled={busy}
            />
          </div>

          {progress && (
            <p className="text-sm text-charcoal/60" aria-live="polite">
              {progress}
            </p>
          )}
          {errors.length > 0 && (
            <ul
              role="alert"
              className="space-y-1 rounded-xl bg-terracotta/10 px-4 py-3 text-sm text-terracotta-dark"
            >
              {errors.map((e, i) => (
                <li key={i}>
                  {e.url && <span className="font-medium break-all">{e.url}: </span>}
                  {e.message}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className="btn-primary" disabled={busy || !urlsText.trim()}>
              {busy ? (
                <>
                  <span
                    aria-hidden
                    className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                  />
                  Parsing…
                </>
              ) : (
                'Parse & save'
              )}
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className="text-sm font-medium text-terracotta hover:underline"
            >
              or enter it manually
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <PasteImport
            onExtracted={(values) => {
              setPastePrefill(values);
              setFormKey((k) => k + 1);
            }}
          />
          <RecipeForm key={formKey} initialValues={pastePrefill} />
        </div>
      )}
    </div>
  );
}

export default function AddRecipePage() {
  // useSearchParams requires a Suspense boundary during prerender.
  return (
    <Suspense fallback={null}>
      <AddRecipe />
    </Suspense>
  );
}
