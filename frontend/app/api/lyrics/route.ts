import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const artist = request.nextUrl.searchParams.get("artist")?.trim();
  const title = request.nextUrl.searchParams.get("title")?.trim();

  if (!artist || !title) {
    return NextResponse.json({ lyrics: null, error: "Missing artist or title" }, { status: 400 });
  }

  // TODO: Replace this placeholder with a licensed lyrics provider integration.
  return NextResponse.json({ lyrics: null });
}
