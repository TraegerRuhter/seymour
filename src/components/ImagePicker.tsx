'use client';

import { useRef, useState } from 'react';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB — generous for a photo, small enough to keep IndexedDB tidy.

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Recipe image field. Pasted/scraped recipes rarely come with a usable image
 * URL in plain text, so this offers three ways in: type/paste a URL, paste an
 * image directly from the clipboard (⌘/Ctrl+V after copying one from a
 * webpage), or drag-and-drop / pick a file. Pasted images are stored as data
 * URLs — the app already renders images via plain <img>, so a data: URL works
 * exactly like an https:// one, no server upload needed.
 */
export default function ImagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('That file isn’t an image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('That image is too large (max 8 MB).');
      return;
    }
    setError('');
    try {
      onChange(await readAsDataUrl(file));
    } catch {
      setError('Could not read that image — try a different file.');
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        void handleFile(item.getAsFile());
        return;
      }
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    void handleFile(e.dataTransfer.files?.[0]);
  }

  // A data: URL can be megabytes long — don't dump it into the visible text
  // field; the thumbnail + Remove button communicate that an image is set.
  const showUrlInField = !value.startsWith('data:');

  return (
    <div>
      <label htmlFor="rf-image" className="mb-1 block text-sm font-medium">
        Image <span className="font-normal text-charcoal/40">(optional)</span>
      </label>
      <div className="flex items-start gap-3">
        {value && (
          <div className="relative shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              className="h-16 w-16 rounded-xl border border-charcoal/10 object-cover"
            />
            <button
              type="button"
              onClick={() => onChange('')}
              aria-label="Remove image"
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-charcoal text-xs leading-none text-white shadow"
            >
              ×
            </button>
          </div>
        )}

        <div
          onPaste={handlePaste}
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          className={`flex-1 rounded-xl border border-dashed px-3 py-2 transition-colors ${
            dragOver ? 'border-terracotta bg-terracotta/5' : 'border-charcoal/20'
          }`}
        >
          <input
            id="rf-image"
            type="url"
            value={showUrlInField ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            className="input-base mb-1.5"
            placeholder="https://…"
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-charcoal/50">
            <span>or paste (⌘/Ctrl+V) / drop an image here</span>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="font-medium text-terracotta hover:underline"
            >
              Choose file
            </button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            onChange={(e) => void handleFile(e.target.files?.[0])}
            className="sr-only"
            aria-label="Choose an image file"
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-terracotta-dark">
          {error}
        </p>
      )}
    </div>
  );
}
