/**
 * Real footage for the junk .mp4/.mov files scattered through the machine (Downloads,
 * Pictures phone backup, and the like) that carry no story significance. A small pool of
 * Pixabay clips (content/filler-videos.json) is fetched once (see lib/fetchAssets.ts); a
 * junk video file picks one clip deterministically from a hash of its own path, the same
 * way lib/synth.ts picks a filler photo scene. Until the pool is fetched (no
 * PIXABAY_API_KEY_VIDEOS set), callers should fall back to the old silent placeholder.
 */
import { loadContent } from "./content";
import { locateAsset } from "./assets";

interface FillerVideoPool { clips: { id: string; query: string }[] }

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** The absolute path of the clip a given seed picks, or null if none has been fetched yet. */
export function pickFillerVideo(seed: string): string | null {
  const { clips } = loadContent<FillerVideoPool>("filler-videos.json");
  if (!clips.length) return null;
  const order = seedOf(seed) % clips.length;
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[(order + i) % clips.length];
    const full = locateAsset(`generated/filler-video/${clip.id}.mp4`);
    if (full) return full;
  }
  return null;
}
