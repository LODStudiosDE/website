import { createServerFn } from "@tanstack/react-start";

const CHANNEL_URL = "https://www.youtube.com/@LODStudios/videos";

type Video = { videoId: string; title: string };

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\\u0026/g, "&")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(gta\s*v|mlo|map|ymap|fivem|fix|v\d+)\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length >= 2);
}

function score(productTitle: string, videoTitle: string): number {
  const a = tokens(productTitle);
  const b = new Set(tokens(videoTitle));
  if (a.length === 0) return 0;
  let hits = 0;
  for (const t of a) if (b.has(t)) hits++;
  const ratio = hits / a.length;
  // bonus for full normalized substring
  const na = normalize(productTitle);
  const nb = normalize(videoTitle);
  const sub = na && nb && (nb.includes(na) || na.includes(nb)) ? 0.25 : 0;
  return ratio + sub;
}

async function fetchChannelVideos(): Promise<Video[]> {
  const res = await fetch(CHANNEL_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) return [];
  const html = await res.text();
  const out: Video[] = [];
  const seen = new Set<string>();
  const re =
    /"lockupViewModel":\{([\s\S]+?)"contentId":"([A-Za-z0-9_-]{11})"[\s\S]+?"contentType":"LOCKUP_CONTENT_TYPE_VIDEO"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const block = m[1];
    const id = m[2];
    if (seen.has(id)) continue;
    const t = /"content":"([^"]+)"/.exec(block);
    if (!t) continue;
    seen.add(id);
    out.push({
      videoId: id,
      title: t[1].replace(/\\u0026/g, "&").replace(/\\"/g, '"'),
    });
  }
  return out;
}

let cache: { at: number; videos: Video[] } | null = null;

export const findChannelVideoForProduct = createServerFn({ method: "GET" })
  .inputValidator((d: { title: string }) => d)
  .handler(async ({ data }) => {
    const now = Date.now();
    if (!cache || now - cache.at > 1000 * 60 * 30) {
      cache = { at: now, videos: await fetchChannelVideos() };
    }
    const videos = cache.videos;
    if (videos.length === 0) return { videoId: null as string | null };
    let best: { v: Video; s: number } | null = null;
    for (const v of videos) {
      const s = score(data.title, v.title);
      if (!best || s > best.s) best = { v, s };
    }
    if (!best || best.s < 0.4) return { videoId: null };
    return { videoId: best.v.videoId, matched: best.v.title, score: best.s };
  });
