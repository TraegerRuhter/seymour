'use client';

import { useState } from 'react';
import type { ParsedRecipeData } from '@/lib/types';
import type { RecipeFormInitialValues } from './RecipeForm';
import { ClipboardIcon } from './icons';

function toInitialValues(data: ParsedRecipeData): RecipeFormInitialValues {
  return {
    title: data.title,
    sourceUrl: data.sourceUrl || '',
    imageUrl: data.imageUrl || '',
    ingredientsText: data.ingredientLines.join('\n'),
    instructionsText: data.instructions.join('\n'),
  };
}

/**
 * Fallback recipe import: paste the raw text of a recipe page (copy the
 * whole page, or just the recipe portion, and paste it here) and Seymour
 * pulls out the title/ingredients/steps to pre-fill the manual form below.
 * Works even when the URL importer can't reach or parse a page — the user
 * does the fetching by hand, so nothing about the site can block it.
 */
export default function PasteImport({ onExtracted }: { onExtracted: (values: RecipeFormInitialValues) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleExtract() {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const body = (await res.json().catch(() => null)) as
        | { status: 'success'; data: ParsedRecipeData }
        | { status: 'error'; message: string }
        | { error: string }
        | null;

      if (!res.ok || !body || 'error' in body) {
        setError((body && 'error' in body && body.error) || `Request failed (HTTP ${res.status})`);
        return;
      }
      if (body.status === 'error') {
        setError(body.message);
        return;
      }

      onExtracted(toInitialValues(body.data));
      setText('');
      setOpen(false);
    } catch {
      setError('Something went wrong. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-terracotta hover:underline"
      >
        <ClipboardIcon className="h-4 w-4" />
        Paste page text instead
      </button>
    );
  }

  return (
    <div className="glass-card space-y-3 p-4">
      <div>
        <label htmlFor="paste-text" className="mb-1 block text-sm font-medium">
          Paste the recipe page&apos;s text
        </label>
        <p className="mb-2 text-xs text-charcoal/50">
          Open the recipe on its site, select all (⌘/Ctrl+A) and copy, then paste the whole
          thing here — this works even when Seymour can&apos;t fetch or parse the page itself,
          since your browser did the hard part. We&apos;ll pull out the title, ingredients, and
          steps below for you to review before saving.
        </p>
        <textarea
          id="paste-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          className="input-base text-sm"
          placeholder="Paste the copied page text here…"
          disabled={busy}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-terracotta/10 px-4 py-2 text-sm text-terracotta-dark">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="button" onClick={handleExtract} className="btn-primary" disabled={busy || !text.trim()}>
          {busy ? (
            <>
              <span
                aria-hidden
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
              />
              Extracting…
            </>
          ) : (
            'Extract recipe'
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError('');
          }}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
