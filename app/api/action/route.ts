/* eslint-disable @typescript-eslint/no-explicit-any */
import { adminReview, adminSaveReport, deletePhoto, publishDate, requireSession, rotateAccessCode, saveReport } from "@/lib/server/store";

export async function POST(request: Request) {
  try {
    const session = await requireSession(request); const body = await request.json() as Record<string, any>; const action = String(body.action ?? "");
    if (action === "save_report" || action === "submit_report") return Response.json(await saveReport(session, body.report, action === "submit_report"));
    if (["approve", "return", "reopen"].includes(action)) { await adminReview(session, String(body.reportId), action as "approve" | "return" | "reopen", String(body.comment ?? "")); return Response.json({ ok: true }); }
    if (action === "admin_save") return Response.json(await adminSaveReport(session, String(body.reportId ?? ""), body.report));
    if (action === "publish") { if (session.role !== "admin") throw new Error("只有管理员可以发布日报。"); return Response.json(await publishDate(String(body.reportDate))); }
    if (action === "rotate_code") { await rotateAccessCode(session, String(body.accessId), String(body.code ?? "")); return Response.json({ ok: true }); }
    if (action === "delete_photo") { await deletePhoto(session, String(body.photoId)); return Response.json({ ok: true }); }
    throw new Error("不支持的操作。");
  } catch (error) { const text = error instanceof Error ? error.message : "操作失败"; return Response.json({ error: text }, { status: text.includes("登录") ? 401 : 400 }); }
}
