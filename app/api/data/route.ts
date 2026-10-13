import { loadData, loadPeriod, requireSession } from "@/lib/server/store";
import { todayShanghai } from "@/lib/domain";

export async function GET(request: Request) {
  try {
    const session = await requireSession(request); const url = new URL(request.url), params = url.searchParams;
    if (params.get("view") === "period") return Response.json(await loadPeriod(session, { from: params.get("from"), to: params.get("to"), compareFrom: params.get("compareFrom"), compareTo: params.get("compareTo"), source: params.get("source") }));
    const date = params.get("date") ?? todayShanghai(); const project = params.get("project") ?? "全部";
    return Response.json(await loadData(session, date, project));
  } catch (error) { const text = error instanceof Error ? error.message : "加载失败"; return Response.json({ error: text }, { status: text.includes("登录") ? 401 : 500 }); }
}
