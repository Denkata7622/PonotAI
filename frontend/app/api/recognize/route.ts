import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      code: "LEGACY_RECOGNIZE_REMOVED",
      message: "Legacy /api/recognize is removed. Use /api/recognition/audio, /api/recognition/video, or /api/recognition/image.",
    },
    { status: 410 },
  );
}
