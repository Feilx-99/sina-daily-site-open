import { DEPARTMENTS, PROJECTS, departmentById, sumKpis, type DepartmentDefinition, type Kpis } from "@/lib/domain";

/** live：管理员实时口径，只统计已审核日报；published：甲方口径，只统计每个日期最新一次发布的快照 */
export type PeriodSource = "live" | "published";
export const SOURCE_LABEL: Record<PeriodSource, string> = { live: "已审核日报（实时）", published: "已发布日报（甲方口径）" };
/** unpublished 仅出现在甲方口径：该日期尚未发布 */
export type DayStatus = "approved" | "submitted" | "returned" | "draft" | "missing" | "unpublished";
/** active：当天有任一部门日报记录或已发布，提交覆盖率以 active 天数为分母；stale：发布后又有审核/修改，需要重新发布 */
export type PeriodDay = { date: string; published: boolean; publishedAt: string | null; stale: boolean; active: boolean; statuses: Record<string, DayStatus> };
/** 一份纳入统计的部门日报（某部门某天）的 KPI 与数量型指标 */
export type PeriodFact = { date: string; departmentId: string; reporterName: string; kpis: Kpis; metrics: Record<string, number> };
/** 跟进事项按 id 去重，取期间内最后一次出现时的状态 */
export type PeriodFollowup = { id: string; departmentId: string; kind: string; category: string; content: string; status: string; responsiblePerson: string; dueDate: string | null; completedDate: string | null; isAbnormal: boolean; firstSeen: string; lastSeen: string; isNew: boolean; overdue: boolean };
export type PeriodIssue = { date: string; departmentId: string; kind: "routine" | "count"; label: string; value: string; count: number };
export type PeriodSlice = { from: string; to: string; days: PeriodDay[]; facts: PeriodFact[] };
export type PeriodData = PeriodSlice & { role: string; source: PeriodSource; today: string; followups: PeriodFollowup[]; issues: PeriodIssue[]; compare: PeriodSlice | null };

export function scopeDepartments(project: string, departmentId = "all") {
  return DEPARTMENTS.filter((department) => (project === "全部" || department.project === project) && (departmentId === "all" || department.id === departmentId));
}
export function scopeLabel(project: string, departmentId = "all") {
  const department = departmentById(departmentId);
  return department ? `${department.project}项目 · ${department.name}` : project === "全部" ? "全部项目" : `${project}项目`;
}

export type Coverage = { expected: number; submitted: number; approved: number; pending: number; returned: number; draft: number; missing: number };
const emptyCoverage = (): Coverage => ({ expected: 0, submitted: 0, approved: 0, pending: 0, returned: 0, draft: 0, missing: 0 });
function addCoverage(target: Coverage, source: Coverage) { for (const key of Object.keys(target) as Array<keyof Coverage>) target[key] += source[key]; return target; }
function countStatus(coverage: Coverage, status: DayStatus) {
  coverage.expected++;
  if (status === "approved") { coverage.submitted++; coverage.approved++; }
  else if (status === "submitted") { coverage.submitted++; coverage.pending++; }
  else if (status === "returned") coverage.returned++;
  else if (status === "draft") coverage.draft++;
  else coverage.missing++;
}

export type DaySummary = { day: PeriodDay; reports: number; kpis: Kpis | null };
export type DepartmentSummary = { department: DepartmentDefinition; reports: number; kpis: Kpis; metrics: Record<string, number>; coverage: Coverage };
export type ProjectSummary = { project: string; departments: number; reports: number; kpis: Kpis; coverage: Coverage };
export type PeriodSummary = { dayCount: number; activeDays: number; publishedDays: number; staleDays: number; dataDays: number; totals: Kpis; byDay: DaySummary[]; byDepartment: DepartmentSummary[]; byProject: ProjectSummary[]; coverage: Coverage };

