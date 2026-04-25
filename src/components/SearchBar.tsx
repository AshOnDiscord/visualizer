import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ProcessedPaper } from '../types';

interface SearchBarProps {
  papers: ProcessedPaper[];
  onResults: (ids: Set<string | number> | null, focusPaper?: ProcessedPaper) => void;
  disabled?: boolean;
}

export const SearchBar: React.FC<SearchBarProps> = ({ papers, onResults, disabled }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProcessedPaper[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback((q: string) => {
    if (!q.trim()) {
      setResults([]);
      setOpen(false);
      onResults(null);
      return;
    }

    const lower = q.toLowerCase();
    const terms = lower.split(/\s+/).filter(Boolean);

    // Score: all-terms match > partial match, ordered by score desc
    const scored: { paper: ProcessedPaper; score: number }[] = [];
    for (const paper of papers) {
      const title = paper.title.toLowerCase();
      let score = 0;
      for (const term of terms) {
        const idx = title.indexOf(term);
        if (idx === -1) { score = -1; break; }
        score += (idx === 0 ? 3 : 1) + (term.length / title.length) * 2;
      }
      if (score > 0) scored.push({ paper, score });
    }

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 8).map(s => s.paper);
    const allIds = new Set(scored.map(s => s.paper.id));

    setResults(top);
    setOpen(top.length > 0);
    setActiveIdx(0);
    onResults(allIds.size > 0 ? allIds : null, top[0]);
  }, [papers, onResults]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 120);
  };

  const handleSelect = (paper: ProcessedPaper) => {
    setQuery(paper.title);
    setOpen(false);
    onResults(new Set([paper.id]), paper);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[activeIdx]) handleSelect(results[activeIdx]);
    if (e.key === 'Escape') { setOpen(false); setQuery(''); onResults(null); }
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onResults(null);
    inputRef.current?.focus();
  };

  return (
    <div className="relative" style={{ width: 340 }}>
      {/* Input */}
      <div
        className="flex items-center gap-2 px-3"
        style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: open ? '10px 10px 0 0' : 10,
          height: 42,
          boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          transition: 'border-radius 0.1s',
        }}
      >
        <svg width="16" height="16" fill="none" stroke="#94a3b8" strokeWidth="2" viewBox="0 0 24 24" className="shrink-0">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search papers by title…"
          disabled={disabled}
          className="flex-1 outline-none bg-transparent text-sm text-gray-700 placeholder-gray-400"
          style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: 14 }}
        />
        {query && (
          <button onClick={handleClear} className="text-gray-300 hover:text-gray-500 transition-colors shrink-0">
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(0,0,0,0.1)',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            borderRadius: '0 0 10px 10px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
            zIndex: 100,
            overflow: 'hidden',
          }}
        >
          {results.map((p, i) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              className="w-full text-left px-3 py-2.5 transition-colors"
              style={{
                background: i === activeIdx ? 'rgba(79,110,247,0.06)' : 'transparent',
                borderBottom: i < results.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none',
              }}
            >
              <p
                className="text-sm text-gray-700 truncate"
                style={{ fontFamily: "'Crimson Pro', Georgia, serif", fontSize: 13 }}
              >
                {p.title}
              </p>
              {p.doi && p.doi !== 'null' && (
                <p className="text-xs text-gray-400 truncate mt-0.5" style={{ fontSize: 10 }}>
                  {p.doi}
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};