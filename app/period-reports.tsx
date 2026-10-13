"use client";

import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { BadgeCheck, CalendarCheck, ChevronLeft, ChevronRight, ClipboardCheck, ClipboardList, Clock3, Download, Printer, RefreshCw, TriangleAlert, Wrench } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FOLLOWUP_STATUSES, addDays, daysBetween, departmentById, formatChineseDate, formatChineseMonth, formatMonthDay, isDateKey, isMonthKey, isoWeek, mondayOf, monthBounds, shiftMonth, todayShanghai, weekdayLabel, type Kpis } from "@/lib/domain";
import { PERIOD_METRICS, average, change, followupStats, percent, scopeDepartments, scopeLabel, sortFollowups, summarizePeriod, type DayStatus, type PeriodData, type PeriodDay, type PeriodFollowup, type PeriodSource } from "@/lib/period";

export type PeriodFilters = { week: string | null; month: string | null; range: { from: string; to: string } | null; departmentId: string; source: PeriodSource };
export const DEFAULT_PERIOD_FILTERS: PeriodFilters = { week: null, month: null, range: null, departmentId: "all", source: "live" };
/** anchorDate 是日报页当前选中的日期：未手动切换周期时，周报/月报/统计默认显示它所在的周、月 */
export type PeriodViewProps = { role: "admin" | "client"; anchorDate: string; project: string; setProject: (value: string) => void; filters: PeriodFilters; setFilters: (update: Partial<PeriodFilters>) => void; onOpenDay: (date: string) => void; onReviewDay?: (date: string) => void; onAuthError: () => void };

const CARD = "gap-4 border border-[#e9e6df] bg-[#fffefd] shadow-[0_8px_20px_rgba(51,44,34,.06)]";
const fmt = (value: number | null | undefined, digits = 1) => (value == null ? "—" : value.toLocaleString("zh-CN", { maximumFractionDigits: digits }));
const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
const followupStatus = (status: string) => FOLLOWUP_STATUSES.find((item) => item.value === status)?.label ?? status;
const sourceOf = (view: PeriodViewProps): PeriodSource => (view.role === "admin" ? view.filters.source : "published");
const departmentOf = (view: PeriodViewProps) => (scopeDepartments(view.project).some((department) => department.id === view.filters.departmentId) ? view.filters.departmentId : "all");
const exportUrl = (query: Record<string, string>) => `/api/export?${new URLSearchParams(query)}`;
const sourceText = (data: PeriodData) => (data.source === "live" ? "管理预览 · 已审核日报（实时）" : data.role === "client" ? "正式发布版" : "甲方口径 · 已发布日报");
const rangeText = (data: PeriodData) => `${formatMonthDay(data.from)}—${formatMonthDay(data.to)}${data.from <= data.today && data.to > data.today ? `（进行中，截至${formatMonthDay(data.today)}）` : ""}`;

function usePeriodData(query: Record<string, string | undefined>, onAuthError: () => void) {
  const params = new URLSearchParams({ view: "period" });
  for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
  const url = `/api/data?${params}`;
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: PeriodData } | null>(null);
  const key = `${url}#${nonce}`;
  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(async (response) => { const body = (await response.json().catch(() => ({}))) as PeriodData & { error?: string }; if (!response.ok) throw new Error(body.error ?? "加载失败，请稍后重试。"); return body; })
      .then((data) => { if (!cancelled) setResult({ key, data }); })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "加载失败，请稍后重试。";
        toast.error(message);
        if (message.includes("登录")) onAuthError();
        setResult((current) => ({ key, data: current?.data }));
      });
    return () => { cancelled = true; };
  }, [key, url, onAuthError]);
  return { data: result?.data, loading: result?.key !== key, reload: () => setNonce((value) => value + 1) };
}

function reportScope(data: PeriodData, project: string, departmentId = "all") {
  const departments = scopeDepartments(project, departmentId), ids = new Set(departments.map((department) => department.id));
  return {
    departments, label: scopeLabel(project, departmentId), summary: summarizePeriod(data, departments), previous: data.compare ? summarizePeriod(data.compare, departments) : null,
    followups: sortFollowups(data.followups.filter((item) => ids.has(item.departmentId))),
    issues: data.issues.filter((item) => ids.has(item.departmentId)).sort((a, b) => b.date.localeCompare(a.date)),
    asOf: data.to < data.today ? data.to : data.today,
  };
}
type ReportScope = ReturnType<typeof reportScope>;
/** 上期取值：undefined 表示不做对比，null 表示上期没有数据 */
const previousValue = (scope: ReportScope, read: (kpis: Kpis) => number | null) => (scope.previous ? (scope.previous.dataDays ? read(scope.previous.totals) : null) : undefined);

