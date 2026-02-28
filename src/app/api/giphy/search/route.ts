import { NextRequest, NextResponse } from "next/server";

const GIPHY_API_KEY = process.env.GIPHY_API_KEY ?? "";

export async function GET(request: NextRequest) {
  if (!GIPHY_API_KEY) {
    return NextResponse.json(
      { error: "GIPHY_API_KEY not configured" },
      { status: 503 }
    );
  }

  const q = request.nextUrl.searchParams.get("q");
  const trending = request.nextUrl.searchParams.get("trending");

  let url: string;
  if (q) {
    url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(q)}&limit=20&rating=pg-13`;
  } else if (trending) {
    url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=pg-13`;
  } else {
    return NextResponse.json({ data: [] });
  }

  try {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) throw new Error("Giphy API error");
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch GIFs" },
      { status: 502 }
    );
  }
}
