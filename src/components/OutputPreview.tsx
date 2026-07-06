"use client";

import { Download } from "lucide-react";

export type OutputKind = "image" | "audio" | "video" | "text";

/** Sniff a data: URI's media type so output can be previewed/downloaded correctly.
 * Matches any encoding token (";base64,", ";utf8,", etc.) — the demo image
 * placeholder in particular is a URL-encoded SVG ("data:image/svg+xml;utf8,..."),
 * not base64, and previously fell through to "text" (downloading as a .txt
 * file full of URL-escaped SVG markup instead of rendering as an image).
 *
 * Some providers (e.g. fal.ai, if sync_mode isn't honored for a given model)
 * return a hosted https:// URL instead of a data: URI — for those, fall back
 * to the caller-supplied modality instead of misreading them as plain text.
 *
 * Shared by the creator dashboard (its own generated output) and the
 * developer dashboard (previewing what a developer's agents have produced
 * for creators) — both render the same kinds of output. */
export function outputMeta(output: string, modalityHint?: OutputKind): { kind: OutputKind; extension: string } {
  const dataMatch = output.match(/^data:([a-z0-9]+)\/([a-z0-9.+-]+);[a-z0-9-]+,/i);
  if (dataMatch) {
    const [, type, subtype] = dataMatch;
    const extension = subtype === "mpeg" ? "mp3" : subtype.split("+")[0] || "bin";
    if (type === "image" || type === "audio" || type === "video") {
      return { kind: type, extension };
    }
    return { kind: "text", extension: "txt" };
  }

  if (/^https?:\/\//i.test(output) && modalityHint && modalityHint !== "text") {
    const lastSegment = output.split(/[?#]/)[0].split(".").pop() ?? "";
    const extension = /^[a-z0-9]{2,4}$/i.test(lastSegment) ? lastSegment : { image: "png", audio: "mp3", video: "mp4" }[modalityHint];
    return { kind: modalityHint, extension };
  }

  return { kind: "text", extension: "txt" };
}

/** Renders generated content with an actual preview + a real download link — for
 * data: URI or hosted-URL outputs (image/audio/video) that used to just show
 * "(binary output generated)" with no way to see or save them. */
export function OutputPreview({
  output,
  filenameBase,
  modalityHint,
}: {
  output: string;
  filenameBase: string;
  modalityHint?: OutputKind;
}) {
  const meta = outputMeta(output, modalityHint);
  const isHostedUrl = /^https?:\/\//i.test(output);
  const downloadHref = meta.kind === "text" ? `data:text/plain;charset=utf-8,${encodeURIComponent(output)}` : output;
  const filename = `${filenameBase}.${meta.extension}`;

  return (
    <div className="mt-2 space-y-2">
      {meta.kind === "image" && (
        <img src={output} alt="Generated output" className="max-h-64 rounded-lg border border-border-subtle" />
      )}
      {meta.kind === "audio" && <audio controls src={output} className="w-full" />}
      {meta.kind === "video" && (
        <video controls src={output} className="max-h-64 w-full rounded-lg border border-border-subtle" />
      )}
      {meta.kind === "text" && (
        <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-background p-3 text-xs text-foreground">
          {output}
        </p>
      )}
      <a
        href={downloadHref}
        download={filename}
        target={isHostedUrl ? "_blank" : undefined}
        rel={isHostedUrl ? "noreferrer" : undefined}
        className="inline-flex items-center gap-1 text-xs text-neon hover:underline"
      >
        <Download size={12} /> Download {meta.kind === "text" ? "as .txt" : meta.kind}
      </a>
    </div>
  );
}
