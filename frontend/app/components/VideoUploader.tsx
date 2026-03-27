"use client";

import { useRef, useState } from "react";
import { UploadResponse } from "../types";

const ACCEPTED_FORMATS = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/x-matroska"];
const API_BASE = "http://localhost:8000";

interface Props {
  onUploadComplete: (result: UploadResponse, localUrl: string) => void;
}

export default function VideoUploader({ onUploadComplete }: Props) {
  const [status, setStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!ACCEPTED_FORMATS.includes(file.type)) {
      setErrorMsg("Unsupported format. Use .mp4, .mov, .avi, or .mkv.");
      setStatus("error");
      return;
    }

    setStatus("uploading");
    setErrorMsg("");

    const localUrl = URL.createObjectURL(file);
    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/upload-video`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data: UploadResponse = await res.json();
      onUploadComplete(data, localUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed.");
      setStatus("error");
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-6" style={{ background: "var(--ppu-navy)" }}>
      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-white tracking-tight">Film Analysis</h1>
        <p className="text-slate-400 mt-2 text-sm">Upload practice film to analyze plays and track players</p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current?.click()}
        className="w-full max-w-xl flex flex-col items-center justify-center gap-4 rounded-2xl p-16 text-center cursor-pointer transition-all border-2 border-dashed"
        style={{
          background: dragOver ? "var(--ppu-orange-dim)" : "var(--ppu-panel)",
          borderColor: dragOver ? "var(--ppu-orange)" : "var(--ppu-border)",
        }}
      >
        <input ref={inputRef} type="file" accept={ACCEPTED_FORMATS.join(",")} onChange={onInputChange} className="hidden" />

        {status === "uploading" ? (
          <>
            <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--ppu-orange)", borderTopColor: "transparent" }} />
            <p className="text-sm text-slate-300">Uploading to cloud...</p>
          </>
        ) : (
          <>
            <svg className="w-12 h-12 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.069A1 1 0 0121 8.845v6.31a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
            <div>
              <p className="text-white font-semibold">Drop film here or click to browse</p>
              <p className="text-slate-500 text-xs mt-1">.mp4 · .mov · .avi · .mkv</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              className="mt-2 px-5 py-2 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--ppu-orange)" }}
            >
              Select File
            </button>
          </>
        )}
      </div>

      {status === "error" && (
        <p className="mt-4 text-sm text-red-400">{errorMsg}</p>
      )}

    </div>
  );
}