function PeriodToolbar({ view, title, detail, loading, onReload, exportHref, printable = false, withDepartment = false, children, footer }: { view: PeriodViewProps; title: string; detail: string; loading: boolean; onReload: () => void; exportHref: string; printable?: boolean; withDepartment?: boolean; children: ReactNode; footer?: ReactNode }) {
  const { role, project, setProject, filters, setFilters } = view;
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:hidden">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div><p className="text-sm font-bold text-slate-900">{title}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        <Select value={project} onValueChange={setProject}><SelectTrigger className="w-[112px]" aria-label="项目"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="全部">全部项目</SelectItem><SelectItem value="启皓">启皓</SelectItem><SelectItem value="五栋">五栋</SelectItem></SelectContent></Select>
        {withDepartment ? <Select value={departmentOf(view)} onValueChange={(value) => setFilters({ departmentId: value })}><SelectTrigger className="w-[124px]" aria-label="部门"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">全部部门</SelectItem>{scopeDepartments(project).map((department) => <SelectItem key={department.id} value={department.id}>{department.name}</SelectItem>)}</SelectContent></Select> : null}
        {role === "admin" ? <Select value={filters.source} onValueChange={(value) => setFilters({ source: value as PeriodSource })}><SelectTrigger className="w-[164px]" aria-label="统计口径"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="live">已审核（实时）</SelectItem><SelectItem value="published">已发布（甲方口径）</SelectItem></SelectContent></Select> : null}
        <Button variant="outline" size="icon" onClick={onReload} aria-label="刷新" disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""}/></Button>
        {printable ? <Button variant="outline" onClick={() => window.print()}><Printer/>打印/PDF</Button> : null}
        <Button variant="outline" asChild><a href={exportHref}><Download/>导出Excel</a></Button>
      </div>
    </div>
    {footer ? <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">{footer}</div> : null}
  </div>;
}

function PeriodFrame({ data, loading, onReload, children }: { data?: PeriodData; loading: boolean; onReload: () => void; children: (data: PeriodData) => ReactNode }) {
  if (!data) return loading
    ? <div className="flex h-56 items-center justify-center"><RefreshCw className="animate-spin text-[#c40000]"/></div>
    : <Card className="border-0 shadow-sm"><CardContent className="flex flex-col items-center gap-3 py-16 text-sm text-slate-500">统计数据加载失败<Button variant="outline" onClick={onReload}><RefreshCw/>重新加载</Button></CardContent></Card>;
  return <div className={`space-y-5 transition-opacity ${loading ? "pointer-events-none opacity-60" : ""}`}>{children(data)}</div>;
}

function EmptyNotice({ data }: { data: PeriodData }) {
  const text = data.source === "live" ? "该周期内暂无已审核的部门日报，审核通过后会自动汇总到这里。" : data.role === "client" ? "该周期内暂无已发布的正式日报，可以切换到其他周期查看。" : "该周期内暂无已发布的日报。切换为“已审核（实时）”口径可查看尚未发布的数据。";
  return <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><TriangleAlert className="mt-0.5 size-4 shrink-0"/><p>{text}</p></div>;
}

function PeriodHero({ title, data, scope, compareLabel }: { title: string; data: PeriodData; scope: ReportScope; compareLabel?: string }) {
  const rate = scope.summary.totals.completionRate, before = previousValue(scope, (kpis) => kpis.completionRate);
  return <div className="relative overflow-hidden rounded-3xl border border-[#243043] bg-[#111827] p-6 text-white shadow-[0_18px_42px_rgba(15,23,42,.18)] sm:p-8">
    <div className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-[#867259]/25 blur-3xl"/>
    <div className="relative flex flex-col justify-between gap-6 sm:flex-row">
      <div>
        <p className="inline-flex rounded-full border border-[#e6cab5]/30 bg-[#e6cab5]/10 px-3 py-1 text-xs font-bold tracking-wide text-[#f5d6c0]">新浪启皓 · 五栋物业服务</p>
        <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">{rangeText(data)} <span className="mx-2 text-[#d2a06c]">/</span> {scope.label} <span className="mx-2 text-[#d2a06c]">/</span> {sourceText(data)}</p>
      </div>
      <div className="flex items-center gap-3 self-start rounded-2xl border border-white/10 bg-white/[.08] px-5 py-4 backdrop-blur-sm sm:self-auto">
        <div className="flex size-11 items-center justify-center rounded-xl bg-[#5f8d80]/20"><BadgeCheck className="size-7 text-[#70e0bd]"/></div>
        <div><p className="text-xs font-medium text-slate-300">工作闭环率</p><p className="mt-0.5 text-3xl font-black tracking-tight">{rate ?? "--"}%</p>{compareLabel && before !== undefined ? <p className="mt-0.5 text-[11px] text-slate-400">{compareLabel} {before ?? "--"}%</p> : null}</div>
      </div>
    </div>
  </div>;
}

function DeltaText({ current, previous, label = "", tone, rate = false, compact = false }: { current: number | null; previous: number | null | undefined; label?: string; tone?: "good" | "bad"; rate?: boolean; compact?: boolean }) {
  if (previous === undefined) return null;
  const delta = change(current, previous);
  if (!delta) return <span className="font-medium text-slate-400">{compact ? "—" : `${label}无数据`}</span>;
  if (!delta.diff) return <span className="font-medium text-slate-400">{compact ? "持平" : `与${label}持平`}</span>;
  const up = delta.diff > 0, good = tone === "good" ? up : tone === "bad" ? !up : null;
  return <span className={good == null ? "text-slate-500" : good ? "text-emerald-600" : "text-[#b85b45]"}>{compact ? "" : `较${label} `}{up ? "↑" : "↓"}{fmt(Math.abs(delta.diff))}{rate ? "个百分点" : delta.pct != null ? `（${up ? "+" : ""}${delta.pct}%）` : ""}</span>;
}

function KpiCard({ icon: Icon, label, value, unit, warn = false, sub, delta }: { icon: typeof ClipboardCheck; label: string; value: ReactNode; unit: string; warn?: boolean; sub?: string; delta?: ReactNode }) {
  return <Card className={`relative gap-2 overflow-hidden border py-4 shadow-[0_8px_20px_rgba(51,44,34,.07)] ${warn ? "border-[#e7c7bc] bg-[#fffaf7]" : "border-[#e9e6df] bg-[#fffefd]"}`}>
    <div className={`absolute inset-x-0 top-0 h-1 ${warn ? "bg-[#b85b45]" : "bg-[#d8c9b7]"}`}/>
    <CardContent className="px-4">
      <div className={`mb-4 flex size-10 items-center justify-center rounded-xl ${warn ? "bg-[#b85b45] text-white shadow-sm" : "bg-[#f4f0e9] text-[#75614b]"}`}><Icon className="size-5"/></div>
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-black tracking-tight tabular-nums ${warn ? "text-[#9d4334]" : "text-slate-900"}`}>{value}<span className="ml-1 text-xs font-medium text-slate-400">{unit}</span></p>
      {sub ? <p className="mt-1 text-[10px] font-medium leading-4 text-slate-400">{sub}</p> : null}
      {delta ? <p className="mt-1 text-[11px] font-bold">{delta}</p> : null}
    </CardContent>
  </Card>;
}

function HeadlineCards({ data, scope, compareLabel }: { data: PeriodData; scope: ReportScope; compareLabel?: string }) {
  const { summary } = scope, totals = summary.totals, coverage = summary.coverage, stats = followupStats(scope.followups), live = data.source === "live";
  return <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
    <KpiCard icon={CalendarCheck} label="发布日报" value={`${summary.publishedDays}/${summary.dayCount}`} unit="天" warn={live && summary.staleDays > 0} sub={live && summary.staleDays ? `${summary.staleDays} 天发布后有更新，需重新发布` : `有数据 ${summary.dataDays} 天`}/>
    <KpiCard icon={ClipboardCheck} label={live ? "部门日报提交" : "部门日报纳入"} value={`${coverage.submitted}/${coverage.expected}`} unit="份" warn={coverage.submitted < coverage.expected} sub={live ? `提交率 ${percent(coverage.submitted, coverage.expected) ?? "--"}% · 已审核 ${coverage.approved} · 待审核 ${coverage.pending}` : `纳入率 ${percent(coverage.submitted, coverage.expected) ?? "--"}%（按已发布日期）`}/>
    <KpiCard icon={ClipboardList} label="工作项（累计）" value={fmt(totals.workItems)} unit="项" sub={`完成 ${fmt(totals.completedItems)} · 日均 ${fmt(average(totals.workItems, summary.dataDays))}`} delta={<DeltaText current={totals.workItems} previous={previousValue(scope, (kpis) => kpis.workItems)} label={compareLabel}/>}/>
    <KpiCard icon={Wrench} label="新增/完成报修" value={`${fmt(totals.newRepairs)}/${fmt(totals.completedRepairs)}`} unit="项" sub={`日均新增 ${fmt(average(totals.newRepairs, summary.dataDays))}`} delta={<DeltaText current={totals.newRepairs} previous={previousValue(scope, (kpis) => kpis.newRepairs)} label={compareLabel}/>}/>
    <KpiCard icon={TriangleAlert} label="异常（累计）" value={fmt(totals.abnormal)} unit="项" warn={totals.abnormal > 0} sub={`其中异常/风险事项去重 ${stats.abnormal} 项`} delta={<DeltaText current={totals.abnormal} previous={previousValue(scope, (kpis) => kpis.abnormal)} label={compareLabel} tone="bad"/>}/>
    <KpiCard icon={Clock3} label="未闭环/逾期" value={`${stats.open}/${stats.overdue}`} unit="项" warn={stats.open > 0 || stats.overdue > 0} sub={`截至${formatMonthDay(scope.asOf)}按事项去重 · 本期新增 ${stats.isNew} · 完成 ${stats.completed}`}/>
  </div>;
}

function MetricTable({ scope, periodLabel, compareLabel }: { scope: ReportScope; periodLabel: string; compareLabel?: string }) {
  const { summary } = scope;
  return <Card className={CARD}>
    <CardHeader><CardTitle>关键指标</CardTitle><CardDescription className="mt-1">合计为期间内每天日报看板数据之和；日均按有数据的 {summary.dataDays} 天计算</CardDescription></CardHeader>
    <CardContent><Table>
      <TableHeader><TableRow><TableHead>指标</TableHead><TableHead className="text-right">{periodLabel}合计</TableHead><TableHead className="text-right">日均</TableHead>{compareLabel ? <><TableHead className="text-right">{compareLabel}</TableHead><TableHead className="text-right">变化</TableHead></> : null}</TableRow></TableHeader>
      <TableBody>{PERIOD_METRICS.map((metric) => {
        const current = metric.value(summary.totals), before = previousValue(scope, metric.value);
        return <TableRow key={metric.key}>
          <TableCell className="font-bold text-slate-700">{metric.label}</TableCell>
          <TableCell className="text-right font-black tabular-nums">{fmt(current)}<span className="ml-0.5 text-xs font-normal text-slate-400">{metric.unit}</span></TableCell>
          <TableCell className="text-right tabular-nums text-slate-500">{metric.rate ? "—" : fmt(average(current, summary.dataDays))}</TableCell>
          {compareLabel ? <><TableCell className="text-right tabular-nums text-slate-500">{fmt(before)}</TableCell><TableCell className="text-right text-xs font-bold"><DeltaText current={current} previous={before} tone={metric.tone} rate={metric.rate} compact/></TableCell></> : null}
        </TableRow>;
      })}</TableBody>
    </Table></CardContent>
  </Card>;
}

function PublishBadge({ day, today }: { day: PeriodDay; today: string }) {
  if (day.published) return <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${day.stale ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{day.stale ? "待重新发布" : "已发布"}</span>;
  return day.date > today ? null : <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">未发布</span>;
}

function DailyTable({ data, scope, view, title }: { data: PeriodData; scope: ReportScope; view: PeriodViewProps; title: string }) {
  const { summary } = scope, totals = summary.totals, live = data.source === "live";
  return <Card className={CARD}>
    <CardHeader><CardTitle>{title}</CardTitle><CardDescription className="mt-1">每行与当天日报看板一致（未闭环为当天数量），点击行可查看当天日报</CardDescription></CardHeader>
    <CardContent><Table>
      <TableHeader><TableRow><TableHead>日期</TableHead><TableHead>发布</TableHead><TableHead className="text-right">纳入日报</TableHead><TableHead className="text-right">工作项</TableHead><TableHead className="text-right">完成</TableHead><TableHead className="text-right">闭环率</TableHead><TableHead className="text-right">报修 新增/完成</TableHead><TableHead className="text-right">异常</TableHead><TableHead className="text-right">未闭环</TableHead><TableHead className="text-right">快递</TableHead><TableHead className="text-right">会议/参会</TableHead><TableHead/></TableRow></TableHeader>
      <TableBody>{summary.byDay.map(({ day, reports, kpis }) => {
        const open = () => view.onOpenDay(day.date);
        return <TableRow key={day.date} onClick={kpis ? open : undefined} className={kpis ? "cursor-pointer" : "text-slate-400"}>
          <TableCell className="font-bold">{formatMonthDay(day.date)}<span className="ml-1.5 text-xs font-normal text-slate-400">{weekdayLabel(day.date)}</span></TableCell>
          <TableCell><PublishBadge day={day} today={data.today}/></TableCell>
          <TableCell className="text-right tabular-nums">{reports || "—"}</TableCell>
          {kpis ? <>
            <TableCell className="text-right tabular-nums">{fmt(kpis.workItems)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(kpis.completedItems)}</TableCell>
            <TableCell className="text-right font-bold tabular-nums">{kpis.completionRate ?? "--"}%</TableCell>
            <TableCell className="text-right tabular-nums">{kpis.newRepairs}/{kpis.completedRepairs}</TableCell>
            <TableCell className={`text-right tabular-nums ${kpis.abnormal ? "font-bold text-[#9d4334]" : ""}`}>{kpis.abnormal}</TableCell>
            <TableCell className={`text-right tabular-nums ${kpis.open ? "text-amber-700" : ""}`}>{kpis.open}</TableCell>
            <TableCell className="text-right tabular-nums">{kpis.service.express}</TableCell>
            <TableCell className="text-right tabular-nums">{kpis.service.meetings}/{kpis.service.participants}</TableCell>
          </> : <TableCell colSpan={8} className="text-center text-xs">{day.date > data.today ? "未到日期" : live ? "暂无已审核日报" : "暂无已发布日报"}</TableCell>}
          <TableCell className="text-right">{kpis ? <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(event) => { event.stopPropagation(); open(); }}>查看<ChevronRight/></Button> : null}</TableCell>
        </TableRow>;
      })}</TableBody>
      <TableFooter><TableRow>
        <TableCell className="font-black">合计</TableCell><TableCell className="text-xs text-slate-500">已发布 {summary.publishedDays} 天</TableCell>
        <TableCell className="text-right tabular-nums">{summary.byDay.reduce((sum, item) => sum + item.reports, 0)}</TableCell>
        <TableCell className="text-right tabular-nums">{fmt(totals.workItems)}</TableCell>
        <TableCell className="text-right tabular-nums">{fmt(totals.completedItems)}</TableCell>
        <TableCell className="text-right font-black tabular-nums">{totals.completionRate ?? "--"}%</TableCell>
        <TableCell className="text-right tabular-nums">{totals.newRepairs}/{totals.completedRepairs}</TableCell>
        <TableCell className="text-right tabular-nums">{totals.abnormal}</TableCell>
        <TableCell className="text-right text-slate-400">—</TableCell>
        <TableCell className="text-right tabular-nums">{totals.service.express}</TableCell>
        <TableCell className="text-right tabular-nums">{totals.service.meetings}/{totals.service.participants}</TableCell>
        <TableCell/>
      </TableRow></TableFooter>
    </Table></CardContent>
  </Card>;
}

const COVERAGE_STYLE: Record<DayStatus, string> = { approved: "border-emerald-200 bg-emerald-50 text-emerald-700", submitted: "border-amber-200 bg-amber-50 text-amber-700", returned: "border-red-200 bg-red-50 text-red-700", draft: "border-slate-200 bg-slate-100 text-slate-600", missing: "border-red-200 bg-white text-red-600", unpublished: "border-slate-100 bg-slate-50 text-slate-400" };
const COVERAGE_TEXT: Record<PeriodSource, Record<DayStatus, string>> = {
  live: { approved: "已审", submitted: "待审", returned: "退回", draft: "草稿", missing: "未交", unpublished: "—" },
  published: { approved: "已报", submitted: "已报", returned: "未报", draft: "未报", missing: "未报", unpublished: "—" },
};

function CoverageMatrix({ data, scope, view }: { data: PeriodData; scope: ReportScope; view: PeriodViewProps }) {
  const live = data.source === "live";
  return <Card className={CARD}>
    <CardHeader><CardTitle>{live ? "提交与审核情况" : "部门日报纳入情况"}</CardTitle><CardDescription className="mt-1">{live ? "逐日查看各部门日报状态，点击单元格进入当天审核" : "按已发布的正式日报统计，点击单元格查看当天日报"}</CardDescription></CardHeader>
    <CardContent>
      <Table>
        <TableHeader><TableRow><TableHead>部门</TableHead>{data.days.map((day) => <TableHead key={day.date} className="text-center"><span className="block leading-4">{shortDate(day.date)}</span><span className="block text-[10px] font-normal leading-4 text-slate-400">{weekdayLabel(day.date)}</span></TableHead>)}<TableHead className="text-right">{live ? "已提交" : "已纳入"}</TableHead>{live ? <TableHead className="text-right">已审核</TableHead> : null}</TableRow></TableHeader>
        <TableBody>{scope.summary.byDepartment.map((item) => <TableRow key={item.department.id}>
          <TableCell className="font-bold">{item.department.name}</TableCell>
          {data.days.map((day) => {
            const status = day.statuses[item.department.id] ?? "missing", counted = day.active && day.date <= data.today;
            const target = counted ? (live ? view.onReviewDay : status === "approved" ? view.onOpenDay : undefined) : undefined;
            const chip = `inline-flex min-w-11 justify-center rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${counted ? COVERAGE_STYLE[status] : "border-transparent font-normal text-slate-300"}`;
            return <TableCell key={day.date} className="text-center">{target
              ? <button type="button" onClick={() => target(day.date)} className={`${chip} hover:ring-2 hover:ring-slate-200`} title={`${formatMonthDay(day.date)} ${item.department.name}`}>{COVERAGE_TEXT[data.source][status]}</button>
              : <span className={chip}>{counted ? COVERAGE_TEXT[data.source][status] : day.date > data.today ? "" : "—"}</span>}</TableCell>;
          })}
          <TableCell className="text-right font-bold tabular-nums">{item.coverage.submitted}/{item.coverage.expected}</TableCell>
          {live ? <TableCell className="text-right tabular-nums">{item.coverage.approved}</TableCell> : null}
        </TableRow>)}</TableBody>
      </Table>
      <p className="mt-3 text-[11px] leading-5 text-slate-400">{live ? "已审=已审核，待审=已提交待审核，退回=已退回待修改，未交=未提交；“—”表示当天没有任何部门日报记录，不计入应报天数。" : "已报=已纳入当天正式日报，未报=发布时未提交或未审核；“—”表示该日期未发布，不计入应报天数。"}</p>
    </CardContent>
  </Card>;
}

function Tag({ className, children }: { className: string; children: ReactNode }) { return <span className={`mr-1.5 inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-bold ${className}`}>{children}</span>; }

function FollowupItem({ item }: { item: PeriodFollowup }) {
  return <div className="rounded-lg border border-slate-100 bg-white p-2.5 text-sm leading-6">
    <p className="font-bold text-slate-800">
      <Tag className={item.kind === "key" ? "bg-red-600 text-white" : "bg-sky-100 text-sky-800"}>{item.kind === "key" ? "重点" : "跟进"}</Tag>
      {item.overdue ? <Tag className="bg-[#b85b45] text-white">逾期</Tag> : null}
      {item.isAbnormal ? <Tag className="bg-red-100 text-red-700">异常</Tag> : null}
      {item.isNew ? <Tag className="bg-slate-100 text-slate-600">本期新增</Tag> : null}
      {item.content || "未填写事项内容"}
    </p>
    <p className="text-xs text-slate-500">{departmentById(item.departmentId)?.name ?? item.departmentId} · {followupStatus(item.status)} · {item.responsiblePerson ? `责任人：${item.responsiblePerson}` : "未填责任人"}{item.status === "completed" && item.completedDate ? ` · 完成：${item.completedDate}` : item.dueDate ? ` · 截止：${item.dueDate}` : ""} · 首次记录 {formatMonthDay(item.firstSeen)}</p>
  </div>;
}

function FollowupsCard({ scope }: { scope: ReportScope }) {
  const stats = followupStats(scope.followups), open = scope.followups.filter((item) => item.status !== "completed"), done = scope.followups.filter((item) => item.status === "completed");
  return <Card className={CARD}>
    <CardHeader>
      <CardTitle>待跟进事项</CardTitle><CardDescription className="mt-1">结转事项按事项去重，状态取截至{formatMonthDay(scope.asOf)}的最新记录；逾期排在最前</CardDescription>
      <div className="mt-2 flex flex-wrap gap-1.5">{([["涉及", stats.total], ["本期新增", stats.isNew], ["本期完成", stats.completed], ["未闭环", stats.open], ["逾期", stats.overdue]] as const).map(([label, value]) => <span key={label} className={`rounded-full px-2.5 py-1 text-xs font-bold ${label === "逾期" && value ? "bg-[#b85b45] text-white" : "bg-[#f2eee7] text-[#75614b]"}`}>{label} {value}</span>)}</div>
    </CardHeader>
    <CardContent>
      {open.length ? <div className="max-h-96 space-y-2 overflow-y-auto pr-1">{open.map((item) => <FollowupItem key={item.id} item={item}/>)}</div> : <p className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-400">没有未闭环的跟进事项</p>}
      {done.length ? <details className="mt-3"><summary className="cursor-pointer text-xs font-bold text-slate-500">查看本期已完成 {done.length} 项</summary><div className="mt-2 max-h-72 space-y-2 overflow-y-auto pr-1">{done.map((item) => <FollowupItem key={item.id} item={item}/>)}</div></details> : null}
    </CardContent>
  </Card>;
}

function IssuesCard({ scope }: { scope: ReportScope }) {
  const abnormal = scope.followups.filter((item) => item.isAbnormal);
  return <Card className={CARD}>
    <CardHeader><CardTitle>异常情况</CardTitle><CardDescription className="mt-1">异常/风险跟进事项按事项去重；固定工作异常、未执行和数量型异常按日期列出</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {!abnormal.length && !scope.issues.length ? <p className="rounded-xl border border-dashed p-5 text-center text-sm text-slate-400">本期没有异常记录</p> : null}
      {abnormal.length ? <div><p className="mb-2 text-xs font-black text-red-800">异常/风险事项 {abnormal.length} 项（未闭环 {abnormal.filter((item) => item.status !== "completed").length} 项）</p><div className="max-h-72 space-y-2 overflow-y-auto pr-1">{abnormal.map((item) => <FollowupItem key={item.id} item={item}/>)}</div></div> : null}
      {scope.issues.length ? <div><p className="mb-2 text-xs font-black text-slate-700">固定工作与数量异常 {scope.issues.length} 条</p><div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100 bg-white">{scope.issues.map((issue, index) => <div key={`${issue.date}-${issue.departmentId}-${index}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><span><b>{formatMonthDay(issue.date)}</b><span className="mx-1.5 text-slate-500">{departmentById(issue.departmentId)?.name}</span>{issue.label}</span><span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-xs font-bold text-red-700">{issue.value}</span></div>)}</div></div> : null}
    </CardContent>
  </Card>;
}

function DepartmentTable({ data, scope }: { data: PeriodData; scope: ReportScope }) {
  const live = data.source === "live";
  return <Card className={CARD}>
    <CardHeader><CardTitle>部门汇总</CardTitle><CardDescription className="mt-1">各部门纳入统计的日报合计；“主要数量”为各部门量化指标在期间内的合计</CardDescription></CardHeader>
    <CardContent><Table>
      <TableHeader><TableRow><TableHead>部门</TableHead><TableHead className="text-right">{live ? "提交/应报" : "纳入/应报"}</TableHead><TableHead className="text-right">工作项</TableHead><TableHead className="text-right">完成</TableHead><TableHead className="text-right">闭环率</TableHead><TableHead className="text-right">报修 新增/完成</TableHead><TableHead className="text-right">异常</TableHead><TableHead>主要数量</TableHead></TableRow></TableHeader>
      <TableBody>{scope.summary.byDepartment.map((item) => {
        const quantities = item.department.metrics.filter((metric) => metric.type !== "status" && item.metrics[metric.key]);
        return <TableRow key={item.department.id}>
          <TableCell><p className="font-bold">{item.department.name}</p><p className="text-xs text-slate-400">{item.department.project}项目 · 纳入 {item.reports} 份</p></TableCell>
          <TableCell className="text-right tabular-nums"><span className="font-bold">{item.coverage.submitted}/{item.coverage.expected}</span>{live && item.coverage.pending ? <span className="block text-[10px] text-amber-600">待审核 {item.coverage.pending}</span> : null}</TableCell>
          <TableCell className="text-right tabular-nums">{fmt(item.kpis.workItems)}</TableCell>
          <TableCell className="text-right tabular-nums">{fmt(item.kpis.completedItems)}</TableCell>
          <TableCell className="text-right font-bold tabular-nums">{item.kpis.completionRate ?? "--"}%</TableCell>
          <TableCell className="text-right tabular-nums">{item.kpis.newRepairs}/{item.kpis.completedRepairs}</TableCell>
          <TableCell className={`text-right tabular-nums ${item.kpis.abnormal ? "font-bold text-[#9d4334]" : ""}`}>{item.kpis.abnormal}</TableCell>
          <TableCell className="min-w-72 whitespace-normal">{quantities.length ? <div className="flex flex-wrap gap-1">{quantities.map((metric) => <span key={metric.key} className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-600"><b>{metric.label}</b> {fmt(item.metrics[metric.key], 2)}{metric.unit}</span>)}</div> : <span className="text-xs text-slate-400">—</span>}</TableCell>
        </TableRow>;
      })}</TableBody>
    </Table></CardContent>
  </Card>;
}

function ProjectTable({ data, scope }: { data: PeriodData; scope: ReportScope }) {
  return <Card className={CARD}>
    <CardHeader><CardTitle>按项目汇总</CardTitle><CardDescription className="mt-1">{data.source === "live" ? "提交率 = 已提交部门日报 ÷ 应报" : "纳入率 = 纳入正式日报的部门日报 ÷ 应报"}</CardDescription></CardHeader>
    <CardContent><Table>
      <TableHeader><TableRow><TableHead>项目</TableHead><TableHead className="text-right">{data.source === "live" ? "提交率" : "纳入率"}</TableHead><TableHead className="text-right">工作项</TableHead><TableHead className="text-right">闭环率</TableHead><TableHead className="text-right">报修 新增/完成</TableHead><TableHead className="text-right">异常</TableHead><TableHead className="text-right">快递</TableHead><TableHead className="text-right">会议/参会</TableHead></TableRow></TableHeader>
      <TableBody>{scope.summary.byProject.map((item) => <TableRow key={item.project}>
        <TableCell><p className="font-bold">{item.project}项目</p><p className="text-xs text-slate-400">{item.departments} 个部门 · 纳入 {item.reports} 份</p></TableCell>
        <TableCell className="text-right tabular-nums">{percent(item.coverage.submitted, item.coverage.expected) ?? "--"}%</TableCell>
        <TableCell className="text-right tabular-nums">{fmt(item.kpis.workItems)}</TableCell>
        <TableCell className="text-right font-bold tabular-nums">{item.kpis.completionRate ?? "--"}%</TableCell>
        <TableCell className="text-right tabular-nums">{item.kpis.newRepairs}/{item.kpis.completedRepairs}</TableCell>
        <TableCell className="text-right tabular-nums">{item.kpis.abnormal}</TableCell>
        <TableCell className="text-right tabular-nums">{item.kpis.service.express}</TableCell>
        <TableCell className="text-right tabular-nums">{item.kpis.service.meetings}/{item.kpis.service.participants}</TableCell>
      </TableRow>)}</TableBody>
    </Table></CardContent>
  </Card>;
}

function ChartCard({ title, description, config, className = "", children }: { title: string; description: string; config: ChartConfig; className?: string; children: ReactElement }) {
  return <Card className={`${CARD} ${className}`}><CardHeader><CardTitle>{title}</CardTitle><CardDescription className="mt-1">{description}</CardDescription></CardHeader><CardContent><ChartContainer config={config} className="h-[240px] w-full">{children}</ChartContainer></CardContent></Card>;
}
const TREND_CONFIG = { workItems: { label: "工作项", color: "#c40000" }, completedItems: { label: "完成", color: "#059669" }, open: { label: "当日未闭环", color: "#f59e0b" }, abnormal: { label: "异常", color: "#64748b" } } satisfies ChartConfig;
const RATE_CONFIG = { completionRate: { label: "闭环率(%)", color: "#059669" } } satisfies ChartConfig;
const REPAIR_CONFIG = { newRepairs: { label: "新增报修", color: "#c40000" }, completedRepairs: { label: "完成维修", color: "#547b78" } } satisfies ChartConfig;
const ISSUE_CONFIG = { abnormal: { label: "异常", color: "#b85b45" }, open: { label: "当日未闭环", color: "#f59e0b" } } satisfies ChartConfig;
const SERVICE_CONFIG = { express: { label: "快递(件)", color: "#9a6b44" }, meetings: { label: "会议(场)", color: "#75617d" }, participants: { label: "参会(人)", color: "#75814a" } } satisfies ChartConfig;
const DEPARTMENT_CONFIG = { workItems: { label: "工作项", color: "#c40000" }, completedItems: { label: "完成", color: "#547b78" } } satisfies ChartConfig;
/** 无数据的日期保留为空值，折线跨过空档连接，避免把“没有日报”画成 0 */
const chartPoints = (scope: ReportScope) => scope.summary.byDay.map(({ day, kpis }) => ({ date: shortDate(day.date), workItems: kpis?.workItems ?? null, completedItems: kpis?.completedItems ?? null, completionRate: kpis?.completionRate ?? null, newRepairs: kpis?.newRepairs ?? null, completedRepairs: kpis?.completedRepairs ?? null, abnormal: kpis?.abnormal ?? null, open: kpis?.open ?? null, express: kpis?.service.express ?? null, meetings: kpis?.service.meetings ?? null, participants: kpis?.service.participants ?? null }));

function TrendLines({ points, keys, percentAxis = false, rightKeys = [] }: { points: ReturnType<typeof chartPoints>; keys: string[]; percentAxis?: boolean; rightKeys?: string[] }) {
  return <LineChart data={points} margin={{ left: 4, right: rightKeys.length ? 4 : 12 }}>
    <CartesianGrid vertical={false}/><XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={12}/>
    <YAxis yAxisId="left" allowDecimals={false} width={36} domain={percentAxis ? [0, 100] : undefined}/>{rightKeys.length ? <YAxis yAxisId="right" orientation="right" allowDecimals={false} width={32}/> : null}
    <ChartTooltip content={<ChartTooltipContent/>}/><ChartLegend content={<ChartLegendContent/>}/>
    {keys.map((key) => <Line key={key} yAxisId={rightKeys.includes(key) ? "right" : "left"} type="monotone" dataKey={key} stroke={`var(--color-${key})`} strokeWidth={2.5} dot={{ r: 2.5 }} connectNulls/>)}
  </LineChart>;
}

function TrendChart({ scope }: { scope: ReportScope }) {
  return <ChartCard title="每日趋势" description="工作项、完成、当日未闭环与异常的逐日变化；没有日报的日期留空" config={TREND_CONFIG}><TrendLines points={chartPoints(scope)} keys={Object.keys(TREND_CONFIG)}/></ChartCard>;
}

export function WeeklyReport(view: PeriodViewProps) {
  const from = view.filters.week ?? mondayOf(view.anchorDate), to = addDays(from, 6), source = sourceOf(view);
  const { data, loading, reload } = usePeriodData({ from, to, compareFrom: addDays(from, -7), compareTo: addDays(from, -1), source }, view.onAuthError);
  const setWeek = (date: string) => { if (isDateKey(date)) view.setFilters({ week: mondayOf(date) }); };
  return <div className="space-y-5">
    <PeriodToolbar view={view} title="周报周期" detail={`${formatChineseDate(from)}（周一）至 ${formatMonthDay(to)}（周日）`} loading={loading} onReload={reload} exportHref={exportUrl({ week: from, project: view.project, source })} printable>
      <Button variant="outline" size="sm" onClick={() => setWeek(addDays(from, -7))}><ChevronLeft/>上一周</Button>
      <Button variant="outline" size="sm" onClick={() => setWeek(todayShanghai())}>本周</Button>
      <Button variant="outline" size="sm" onClick={() => setWeek(addDays(from, 7))}>下一周<ChevronRight/></Button>
      <Input type="date" value={from} onChange={(event) => setWeek(event.target.value)} className="w-[152px]" aria-label="选择周内任一天"/>
    </PeriodToolbar>
    <PeriodFrame data={data} loading={loading} onReload={reload}>{(current) => { const scope = reportScope(current, view.project), week = isoWeek(current.from); return <>
      <PeriodHero title={`${week.year}年第${week.week}周工作周报`} data={current} scope={scope} compareLabel="上周"/>
      {scope.summary.dataDays ? null : <EmptyNotice data={current}/>}
      <HeadlineCards data={current} scope={scope} compareLabel="上周"/>
      <div className="grid items-start gap-5 xl:grid-cols-[.9fr_1.1fr]"><MetricTable scope={scope} periodLabel="本周" compareLabel="上周"/><DailyTable data={current} scope={scope} view={view} title="每日概览"/></div>
      <CoverageMatrix data={current} scope={scope} view={view}/>
      <div className="grid items-start gap-5 lg:grid-cols-2"><IssuesCard scope={scope}/><FollowupsCard scope={scope}/></div>
      <DepartmentTable data={current} scope={scope}/>
    </>; }}</PeriodFrame>
  </div>;
}

export function MonthlyReport(view: PeriodViewProps) {
  const month = view.filters.month ?? view.anchorDate.slice(0, 7), bounds = monthBounds(month), previous = monthBounds(shiftMonth(month, -1)), source = sourceOf(view);
  const { data, loading, reload } = usePeriodData({ ...bounds, compareFrom: previous.from, compareTo: previous.to, source }, view.onAuthError);
  const setMonth = (value: string) => { if (isMonthKey(value)) view.setFilters({ month: value }); };
  return <div className="space-y-5">
    <PeriodToolbar view={view} title="月报月份" detail={`${formatChineseMonth(month)}（${formatMonthDay(bounds.from)}—${formatMonthDay(bounds.to)}）`} loading={loading} onReload={reload} exportHref={exportUrl({ month, project: view.project, source })} printable>
      <Button variant="outline" size="sm" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft/>上月</Button>
      <Button variant="outline" size="sm" onClick={() => setMonth(todayShanghai().slice(0, 7))}>本月</Button>
      <Button variant="outline" size="sm" onClick={() => setMonth(shiftMonth(month, 1))}>下月<ChevronRight/></Button>
      <Input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="w-[140px]" aria-label="选择月份"/>
    </PeriodToolbar>
    <PeriodFrame data={data} loading={loading} onReload={reload}>{(current) => { const scope = reportScope(current, view.project); return <>
      <PeriodHero title={`${formatChineseMonth(current.from.slice(0, 7))}工作月报`} data={current} scope={scope} compareLabel="上月"/>
      {scope.summary.dataDays ? null : <EmptyNotice data={current}/>}
      <HeadlineCards data={current} scope={scope} compareLabel="上月"/>
      <div className="grid items-start gap-5 xl:grid-cols-2"><MetricTable scope={scope} periodLabel="本月" compareLabel="上月"/><div className="space-y-5"><ProjectTable data={current} scope={scope}/><TrendChart scope={scope}/></div></div>
      <DepartmentTable data={current} scope={scope}/>
      <div className="grid items-start gap-5 lg:grid-cols-2"><FollowupsCard scope={scope}/><IssuesCard scope={scope}/></div>
      <DailyTable data={current} scope={scope} view={view} title="每日明细"/>
    </>; }}</PeriodFrame>
  </div>;
}

export function StatsReport(view: PeriodViewProps) {
  const today = todayShanghai(), range = view.filters.range ?? { from: `${view.anchorDate.slice(0, 7)}-01`, to: view.anchorDate }, source = sourceOf(view), departmentId = departmentOf(view);
  const { data, loading, reload } = usePeriodData({ ...range, source }, view.onAuthError);
  const setRange = (from: string, to: string) => {
    if (!isDateKey(from) || !isDateKey(to)) return;
    if (from > to) { toast.error("开始日期不能晚于结束日期"); return; }
    if (daysBetween(from, to) >= 366) { toast.error("统计范围最长为一年"); return; }
    view.setFilters({ range: { from, to } });
  };
  const monday = mondayOf(today), lastMonth = monthBounds(shiftMonth(today.slice(0, 7), -1));
  const presets: Array<[string, string, string]> = [["近7天", addDays(today, -6), today], ["本周", monday, today], ["上周", addDays(monday, -7), addDays(monday, -1)], ["本月", `${today.slice(0, 7)}-01`, today], ["上月", lastMonth.from, lastMonth.to], ["近30天", addDays(today, -29), today]];
  return <div className="space-y-5">
    <PeriodToolbar view={view} title="统计区间" detail={`${formatChineseDate(range.from)} 至 ${formatChineseDate(range.to)} · 共 ${daysBetween(range.from, range.to) + 1} 天`} loading={loading} onReload={reload} exportHref={exportUrl({ ...range, project: view.project, department: departmentId, source })} withDepartment
      footer={presets.map(([label, from, to]) => <Button key={label} size="sm" variant="outline" onClick={() => setRange(from, to)} className={range.from === from && range.to === to ? "border-[#c40000] text-[#c40000]" : ""}>{label}</Button>)}>
      <Input type="date" value={range.from} max={range.to} onChange={(event) => setRange(event.target.value, range.to)} className="w-[148px]" aria-label="开始日期"/>
      <span className="text-xs text-slate-400">至</span>
      <Input type="date" value={range.to} min={range.from} onChange={(event) => setRange(range.from, event.target.value)} className="w-[148px]" aria-label="结束日期"/>
    </PeriodToolbar>
    <PeriodFrame data={data} loading={loading} onReload={reload}>{(current) => { const scope = reportScope(current, view.project, departmentId), totals = scope.summary.totals, points = chartPoints(scope); return <>
      {scope.summary.dataDays ? null : <EmptyNotice data={current}/>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard icon={CalendarCheck} label="有数据天数" value={`${scope.summary.dataDays}/${scope.summary.dayCount}`} unit="天" sub={`已发布 ${scope.summary.publishedDays} 天 · ${scopeLabel(view.project, departmentId)}`}/>
        <KpiCard icon={ClipboardList} label="工作项（累计）" value={fmt(totals.workItems)} unit="项" sub={`完成 ${fmt(totals.completedItems)} · 日均 ${fmt(average(totals.workItems, scope.summary.dataDays))}`}/>
        <KpiCard icon={BadgeCheck} label="工作闭环率" value={totals.completionRate ?? "--"} unit="%" sub="完成工作 ÷ 工作项"/>
        <KpiCard icon={Wrench} label="新增/完成报修" value={`${totals.newRepairs}/${totals.completedRepairs}`} unit="项" sub={`日均新增 ${fmt(average(totals.newRepairs, scope.summary.dataDays))}`}/>
        <KpiCard icon={TriangleAlert} label="异常（累计）" value={fmt(totals.abnormal)} unit="项" warn={totals.abnormal > 0} sub={`固定工作/数量异常 ${scope.issues.length} 条`}/>
        <KpiCard icon={ClipboardCheck} label="快递/会议" value={`${totals.service.express}/${totals.service.meetings}`} unit="件/场" sub={`参会 ${totals.service.participants} 人`}/>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <ChartCard title="工作闭环率" description="每日完成工作 ÷ 工作项" config={RATE_CONFIG}><TrendLines points={points} keys={["completionRate"]} percentAxis/></ChartCard>
        <ChartCard title="报修新增与完成" description="新增报修与完成维修的逐日数量" config={REPAIR_CONFIG}><BarChart data={points} margin={{ left: 4, right: 12 }}><CartesianGrid vertical={false}/><XAxis dataKey="date" tickLine={false} axisLine={false} minTickGap={12}/><YAxis allowDecimals={false} width={36}/><ChartTooltip content={<ChartTooltipContent/>}/><ChartLegend content={<ChartLegendContent/>}/><Bar dataKey="newRepairs" fill="var(--color-newRepairs)" radius={4}/><Bar dataKey="completedRepairs" fill="var(--color-completedRepairs)" radius={4}/></BarChart></ChartCard>
        <ChartCard title="异常与未闭环" description="每日异常数（数量异常 + 异常跟进事项）与当日未闭环事项" config={ISSUE_CONFIG}><TrendLines points={points} keys={["abnormal", "open"]}/></ChartCard>
        <ChartCard title="快递与会议" description="快递收发件数（左轴）与会议场次、参会人数（右轴）" config={SERVICE_CONFIG}><TrendLines points={points} keys={["express", "meetings", "participants"]} rightKeys={["meetings", "participants"]}/></ChartCard>
        {departmentId === "all" && scope.departments.length > 1 ? <ChartCard title="部门对比" description="期间内各部门工作项与完成数量" config={DEPARTMENT_CONFIG} className="lg:col-span-2"><BarChart data={scope.summary.byDepartment.map((item) => ({ name: item.department.name, workItems: item.kpis.workItems, completedItems: item.kpis.completedItems }))} margin={{ left: 4, right: 12 }}><CartesianGrid vertical={false}/><XAxis dataKey="name" tickLine={false} axisLine={false}/><YAxis allowDecimals={false} width={36}/><ChartTooltip content={<ChartTooltipContent/>}/><ChartLegend content={<ChartLegendContent/>}/><Bar dataKey="workItems" fill="var(--color-workItems)" radius={4}/><Bar dataKey="completedItems" fill="var(--color-completedItems)" radius={4}/></BarChart></ChartCard> : null}
      </div>
      <DailyTable data={current} scope={scope} view={view} title="按日明细"/>
    </>; }}</PeriodFrame>
  </div>;
}
