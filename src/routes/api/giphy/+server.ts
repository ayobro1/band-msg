import { json } from "@sveltejs/kit";

const GIPHY_API = "https://api.giphy.com/v1/gifs";

export async function GET({ url, locals }: any) {
  const sessionToken = locals.sessionToken;
  if (!sessionToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GIPHY_API_KEY;
  if (!apiKey) {
    return json({ error: "GIPHY not configured" }, { status: 503 });
  }

  const q = url.searchParams.get("q") || "";
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "20", 10), 1), 50);
  const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);

  const endpoint = q.trim()
    ? `${GIPHY_API}/search?api_key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}&rating=pg-13&lang=en`
    : `${GIPHY_API}/trending?api_key=${encodeURIComponent(apiKey)}&limit=${limit}&offset=${offset}&rating=pg-13`;

  const res = await fetch(endpoint);
  if (!res.ok) {
    return json({ error: "GIPHY request failed" }, { status: 502 });
  }

  const data = await res.json();
  const gifs = (data.data || []).map((g: any) => ({
    id: g.id,
    title: g.title || "",
    url: g.images?.fixed_height?.url || g.images?.original?.url || "",
    preview: g.images?.fixed_height_small?.url || g.images?.preview_gif?.url || g.images?.fixed_height?.url || "",
    width: parseInt(g.images?.fixed_height?.width || "200", 10),
    height: parseInt(g.images?.fixed_height?.height || "200", 10)
  }));

  return json({ gifs });
}
