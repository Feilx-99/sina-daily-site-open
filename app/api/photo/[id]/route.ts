import { getPhoto, requireSession } from "@/lib/server/store";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession(request); const { id } = await context.params; const thumb = new URL(request.url).searchParams.get("size") === "thumb"; const photo = await getPhoto(session, id, thumb ? "thumb" : "full");
    if (!photo) return new Response("Not found", { status: 404 });
    return new Response(photo.object as BodyInit, { headers: { "content-type": photo.contentType, "cache-control": thumb ? "private, max-age=86400" : "private, max-age=3600", "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(photo.fileName)}` } });
  } catch (error) { return new Response(error instanceof Error ? error.message : "无法查看照片", { status: 403 }); }
}
