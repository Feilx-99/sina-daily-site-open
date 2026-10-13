export type Role = "admin" | "client" | "department";
export type ReportStatus = "draft" | "submitted" | "returned" | "approved";
export type RoutineStatus = "normal" | "abnormal" | "not_done";
export type MetricDefinition = { key: string; label: string; type: "number" | "amount" | "status"; unit?: string; routine?: boolean; workGroup?: string };
export type DepartmentDefinition = { id: string; name: string; project: "启皓" | "五栋"; shortName: string; metrics: MetricDefinition[] };

export const DEPARTMENTS: DepartmentDefinition[] = [
  { id: "qh_customer", name: "启皓客服", project: "启皓", shortName: "客服", metrics: [
    { key: "inspect", label: "巡检迎宾", type: "status", routine: true, workGroup: "巡检迎宾" }, { key: "system", label: "系统登录", type: "status", routine: true, workGroup: "系统登录" },
    { key: "photos", label: "照片汇总", type: "status", routine: true, workGroup: "照片汇总" }, { key: "expressSend", label: "快递寄件", type: "number", unit: "件", workGroup: "快递" },
    { key: "expressReceive", label: "快递接收", type: "number", unit: "件", workGroup: "快递" }, { key: "newspaper", label: "报纸", type: "number", unit: "份", workGroup: "报刊信件" },
    { key: "letter", label: "平信", type: "number", unit: "封", workGroup: "报刊信件" }, { key: "meetings", label: "会议场次", type: "number", unit: "场", workGroup: "会议保障" },
    { key: "participants", label: "参会人数", type: "number", unit: "人", workGroup: "会议保障" }, { key: "cards", label: "门禁卡数量", type: "number", unit: "张", workGroup: "门禁卡" },
    { key: "cardAmount", label: "门禁卡金额", type: "amount", unit: "元", workGroup: "门禁卡" }, { key: "requests", label: "客户需求", type: "number", unit: "项", workGroup: "客户需求" },
    { key: "newRepairs", label: "新增报修", type: "number", unit: "项", workGroup: "报修处理" }, { key: "completedRepairs", label: "完成维修", type: "number", unit: "项", workGroup: "报修处理" },
    { key: "supplierItems", label: "供应商事项", type: "number", unit: "项", workGroup: "供应商事项" }, { key: "abnormal", label: "异常", type: "number", unit: "项" },
  ] },
  { id: "qh_engineering", name: "启皓工程", project: "启皓", shortName: "工程", metrics: [
    { key: "publicInspect", label: "公区巡检", type: "status", routine: true, workGroup: "公区巡检" }, { key: "machineInspect", label: "机房检查", type: "status", routine: true, workGroup: "机房检查" },
    { key: "environmentInspect", label: "环境巡检", type: "status", routine: true, workGroup: "环境巡检" }, { key: "printerInspect", label: "打印机检查", type: "status", routine: true, workGroup: "打印机检查" },
    { key: "newRepairs", label: "新增报修", type: "number", unit: "项", workGroup: "报修处理" }, { key: "completedRepairs", label: "完成维修", type: "number", unit: "项", workGroup: "报修处理" },
    { key: "pending", label: "待跟进", type: "number", unit: "项" }, { key: "propertyAssist", label: "大物业协同", type: "number", unit: "项", workGroup: "大物业协同" },
    { key: "abnormal", label: "设备异常", type: "number", unit: "项" },
  ] },
  { id: "qh_cleaning", name: "启皓保洁", project: "启皓", shortName: "保洁", metrics: [
    { key: "executiveClean", label: "高管区清洁", type: "status", routine: true, workGroup: "高管区清洁" }, { key: "meetingClean", label: "会后清洁", type: "status", routine: true, workGroup: "会后清洁" },
    { key: "disinfect", label: "消毒次数", type: "number", unit: "次", workGroup: "消毒" }, { key: "garbageTrips", label: "垃圾清运", type: "number", unit: "次", workGroup: "垃圾清运" },
    { key: "garbageBags", label: "垃圾袋数", type: "number", unit: "袋", workGroup: "垃圾清运" }, { key: "meetingRooms", label: "会议室清洁", type: "number", unit: "间", workGroup: "会议室清洁" },
    { key: "carpetSpots", label: "地毯污渍处理", type: "number", unit: "处", workGroup: "地毯处理" }, { key: "specialClean", label: "重点清洁", type: "number", unit: "项", workGroup: "重点清洁" },
    { key: "trainingPeople", label: "培训人次", type: "number", unit: "人次", workGroup: "培训" }, { key: "abnormal", label: "异常", type: "number", unit: "项" },
  ] },
  { id: "qh_security", name: "启皓安保", project: "启皓", shortName: "安保", metrics: [
    { key: "patrol", label: "楼层巡逻", type: "number", unit: "次", workGroup: "楼层巡逻" }, { key: "garage", label: "车库巡检", type: "number", unit: "次", workGroup: "车库巡检" },
    { key: "water6", label: "6层水桶", type: "number", unit: "桶", workGroup: "换水" }, { key: "water7", label: "7层水桶", type: "number", unit: "桶", workGroup: "换水" },
    { key: "water8", label: "8层水桶", type: "number", unit: "桶", workGroup: "换水" }, { key: "supplier", label: "供应商跟进", type: "status", routine: true, workGroup: "供应商跟进" },
    { key: "supplierItems", label: "供应商事项", type: "number", unit: "项", workGroup: "供应商跟进" },
  ] },
  { id: "wd_service", name: "五栋", project: "五栋", shortName: "五栋", metrics: [
    { key: "machineInspect", label: "机房巡视", type: "status", routine: true, workGroup: "机房巡视" }, { key: "cleanDisinfect", label: "清洁消毒", type: "status", routine: true, workGroup: "清洁消毒" },
    { key: "areaInspect", label: "工区巡检", type: "number", unit: "次", workGroup: "工区巡检" }, { key: "groupReports", label: "群报次数", type: "number", unit: "次", workGroup: "群报" },
    { key: "garbageTrips", label: "垃圾清运", type: "number", unit: "次", workGroup: "垃圾清运" }, { key: "garbageBags", label: "垃圾袋数", type: "number", unit: "袋", workGroup: "垃圾清运" },
    { key: "disinfect", label: "消毒次数", type: "number", unit: "次", workGroup: "消毒" }, { key: "expressReceive", label: "快递接收", type: "number", unit: "件", workGroup: "快递" },
    { key: "expressPickup", label: "快递领取", type: "number", unit: "件", workGroup: "快递" }, { key: "expressSend", label: "快递寄发", type: "number", unit: "件", workGroup: "快递" },
    { key: "water", label: "补充水桶", type: "number", unit: "桶", workGroup: "补水" }, { key: "specialClean", label: "专项清洁", type: "number", unit: "项", workGroup: "专项清洁" },
    { key: "repairFollow", label: "维修跟进", type: "number", unit: "项", workGroup: "维修跟进" }, { key: "abnormal", label: "异常", type: "number", unit: "项" },
  ] },
];
export const FOLLOWUP_CATEGORIES = ["报修", "供应商", "客户需求", "设备异常", "安全异常", "清洁问题", "初始化", "专项", "其他"];
export const FOLLOWUP_STATUSES = [{ value: "not_started", label: "未开始" }, { value: "in_progress", label: "跟进中" }, { value: "completed", label: "已完成" }, { value: "paused", label: "暂停" }];
export const REPORT_STATUS_LABEL: Record<string, string> = { draft: "草稿", submitted: "待审核", returned: "已退回", approved: "已审核", missing: "未提交" };
export const PROJECTS = ["启皓", "五栋"] as const;
export function departmentById(id?: string | null) { return DEPARTMENTS.find((department) => department.id === id); }
export function todayShanghai() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export function formatChineseDate(value: string) { const [year, month, day] = value.split("-"); return `${year}年${Number(month)}月${Number(day)}日`; }
export function metricSummary(departmentId: string, metrics: Record<string, number | string | null | undefined>) {
  const n = (key: string) => Number(metrics[key] ?? 0);
  if (departmentId === "qh_customer") return `快递寄${n("expressSend")}件、收${n("expressReceive")}件，会议${n("meetings")}场/${n("participants")}人，门禁卡${n("cards")}张/${n("cardAmount")}元`;
  if (departmentId === "qh_engineering") return `报修新增${n("newRepairs")}项、完成${n("completedRepairs")}项，待跟进${n("pending")}项，大物业协同${n("propertyAssist")}项`;
  if (departmentId === "qh_cleaning") return `消毒${n("disinfect")}次，垃圾清运${n("garbageTrips")}次/${n("garbageBags")}袋，地毯处理${n("carpetSpots")}处`;
  if (departmentId === "qh_security") return `楼层巡逻${n("patrol")}次，车库巡检${n("garage")}次，补充水桶${n("water6") + n("water7") + n("water8")}桶`;
  if (departmentId === "wd_service") return `工区巡检${n("areaInspect")}次，垃圾清运${n("garbageTrips")}次/${n("garbageBags")}袋，快递收${n("expressReceive")}/领${n("expressPickup")}/寄${n("expressSend")}件`;
  return "暂无量化摘要";
}

