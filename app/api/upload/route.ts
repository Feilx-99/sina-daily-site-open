import { requireSession, uploadPhoto } from "@/lib/server/store";

export async function POST(request: Request) {
  try {
    const session = await requireSession(request); const data = await request.formData(); const file = data.get("file");
    if (!(file instanceof File)) throw new Error("请选择照片。");
    return Response.json(await uploadPhoto(session, String(data.get("reportId") ?? ""), file, String(data.get("caption") ?? "")));
  } catch (error) { const text = error instanceof Error ? error.message : "上传失败"; return Response.json({ error: text }, { status: text.includes("登录") ? 401 : 400 }); }
}
