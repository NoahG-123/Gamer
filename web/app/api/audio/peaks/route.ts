import { NextRequest } from "next/server";
import { getStoryFile, getNode } from "@/lib/vfs";
import { getRecording, loadRecordings, SR } from "@/lib/audio";
import { json, bad } from "@/lib/http";
export const dynamic = "force-dynamic";

/**
 * Waveform peaks for the audio editor: min/max per bucket across the whole file, computed
 * from the same renderer that produces the audio, so the picture matches what you hear.
 */
export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get("path") ?? "";
  const buckets = Math.min(4000, Math.max(200, Number(req.nextUrl.searchParams.get("buckets") ?? 1200)));
  const node = getNode(path);
  if (!node) return bad("not found", 404);
  const story = getStoryFile(path) as { render?: string } | null;
  const rec = story?.render ? getRecording(story.render) : null;
  if (!rec) return json({ peaks: [], seconds: 0, unsupported: true });

  const { peakBuckets } = await import("@/lib/audio");
  return json({ peaks: peakBuckets(rec, buckets), seconds: rec.seconds, sampleRate: SR, clips: rec.clips.map((c) => c.at), name: node.name, voices: Object.keys(loadRecordings().voices) });
}