/** 把非固定工作文本拆成条数：优先按换行，单行内按 1. 2、3：等连续编号自动拆条；输出时剥掉原始序号，由展示层统一编号 */
export function splitWorkLines(text: string): string[] {
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cuts: number[] = [];
    // 前后边界都用零宽断言，不消费空格，否则 "1. 2. 3、" 这类连续编号会隔一个漏一个
    const re = /(?:^|(?<=\s))(\d{1,2})\s*[.、)）:：](?=\s|$)/g;
    let expected = 1;
    let match: RegExpExecArray | null;
    while ((match = re.exec(line)) !== null) {
      if (parseInt(match[1], 10) === expected) { cuts.push(match.index); expected++; }
    }
    if (!cuts.length) { lines.push(line); continue; }
    for (let i = 0; i < cuts.length; i++) {
      lines.push(line.slice(cuts[i], i + 1 < cuts.length ? cuts[i + 1] : line.length).trim());
    }
  }
  // 剥掉原始序号（可能叠了多层，如 "1. 2. 3、"），由展示层统一编号
  return lines.map((line) => line.replace(/^(\d{1,2}\s*[.、)）:：]\s*)+/, "").trim()).filter(Boolean);
}

/** 统计固定工作项：确认项按“已填写”计、量化指标按“有发生(>0)”计；同一逻辑工作（如 6/7/8 层换水）合并只算 1 项。返回 { total, done } */
export function countRoutineWork(department: DepartmentDefinition, metrics: Record<string, number | string | null | undefined>) {
  const groups = new Map<string, boolean>(); // workGroup -> 该组是否全部“已执行”
  for (const metric of department.metrics) {
    if (!metric.workGroup) continue;
    const value = metrics[metric.key];
    const present = metric.type === "status" ? value != null : Number(value ?? 0) > 0;
    if (!present) continue;
    const allDone = groups.get(metric.workGroup) ?? true;
    groups.set(metric.workGroup, allDone && (metric.type !== "status" || value === "done"));
  }
  let done = 0;
  for (const allDone of groups.values()) if (allDone) done++;
  return { total: groups.size, done };
}

