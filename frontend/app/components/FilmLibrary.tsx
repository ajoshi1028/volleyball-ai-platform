"use client";

import { useRef, useState } from "react";
import { FilmRecord } from "../types";

const ACCEPTED_FORMATS = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"];

interface Props {
  films: FilmRecord[];
  localUrls: Map<string, string>;
  onOpen: (film: FilmRecord, localUrl: string) => void;
  onReupload: (film: FilmRecord, localUrl: string) => void;
  onNewUpload: (file: File) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(seconds?: number) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function FilmLibrary({ films, localUrls, onOpen, onReupload, onNewUpload }: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const reuploadRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [dragActive, setDragActive] = useState(false);

  function handleNewFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onNewUpload(file);
  }

  function handleReuploadFile(film: FilmRecord, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const localUrl = URL.createObjectURL(file);
    onReupload(film, localUrl);
  }

  function handleDrag(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const videoMimeTypes = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"];
      if (videoMimeTypes.includes(file.type) || file.name.match(/\.(mp4|mov|avi|mkv)$/i)) {
        onNewUpload(file);
      }
    }
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-8 py-8 transition-colors"
      style={{
        background: dragActive ? "var(--ppu-orange-dim)" : "var(--ppu-navy)",
      }}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <div className="max-w-5xl mx-auto">
        <h2 className="text-lg font-semibold text-white mb-6">Film Library</h2>

        {films.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-24 gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-2" style={{ background: "var(--ppu-card)" }}>
              <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <p className="text-white font-semibold text-lg">No film uploaded yet</p>
            <p className="text-slate-500 text-sm max-w-xs">Upload your first practice video to start analyzing plays and tracking players.</p>
            <button
              onClick={() => uploadRef.current?.click()}
              className="mt-2 px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-80"
              style={{ background: "var(--ppu-orange)" }}
            >
              Upload Film
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Upload card */}
          <button
            onClick={() => uploadRef.current?.click()}
            className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer"
            style={{
              borderColor: dragActive ? "var(--ppu-orange)" : "var(--ppu-border)",
              background: dragActive ? "var(--ppu-orange-dim)" : "var(--ppu-panel)",
              minHeight: "160px",
            }}
          >
            <input
              ref={uploadRef}
              type="file"
              accept={ACCEPTED_FORMATS.join(",")}
              className="hidden"
              onChange={handleNewFile}
            />
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "var(--ppu-orange-dim)" }}
            >
              <svg className="w-5 h-5" style={{ color: "var(--ppu-orange)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <span className="text-sm font-medium text-slate-300">Upload Film</span>
            <span className="text-xs text-slate-600">.mp4 · .mov · .avi · .mkv</span>
          </button>

          {/* Film cards */}
          {films.map((film) => {
            const hasLocalUrl = localUrls.has(film.id);
            return (
              <div
                key={film.id}
                className="flex flex-col rounded-xl border overflow-hidden"
                style={{ background: "var(--ppu-panel)", borderColor: "var(--ppu-border)" }}
              >
                {/* Thumbnail */}
                <div className="relative h-28 overflow-hidden" style={{ background: "var(--ppu-card)" }}>
                  {film.thumbnail ? (
                    <img src={film.thumbnail} alt={film.filename} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
                      </svg>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex flex-col gap-2 p-3">
                  <p className="text-sm font-medium text-white truncate">{film.filename}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{formatDate(film.uploadedAt)}</span>
                    {film.duration && (
                      <>
                        <span>·</span>
                        <span>{formatDuration(film.duration)}</span>
                      </>
                    )}
                  </div>

                  {hasLocalUrl ? (
                    <button
                      onClick={() => onOpen(film, localUrls.get(film.id)!)}
                      className="mt-1 w-full py-1.5 rounded-lg text-xs font-semibold text-white transition-opacity hover:opacity-80"
                      style={{ background: "var(--ppu-orange)" }}
                    >
                      Open
                    </button>
                  ) : (
                    <label
                      className="mt-1 w-full py-1.5 rounded-lg text-xs font-semibold text-center cursor-pointer transition-colors border"
                      style={{ color: "var(--ppu-orange)", borderColor: "rgba(255,99,0,0.3)", background: "var(--ppu-orange-dim)" }}
                    >
                      Re-upload to view
                      <input
                        type="file"
                        accept={ACCEPTED_FORMATS.join(",")}
                        className="hidden"
                        ref={(el) => {
                          if (el) reuploadRefs.current.set(film.id, el);
                        }}
                        onChange={(e) => handleReuploadFile(film, e)}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
