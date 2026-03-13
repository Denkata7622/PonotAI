import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const artist = request.nextUrl.searchParams.get("artist")?.trim();
  const title = request.nextUrl.searchParams.get("title")?.trim();

  if (!artist || !title) {
    return NextResponse.json({ lyrics: null });
  }

  try {
    const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`, {
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ lyrics: null });
    }

    const payload = (await response.json()) as { lyrics?: string };
    return NextResponse.json({ lyrics: typeof payload.lyrics === "string" ? payload.lyrics : null });
  } catch {
    return NextResponse.json({ lyrics: null });
  }
}