export type ServiceTotals = { express: number; meetings: number; participants: number; water: number; patrol: number; disinfect: number; garbage: number };
export type Kpis = { workItems: number; completedItems: number; completionRate: number | null; newRepairs: number; completedRepairs: number; abnormal: number; open: number; overdue: number; routineCount: number; followupCount: number; notesCount: number; service: ServiceTotals };
export type KpiReport = { departmentId: string; metrics?: Record<string, number | string | null | undefined> | null; notes?: string | null; followups?: Array<{ status?: string | null; isAbnormal?: boolean | null; dueDate?: string | null }> | null };
const COUNT_KEYS = ["workItems", "completedItems", "newRepairs", "completedRepairs", "abnormal", "open", "overdue", "routineCount", "followupCount", "notesCount"] as const;
const SERVICE_KEYS = ["express", "meetings", "participants", "water", "patrol", "disinfect", "garbage"] as const;
export const completionRate = (done: number, total: number) => (total ? Math.round(done / total * 100) : null);

/** 日报 KPI 口径（日报看板、发布快照、周报/月报/统计共用）。除闭环率外每项都是按部门日报可直接相加的计数，所以多日/多部门汇总 = 逐份日报 KPI 之和 */
export function buildKpis(reports: KpiReport[], date: string): Kpis {
  const kpis: Kpis = { workItems: 0, completedItems: 0, completionRate: null, newRepairs: 0, completedRepairs: 0, abnormal: 0, open: 0, overdue: 0, routineCount: 0, followupCount: 0, notesCount: 0, service: { express: 0, meetings: 0, participants: 0, water: 0, patrol: 0, disinfect: 0, garbage: 0 } };
  for (const report of reports) {
    const department = departmentById(report.departmentId), metrics = report.metrics ?? {}, service = kpis.service;
    if (department) { const routine = countRoutineWork(department, metrics); kpis.workItems += routine.total; kpis.completedItems += routine.done; kpis.routineCount += routine.total; }
    for (const item of report.followups ?? []) { kpis.workItems++; kpis.followupCount++; if (item.status === "completed") kpis.completedItems++; else kpis.open++; if (item.isAbnormal) kpis.abnormal++; if (item.status !== "completed" && item.dueDate && item.dueDate < date) kpis.overdue++; }
    const notesLines = splitWorkLines(String(report.notes ?? "")).length; kpis.workItems += notesLines; kpis.completedItems += notesLines; kpis.notesCount += notesLines;
    const n = (name: string) => Number(metrics[name] ?? 0) || 0;
    kpis.newRepairs += n("newRepairs"); kpis.completedRepairs += n("completedRepairs"); kpis.abnormal += n("abnormal");
    service.express += n("expressReceive") + n("expressSend") + n("expressPickup"); service.meetings += n("meetings"); service.participants += n("participants"); service.water += n("water") + n("water6") + n("water7") + n("water8"); service.patrol += n("patrol") + n("garage") + n("areaInspect"); service.disinfect += n("disinfect"); service.garbage += n("garbageTrips");
  }
  kpis.completionRate = completionRate(kpis.completedItems, kpis.workItems);
  return kpis;
}
export function sumKpis(list: Kpis[]): Kpis {
  const total = buildKpis([], "");
  for (const item of list) { for (const key of COUNT_KEYS) total[key] += item[key] ?? 0; for (const key of SERVICE_KEYS) total.service[key] += item.service?.[key] ?? 0; }
  total.completionRate = completionRate(total.completedItems, total.workItems);
  return total;
}

