"use client";

interface Props {
  currentFilm?: string;
  onBackToLibrary?: () => void;
  rightSlot?: React.ReactNode;
}

export default function Nav({ currentFilm, onBackToLibrary, rightSlot }: Props) {
  return (
    <header
      className="flex items-center gap-3 px-5 py-2.5 border-b shrink-0"
      style={{ background: "var(--ppu-panel)", borderColor: "var(--ppu-border)" }}
    >
      {/* Logo */}
      <button
        onClick={onBackToLibrary}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        <div className="w-2 h-2 rounded-full" style={{ background: "var(--ppu-orange)" }} />
        <span className="text-white font-semibold text-sm tracking-tight">Pepperdine Film Analysis</span>
      </button>

      {/* Breadcrumb */}
      {currentFilm && (
        <>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400 text-sm truncate max-w-xs">{currentFilm}</span>
        </>
      )}

      <div className="ml-auto flex items-center gap-3">
        {rightSlot}
        {currentFilm && onBackToLibrary && (
          <button
            onClick={onBackToLibrary}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Library
          </button>
        )}
      </div>
    </header>
  );
}
