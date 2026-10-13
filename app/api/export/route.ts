import { exportPeriodExcel, requireSession, type ExportQuery } from "@/lib/server/store";
import { addDays, isDateKey, isMonthKey, mondayOf, monthBounds, shiftMonth, todayShanghai } from "@/lib/domain";

/** ?month=YYYY-MM 月报（含上月对比）；?week=YYYY-MM-DD 该日期所在周（周一至周日，含上周对比）；?from=&to= 自定义统计区间。可选 project、department、source */
export async function GET(request: Request) {
  try {
    const session = await requireSession(request); const params = new URL(request.url).searchParams;
    const filters = { project: params.get("project"), departmentId: params.get("department"), source: params.get("source") }, week = params.get("week");
    let query: ExportQuery;
    if (week) { if (!isDateKey(week)) throw new Error("周报日期不正确。"); const from = mondayOf(week); query = { kind: "week", from, to: addDays(from, 6), compareFrom: addDays(from, -7), compareTo: addDays(from, -1), ...filters }; }
    else if (params.has("from") || params.has("to")) query = { kind: "range", from: params.get("from") ?? "", to: params.get("to") ?? "", ...filters };
    else { const month = params.get("month") ?? todayShanghai().slice(0, 7); if (!isMonthKey(month)) throw new Error("月份不正确。"); const previous = monthBounds(shiftMonth(month, -1)); query = { kind: "month", ...monthBounds(month), compareFrom: previous.from, compareTo: previous.to, ...filters }; }
    const { fileName, content } = await exportPeriodExcel(session, query);
    return new Response(content, { headers: { "content-type": "application/vnd.ms-excel; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}` } });
  } catch (error) { const text = error instanceof Error ? error.message : "导出失败"; return Response.json({ error: text }, { status: text.includes("登录") ? 401 : 400 }); }
}