/** 日期均为上海时区的 YYYY-MM-DD 字符串；按 UTC 做纯日历运算，避免浏览器/服务器本地时区与夏令时影响 */
const calendarDay = (date: string) => { const [year, month, day] = date.split("-").map(Number); return new Date(Date.UTC(year, month - 1, day)); };
export function isDateKey(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && calendarDay(value).toISOString().slice(0, 10) === value; }
export function isMonthKey(value: unknown): value is string { return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
export function addDays(date: string, days: number) { const value = calendarDay(date); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
export function daysBetween(from: string, to: string) { return Math.round((calendarDay(to).getTime() - calendarDay(from).getTime()) / 86400000); }
export function datesBetween(from: string, to: string) { const list: string[] = []; for (let date = from; date <= to; date = addDays(date, 1)) list.push(date); return list; }
/** 周一至周日为一周 */
export function mondayOf(date: string) { return addDays(date, -((calendarDay(date).getUTCDay() + 6) % 7)); }
/** 部门填报窗口：仅今天；更早的日期只能查看。服务端 saveReport 以此为准，页面用它提前锁定表单 */
export const FILL_WINDOW_DAYS = 0;
export function fillWindowStart(today = todayShanghai()) { return addDays(today, -FILL_WINDOW_DAYS); }
export function isFillableDate(date: string, today = todayShanghai()) { return isDateKey(date) && date >= fillWindowStart(today) && date <= today; }
export function monthBounds(month: string) { const [year, value] = month.split("-").map(Number); return { from: `${month}-01`, to: new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10) }; }
export function shiftMonth(month: string, delta: number) { const [year, value] = month.split("-").map(Number); return new Date(Date.UTC(year, value - 1 + delta, 1)).toISOString().slice(0, 7); }
export function isoWeek(date: string) { const thursday = calendarDay(addDays(mondayOf(date), 3)), year = thursday.getUTCFullYear(); return { year, week: Math.floor(daysBetween(`${year}-01-01`, thursday.toISOString().slice(0, 10)) / 7) + 1 }; }
export function weekdayLabel(date: string) { return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][calendarDay(date).getUTCDay()]; }
export function formatMonthDay(date: string) { const [, month, day] = date.split("-"); return `${Number(month)}月${Number(day)}日`; }
export function formatChineseMonth(month: string) { const [year, value] = month.split("-"); return `${year}年${Number(value)}月`; }
