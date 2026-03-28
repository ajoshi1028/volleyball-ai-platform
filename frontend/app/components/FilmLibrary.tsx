"use client";

import { useRef, useState } from "react";
import { FilmRecord } from "../types";

const ACCEPTED = "video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,.mp4,.mov,.avi,.mkv";

interface Props {
  films: FilmRecord[];
  localUrls: Map<string, string>;
  onOpen: (film: FilmRecord, localUrl: string) => void;
  onReupload: (film: FilmRecord, file: File) => void;
  onNewUpload: (file: File) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDuration(seconds?: number) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function FilmLibrary({
  films,
  localUrls,
  onOpen,
  onReupload,
  onNewUpload,
}: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  function handleFile(file: File) {
    if (file.type.startsWith("video/") || /\.(mp4|mov|avi|mkv)$/i.test(file.name)) {
      onNewUpload(file);
    }
  }

  function handleDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div
      className="flex-1 overflow-y-auto transition-colors"
      style={{ background: dragActive ? "rgba(255,99,0,0.05)" : "var(--ppu-navy)" }}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-white">Film Library</h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload practice film to analyze plays, track players, and detect ball movement
          </p>
        </div>

        {/* Card Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {/* Upload Card — always first */}
          <button
            onClick={() => uploadRef.current?.click()}
            className="group flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-8 transition-all cursor-pointer hover:border-[var(--ppu-orange)] hover:bg-[rgba(255,99,0,0.05)]"
            style={{
              borderColor: dragActive ? "var(--ppu-orange)" : "var(--ppu-border)",
              background: dragActive ? "rgba(255,99,0,0.08)" : "var(--ppu-panel)",
              minHeight: "280px",
            }}
          >
            <input
              ref={uploadRef}
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />

            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110"
              style={{ background: "var(--ppu-orange-dim)" }}
            >
              <svg
                className="w-7 h-7"
                style={{ color: "var(--ppu-orange)" }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-300 group-hover:text-white transition-colors">
                Upload New Film
              </p>
              <p className="text-xs text-slate-600 mt-1">Drag & drop or click to browse</p>
              <p className="text-[10px] text-slate-700 mt-1">.mp4 .mov .avi .mkv</p>
            </div>
          </button>

          {/* Film Cards */}
          {films.map((film) => {
            const hasLocal = localUrls.has(film.id);
            return (
              <div
                key={film.id}
                className="group flex flex-col rounded-2xl border overflow-hidden transition-all hover:border-[rgba(255,99,0,0.4)] animate-fade-in"
                style={{ background: "var(--ppu-panel)", borderColor: "var(--ppu-border)" }}
              >
                {/* Thumbnail */}
                <div
                  className="relative h-40 overflow-hidden"
                  style={{ background: "var(--ppu-card)" }}
                >
                  {film.thumbnail ? (
                    <img
                      src={film.thumbnail}
                      alt={film.filename}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <svg
                        className="w-12 h-12 text-slate-700"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Duration badge */}
                  {film.duration && (
                    <div
                      className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-[11px] font-medium tabular-nums"
                      style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}
                    >
                      {formatDuration(film.duration)}
                    </div>
                  )}

                  {/* Cloud badge */}
                  {film.gcs_uri && (
                    <div
                      className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ background: "rgba(0,0,0,0.6)", color: "#4ade80" }}
                    >
                      CLOUD
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-col gap-2 p-4 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{film.filename}</p>
                  <p className="text-xs text-slate-500">{formatDate(film.uploadedAt)}</p>

                  <div className="mt-auto pt-2">
                    {hasLocal ? (
                      <button
                        onClick={() => onOpen(film, localUrls.get(film.id)!)}
                        className="w-full py-2.5 rounded-xl text-xs font-bold text-white transition-all hover:opacity-90 hover:shadow-lg"
                        style={{ background: "var(--ppu-orange)" }}
                      >
                        Analyze Film
                      </button>
                    ) : (
                      <label
                        className="w-full py-2.5 rounded-xl text-xs font-bold text-center cursor-pointer transition-all border block hover:bg-[rgba(255,99,0,0.1)]"
                        style={{
                          color: "var(--ppu-orange)",
                          borderColor: "rgba(255,99,0,0.3)",
                        }}
                      >
                        Re-upload to Analyze
                        <input
                          type="file"
                          accept={ACCEPTED}
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) onReupload(film, f);
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty state */}
        {films.length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-600 text-sm">
              No films uploaded yet. Upload your first practice video to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
