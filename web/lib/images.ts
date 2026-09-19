/**
 * Image generation. OpenAI (GPT Image) is the only provider.
 *
 * Everything drawn here has to pass for a photograph someone actually took on the
 * machine's own camera roll, so the prompts name a body, a lens, an aperture and an ISO,
 * and then ask for the things a real frame has and a clean render does not: focus landing
 * slightly off, a hand smeared by too slow a shutter, noise in the shadows, fringing on a
 * bright edge, a colour cast off the walls, a horizon a degree out. `imperfect()` carries
 * that wording so every caller gets the same treatment, and `REALISM` closes each prompt
 * with the instruction not to tidy any of it up.
 */

const API = "https://api.openai.com/v1/images/generations";

export function imageKey(): string | null {
  return process.env.OPENAI_API_KEY || null;
}
function model(): string { return process.env.IMAGE_MODEL || "gpt-image-1"; }
function quality(): string { return process.env.IMAGE_QUALITY || "medium"; }

/** Models this key has no allowance for are not asked twice. */
const spent = new Set<string>();

export interface ImageRequest { prompt: string; size?: "1024x1024" | "1536x1024" | "1024x1536"; quality?: string; format?: "png" | "jpeg" | "webp" }

/**
 * One image, or null if the key is missing, out of allowance, or the call fails.
 * Never throws: imagery is decoration, and the machine works without it.
 */
export async function generateImage(req: ImageRequest): Promise<Buffer | null> {
  const key = imageKey();
  if (!key) return null;
  const m = model();
  if (spent.has(m)) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.IMAGE_TIMEOUT_MS ?? 180000));
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      // The manifest names these files .jpg, so ask for JPEG: PNG bytes under a .jpg
      // name are served with the wrong type and weigh forty times as much.
      body: JSON.stringify({
        model: m, prompt: req.prompt, size: req.size ?? "1024x1024", quality: req.quality ?? quality(), n: 1,
        output_format: req.format ?? "jpeg", output_compression: 88,
      }),
      signal: controller.signal,
    });
    if (res.status === 429 || res.status === 403) { spent.add(m); return null; }
    if (!res.ok) { console.warn(`[images] ${m} HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`); return null; }
    const data = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
    const first = data.data?.[0];
    if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
    if (first?.url) { const img = await fetch(first.url); return img.ok ? Buffer.from(await img.arrayBuffer()) : null; }
    return null;
  } catch (e) {
    console.warn("[images]", (e as Error).message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** A stable number from a string, so the same slot always asks for the same frame. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const at = <T,>(xs: T[], seed: number, shift = 0): T => xs[(seed >>> shift) % xs.length];

const BODIES = [
  "a Canon EOS 400D with the 18-55mm kit lens at 35mm, f/5.6, ISO 800",
  "an iPhone 11 rear camera, f/1.8, ISO 500, HDR off",
  "a Nikon D3100 with a 50mm f/1.8 wide open, ISO 1600",
  "a Pixel 4a in poor light, f/1.7, ISO 1200, one-handed",
  "a Sony NEX-5 with the 16mm pancake, f/2.8, ISO 640",
  "a 2013 Samsung compact at full zoom, f/5.9, ISO 400",
];
const FAULTS = [
  "focus landing a little behind the subject, motion blur in one hand from too slow a shutter",
  "slight camera shake, the horizon about a degree out of level, one corner softer than the rest",
  "visible sensor noise in the shadows, faint purple fringing on the brightest edge",
  "mild barrel distortion, a smear of lens flare from a light just outside the frame",
  "a greasy fingerprint haze across one side of the lens, shadows crushed to near black",
  "slight overexposure where a window blows out, the rest of the frame a stop under",
];
const CASTS = [
  "a green colour cast off the walls", "a warm tungsten cast nothing corrected for",
  "a cold blue cast from overcast daylight", "mixed lighting the white balance could not settle on",
];

/** The wording that turns a clean render into a photograph somebody actually took. */
export function imperfect(seed: number): string {
  return `Shot on ${at(BODIES, seed)}. ${at(FAULTS, seed, 5)}, ${at(CASTS, seed, 11)}. `
    + "Framing is casual and slightly off-centre, not composed. ";
}

export const REALISM =
  "This is an ordinary unedited JPEG straight off the card — no retouching, no colour grading, "
  + "no studio lighting, no stylisation, nothing tidied. Keep every flaw described above. "
  + "No text, no watermark, no border, no logo, no frame.";

/** A face that belongs to nobody, for a `person` slot. */
export function portraitPrompt(gender: "male" | "female", seed: number): string {
  const ages = ["in their twenties", "in their thirties", "in their forties", "in their fifties", "in their sixties", "in their seventies"];
  const where = [
    "indoors by a north-facing window on an overcast afternoon",
    "under a kitchen ceiling light at night",
    "outdoors on a grey day with the wind moving their hair",
    "in a hallway lit by one lamp further down it",
    "in a car in a car park, daylight through the windscreen",
  ];
  const doing = [
    "half-way through saying something, mouth open, eyes not on the lens",
    "caught just before they were ready, a flat unposed expression",
    "glancing sideways at whoever is holding the camera",
    "mid-blink, one shoulder turned away",
  ];
  const who = gender === "female" ? "a woman" : "a man";
  return `A candid snapshot of ${who} ${at(ages, seed)}, taken by a friend or family member, ${at(where, seed, 7)}. `
    + `${at(doing, seed, 13)}. Everyday worn clothes, no styling, no makeup for camera. `
    + "Cluttered domestic background thrown out of focus behind them. Head and shoulders. One person only. "
    + imperfect(seed) + REALISM;
}