/** 期间汇总：合计 = 期间内逐份日报 KPI 之和，与每天日报看板（同一项目筛选）的数字相加一致；日均按“有数据的天数”计算 */
export function summarizePeriod(slice: PeriodSlice, departments: DepartmentDefinition[]): PeriodSummary {
  const ids = new Set(departments.map((department) => department.id)), facts = slice.facts.filter((fact) => ids.has(fact.departmentId));
  const factsByDate = new Map<string, PeriodFact[]>();
  for (const fact of facts) factsByDate.set(fact.date, [...(factsByDate.get(fact.date) ?? []), fact]);
  const byDay = slice.days.map((day) => { const list = factsByDate.get(day.date) ?? []; return { day, reports: list.length, kpis: list.length ? sumKpis(list.map((fact) => fact.kpis)) : null }; });
  const activeDays = slice.days.filter((day) => day.active);
  const byDepartment = departments.map((department) => {
    const own = facts.filter((fact) => fact.departmentId === department.id), metrics: Record<string, number> = {}, coverage = emptyCoverage();
    for (const fact of own) for (const [key, amount] of Object.entries(fact.metrics)) metrics[key] = (metrics[key] ?? 0) + amount;
    for (const day of activeDays) countStatus(coverage, day.statuses[department.id] ?? "missing");
    return { department, reports: own.length, kpis: sumKpis(own.map((fact) => fact.kpis)), metrics, coverage };
  });
  const byProject = PROJECTS.filter((project) => departments.some((department) => department.project === project)).map((project) => {
    const list = byDepartment.filter((item) => item.department.project === project);
    return { project, departments: list.length, reports: list.reduce((sum, item) => sum + item.reports, 0), kpis: sumKpis(list.map((item) => item.kpis)), coverage: list.reduce((sum, item) => addCoverage(sum, item.coverage), emptyCoverage()) };
  });
  return {
    dayCount: slice.days.length, activeDays: activeDays.length, publishedDays: slice.days.filter((day) => day.published).length, staleDays: slice.days.filter((day) => day.stale).length,
    dataDays: byDay.filter((item) => item.reports > 0).length, totals: sumKpis(facts.map((fact) => fact.kpis)), byDay, byDepartment, byProject,
    coverage: byDepartment.reduce((sum, item) => addCoverage(sum, item.coverage), emptyCoverage()),
  };
}

export type PeriodMetric = { key: string; label: string; unit: string; value: (kpis: Kpis) => number | null; tone?: "good" | "bad"; rate?: boolean };
/** 周报/月报“关键指标”与 Excel 汇总共用的指标清单，标签与日报看板保持一致 */
export const PERIOD_METRICS: PeriodMetric[] = [
  { key: "workItems", label: "工作项（按日累计）", unit: "项", value: (kpis) => kpis.workItems },
  { key: "completedItems", label: "完成工作", unit: "项", value: (kpis) => kpis.completedItems, tone: "good" },
  { key: "completionRate", label: "工作闭环率", unit: "%", value: (kpis) => kpis.completionRate, tone: "good", rate: true },
  { key: "newRepairs", label: "新增报修", unit: "项", value: (kpis) => kpis.newRepairs },
  { key: "completedRepairs", label: "完成维修", unit: "项", value: (kpis) => kpis.completedRepairs, tone: "good" },
  { key: "abnormal", label: "异常（按日累计）", unit: "项", value: (kpis) => kpis.abnormal, tone: "bad" },
  { key: "express", label: "快递", unit: "件", value: (kpis) => kpis.service.express },
  { key: "meetings", label: "会议", unit: "场", value: (kpis) => kpis.service.meetings },
  { key: "participants", label: "参会", unit: "人", value: (kpis) => kpis.service.participants },
  { key: "water", label: "水桶", unit: "桶", value: (kpis) => kpis.service.water },
  { key: "patrol", label: "巡检", unit: "次", value: (kpis) => kpis.service.patrol },
  { key: "disinfect", label: "消毒", unit: "次", value: (kpis) => kpis.service.disinfect },
  { key: "garbage", label: "垃圾清运", unit: "次", value: (kpis) => kpis.service.garbage },
];

export const average = (total: number | null | undefined, days: number) => (total == null || !days ? null : Math.round(total / days * 10) / 10);
export const percent = (part: number, whole: number) => (whole ? Math.round(part / whole * 100) : null);
/** 环比：上期无数据时不计算 */
export function change(current: number | null | undefined, previous: number | null | undefined) {
  if (current == null || previous == null) return null;
  const diff = Math.round((current - previous) * 10) / 10;
  return { diff, pct: previous ? Math.round(diff / previous * 100) : null };
}

export function followupStats(list: PeriodFollowup[]) {
  const open = list.filter((item) => item.status !== "completed");
  return { total: list.length, isNew: list.filter((item) => item.isNew).length, completed: list.length - open.length, open: open.length, overdue: open.filter((item) => item.overdue).length, abnormal: list.filter((item) => item.isAbnormal).length };
}
/** 逾期 → 未闭环异常 → 其他未闭环（按截止日期）→ 已完成 */
export function sortFollowups(list: PeriodFollowup[]) {
  const rank = (item: PeriodFollowup) => (item.status === "completed" ? 3 : item.overdue ? 0 : item.isAbnormal ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.firstSeen.localeCompare(b.firstSeen));
}
