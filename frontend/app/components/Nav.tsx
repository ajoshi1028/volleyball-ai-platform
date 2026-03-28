"use client";

interface Props {
  currentFilm?: string;
  onBackToLibrary: () => void;
  analyzing?: boolean;
}

export default function Nav({ currentFilm, onBackToLibrary, analyzing }: Props) {
  return (
    <header
      className="flex items-center gap-3 px-5 py-2.5 border-b shrink-0"
      style={{ background: "var(--ppu-panel)", borderColor: "var(--ppu-border)" }}
    >
      <button
        onClick={onBackToLibrary}
        className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "var(--ppu-orange)" }}>
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="8" r="2.5" />
            <path d="M12 13l-4 7h8l-4-7z" />
            <path d="M5 3l2 4M19 3l-2 4" strokeLinecap="round" />
          </svg>
        </div>
        <span className="text-white font-bold text-sm tracking-tight">Pepperdine Volleyball AI</span>
      </button>

      {currentFilm && (
        <>
          <span className="text-slate-600 text-sm">/</span>
          <span className="text-slate-400 text-sm truncate max-w-xs">{currentFilm}</span>
        </>
      )}

      <div className="ml-auto flex items-center gap-3">
        {analyzing && (
          <span className="flex items-center gap-2 text-xs px-3 py-1 rounded-full animate-pulse-glow"
            style={{ background: "var(--ppu-orange-dim)", color: "var(--ppu-orange)" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--ppu-orange)" }} />
            AI Analyzing...
          </span>
        )}
        {currentFilm && (
          <button
            onClick={onBackToLibrary}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Library
          </button>
        )}
      </div>
    </header>
  );
}
