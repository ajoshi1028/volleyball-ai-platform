"use client";

// -----------------------------------------------------------------
// This component is a placeholder.
// When Yoshi and Josh finalize the detection/play data formats,
// replace the contents of the <pre> block with real UI.
// Update DetectionResult and PlayResult in ../types.ts to match.
// -----------------------------------------------------------------

import { DetectionResult, PlayResult } from "../types";

interface Props {
  detection: DetectionResult | null;
  plays: PlayResult | null;
}

export default function DetectionResults({ detection, plays }: Props) {
  if (!detection && !plays) return null;

  return (
    <div className="w-full max-w-lg mt-8 space-y-4">
      {detection && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-700 mb-2">Detection Output</h2>
          {/* Replace this with real UI once Yoshi finalizes the data format */}
          <pre className="text-xs text-zinc-500 overflow-auto">{JSON.stringify(detection, null, 2)}</pre>
        </div>
      )}

      {plays && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="text-sm font-semibold text-zinc-700 mb-2">Play Recognition</h2>
          {/* Replace this with real UI once Josh finalizes the data format */}
          <pre className="text-xs text-zinc-500 overflow-auto">{JSON.stringify(plays, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
