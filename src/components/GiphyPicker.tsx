"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface GiphyPickerProps {
  onSelect: (gifUrl: string, gifId: string) => void;
  onClose: () => void;
}

interface GiphyGif {
  id: string;
  images: {
    fixed_height_small: { url: string; width: string; height: string };
    original: { url: string };
  };
  title: string;
}

export default function GiphyPicker({ onSelect, onClose }: GiphyPickerProps) {
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setError("");
    try {
      const endpoint = q.trim()
        ? `/api/giphy/search?q=${encodeURIComponent(q.trim())}`
        : `/api/giphy/search?trending=1`;
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("Failed to load GIFs");
      const data = await res.json();
      setGifs(data.data ?? []);
    } catch {
      setError("Could not load GIFs");
      setGifs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load trending on mount
  useEffect(() => {
    search("");
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [search]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="absolute bottom-full left-0 right-0 z-50 mx-2 mb-2 max-h-80 overflow-hidden rounded-lg border border-[#1e1f22] bg-[#2b2d31] shadow-xl md:left-auto md:right-4 md:mx-0 md:w-96">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#1e1f22] px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs..."
          className="min-w-0 flex-1 rounded-md bg-[#1e1f22] px-3 py-1.5 text-sm text-gray-200 placeholder-gray-500 outline-none"
        />
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="scroll-area grid max-h-60 grid-cols-2 gap-1 overflow-y-auto p-2">
        {loading && gifs.length === 0 && (
          <div className="col-span-2 flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-[#5865f2]" />
          </div>
        )}
        {error && (
          <p className="col-span-2 py-4 text-center text-xs text-red-400">{error}</p>
        )}
        {gifs.map((gif) => (
          <button
            key={gif.id}
            onClick={() => onSelect(gif.images.fixed_height_small.url, gif.id)}
            className="overflow-hidden rounded transition-transform hover:scale-105"
            title={gif.title}
          >
            <img
              src={gif.images.fixed_height_small.url}
              alt={gif.title}
              className="h-24 w-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
        {!loading && !error && gifs.length === 0 && (
          <p className="col-span-2 py-4 text-center text-xs text-gray-500">No GIFs found</p>
        )}
      </div>

      {/* Giphy attribution */}
      <div className="border-t border-[#1e1f22] px-3 py-1 text-right">
        <span className="text-[10px] text-gray-600">Powered by GIPHY</span>
      </div>
    </div>
  );
}
