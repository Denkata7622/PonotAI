import { handleDownloadPost } from "@/lib/downloadRouteHandler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return handleDownloadPost(request);
}
