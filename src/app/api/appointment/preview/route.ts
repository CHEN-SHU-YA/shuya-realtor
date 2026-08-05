import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.get("file") || "";
  const file = path.basename(requested);
  if (!/^appointment-[a-f0-9-]+\.html$/i.test(file)) {
    return new Response("找不到信件預覽。", { status: 404 });
  }

  try {
    const html = await fs.readFile(path.join(process.cwd(), "data", "outbox", file), "utf8");
    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return new Response("找不到信件預覽。", { status: 404 });
  }
}
