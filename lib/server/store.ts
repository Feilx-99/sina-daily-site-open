/* eslint-disable @typescript-eslint/no-explicit-any */
import { getStore } from "@netlify/blobs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEPARTMENTS, PROJECTS, REPORT_STATUS_LABEL, FOLLOWUP_STATUSES, buildKpis, datesBetween, daysBetween, departmentById, formatChineseDate, isDateKey, isFillableDate, metricSummary, todayShanghai, weekdayLabel, type Kpis, type Role } from "@/lib/domain";
import { DEMO_SEED, HISTORICAL_SEED, type HistoricalSeed } from "@/lib/historical-seed";
import { MAX_PHOTOS_PER_DAY, PHOTO_BYTE_LIMIT, compressForStorage, jpegFileName, makeThumbnail, photoBlobKey, photoExpired, photoThumbKey } from "@/lib/server/photos";
import { PERIOD_METRICS, SOURCE_LABEL, average, change, followupStats, percent, scopeDepartments, scopeLabel, sortFollowups, summarizePeriod, type DayStatus, type PeriodData, type PeriodDay, type PeriodFact, type PeriodFollowup, type PeriodIssue, type PeriodSlice, type PeriodSource } from "@/lib/period";

const SESSION_COOKIE = "property_session";
const SESSION_DAYS = 30;
const hasNetlifyBlobsEnv = () => Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT || (process.env.SITE_ID && (process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN)));
function localStore(name: string) {
  const dir = path.join(process.cwd(), ".local-blobs", name);
  const fileFor = (key: string) => path.join(dir, encodeURIComponent(key));
  /** 每个请求都会整份重写 state：先写临时文件再改名，并发读取只会看到完整的旧版或新版；只有文件不存在才当作空，读失败不能被当成“没有数据”而重新初始化 */
  const writeAtomic = async (file: string, data: string | Buffer) => { await fs.mkdir(dir, { recursive: true }); const temp = `${file}.${crypto.randomUUID()}.tmp`; await fs.writeFile(temp, data); await fs.rename(temp, file); };
  return {
    async get(key: string, options?: { type?: string }): Promise<any> {
      try {
        if (options?.type === "json") return JSON.parse(await fs.readFile(`${fileFor(key)}.json`, "utf8"));
        if (options?.type === "arrayBuffer") { const buf = await fs.readFile(fileFor(key)); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength); }
        return await fs.readFile(fileFor(key), "utf8");
      } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    },
    async set(key: string, value: ArrayBuffer | Uint8Array | string) { await writeAtomic(fileFor(key), typeof value === "string" ? value : Buffer.from(value as ArrayBuffer)); },
    async setJSON(key: string, value: unknown) { await writeAtomic(`${fileFor(key)}.json`, JSON.stringify(value)); },
    async delete(key: string) { await fs.rm(fileFor(key), { force: true }); },
    async getMetadata(key: string) {
      try { await fs.access(fileFor(key)); return { metadata: {} }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    },
  };
}
const storage = (): any => (hasNetlifyBlobsEnv() ? getStore({ name: "property-daily-data", consistency: "strong" }) : localStore("property-daily-data"));
type Session = { id: string; accessId: string; role: Role; departmentId: string | null; expiresAt: string };
type ReportPayload = { reportDate: string; departmentId: string; reporterName: string; routineStatus: string; notes?: string; confirmedZero: boolean; metrics: Record<string, string | number | null>; followups?: Array<Record<string, any>> };
type Report = { id: string; reportDate: string; departmentId: string; reporterName: string; routineStatus: string; status: string; notes: string; reviewComment: string; confirmedZero: boolean; updatedAt: string; metrics: Record<string, any>; followups: Array<Record<string, any>>; photos: Array<Record<string, any>> };
type Access = { id: string; label: string; role: Role; departmentId: string | null; lookupHash: string; salt: string; codeHash: string; active: boolean; updatedAt: string };
type Stored = { version: 1; access: Access[]; reports: Record<string, Report>; sessions: Record<string, Session>; attempts: Record<string, { failureCount: number; windowStartedAt: string; lockedUntil: string | null }>; publications: Array<{ id: string; reportDate: string; version: number; snapshot: any; publishedAt: string }>; audit: Array<Record<string, any>>; followupDismissed?: string[] };
/** 角色清单不含访问码。码只来自 ACCESS_CODE_*，或在存储为空时随机生成一次。 */
const ACCESS_ROLES: Array<{ id: string; label: string; role: Role; departmentId: string | null; env: string }> = [
  { id: "admin", label: "管理员", role: "admin", departmentId: null, env: "ACCESS_CODE_ADMIN" },
  { id: "client", label: "甲方查看", role: "client", departmentId: null, env: "ACCESS_CODE_CLIENT" },
  { id: "qh_customer", label: "启皓客服", role: "department", departmentId: "qh_customer", env: "ACCESS_CODE_QH_CUSTOMER" },
  { id: "qh_engineering", label: "启皓工程", role: "department", departmentId: "qh_engineering", env: "ACCESS_CODE_QH_ENGINEERING" },
  { id: "qh_cleaning", label: "启皓保洁", role: "department", departmentId: "qh_cleaning", env: "ACCESS_CODE_QH_CLEANING" },
  { id: "qh_security", label: "启皓安保", role: "department", departmentId: "qh_security", env: "ACCESS_CODE_QH_SECURITY" },
  { id: "wd_service", label: "五栋", role: "department", departmentId: "wd_service", env: "ACCESS_CODE_WD_SERVICE" },
];
const localCodesFile = () => path.join(process.cwd(), ".local-access-codes.json");
const nowIso = () => new Date().toISOString();
const keyFor = (date: string, departmentId: string) => `${date}:${departmentId}`;
const bytesHex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
const sha256 = async (value: string) => bytesHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
const codeLookup = (code: string) => sha256(`sina-property:${code}`);
function parseCookie(request: Request, name: string) { const hit = (request.headers.get("cookie") ?? "").split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`)); return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null; }
function randomToken() { const bytes = crypto.getRandomValues(new Uint8Array(32)); return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
const cookieSecurity = () => process.env.LOCAL_TEST_MODE === "true" ? "" : " Secure;";
export const sessionCookie = (token: string) => `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly;${cookieSecurity()} SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
export const clearSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly;${cookieSecurity()} SameSite=Lax; Max-Age=0`;
function randomSix() { return String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0"); }
function randomHex(size = 16) { return [...crypto.getRandomValues(new Uint8Array(size))].map((value) => value.toString(16).padStart(2, "0")).join(""); }
async function readLocalCodes(): Promise<Record<string, string>> {
  if (hasNetlifyBlobsEnv()) return {};
  try { const parsed = JSON.parse(await fs.readFile(localCodesFile(), "utf8")) as { codes?: Record<string, string> }; return parsed.codes ?? {}; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
}
async function buildInitialAccess(): Promise<Access[]> {
  const saved = await readLocalCodes();
  const generated: Record<string, string> = {};
  const chosen = new Set<string>();
  const access: Access[] = [];
  for (const role of ACCESS_ROLES) {
    const fromEnv = process.env[role.env]?.trim() ?? "";
    if (fromEnv && !/^\d{6}$/.test(fromEnv)) throw new Error(`${role.env} 必须是 6 位数字。请在环境变量中设置，不要把访问码写进代码仓库。`);
    const savedCode = saved[role.id] ?? "";
    const fromFile = /^\d{6}$/.test(savedCode) ? savedCode : "";
    let code = fromEnv || fromFile;
    let minted = false;
    if (!code) { do { code = randomSix(); } while (chosen.has(code)); minted = true; }
    if (chosen.has(code)) throw new Error(`访问码重复（${role.env}）。请为每个角色设置不同的 6 位数字。`);
    chosen.add(code);
    if (minted) generated[role.id] = code;
    const salt = randomHex();
    access.push({ id: role.id, label: role.label, role: role.role, departmentId: role.departmentId, lookupHash: await codeLookup(code), salt, codeHash: await sha256(`${salt}:${code}`), active: true, updatedAt: nowIso() });
  }
  if (Object.keys(generated).length) {
    const codes = { ...saved, ...generated };
    try { await fs.writeFile(localCodesFile(), `${JSON.stringify({ generatedAt: nowIso(), codes, note: "首次启动随机生成，已被 git 忽略。请改为 ACCESS_CODE_* 环境变量。" }, null, 2)}\n`); }
    catch (error) { console.error("write access codes file", error); }
    console.warn(`[access] ${Object.keys(generated).length} 个角色未设置 ACCESS_CODE_*，已随机生成。本地见 ${localCodesFile()}。生产环境请在首次访问前设置环境变量；若已经随机初始化，下面这行日志只会出现一次，之后请到管理界面更换或清空 Blobs 的 state 后重建。`);
    console.warn(`[access] ${Object.entries(generated).map(([id, code]) => `${id}=${code}`).join(" ")}`);
  }
  return access;
}
async function fresh(): Promise<Stored> { return { version: 1, access: await buildInitialAccess(), reports: {}, sessions: {}, attempts: {}, publications: [], audit: [] }; }
async function state(): Promise<Stored> { const saved = await storage().get("state", { type: "json" }) as Stored | null; if (saved) return saved; const initial = await fresh(); seedHistorical(initial); await storage().setJSON("state", initial); return initial; }
async function save(value: Stored) { await storage().setJSON("state", value); }
async function mutate<T>(work: (value: Stored) => Promise<T> | T) { const value = await state(); const result = await work(value); await save(value); return result; }
function audit(value: Stored, action: string, extra: Record<string, any> = {}) { value.audit.push({ action, at: nowIso(), ...extra }); if (value.audit.length > 500) value.audit.splice(0, value.audit.length - 500); }
function activeSeed(): HistoricalSeed { return process.env.DEMO_SEED === "true" ? DEMO_SEED : HISTORICAL_SEED; }
function seedHistorical(value: Stored) { const seed = activeSeed(); for (const item of seed.reports) { const key = keyFor(item.reportDate, item.departmentId); if (value.reports[key]) continue; value.reports[key] = { id: `demo-${item.reportDate}-${item.departmentId}`, reportDate: item.reportDate, departmentId: item.departmentId, reporterName: item.reporterName, routineStatus: item.routineStatus, status: "approved", notes: item.notes ?? "", reviewComment: item.reviewComment ?? "示例数据", confirmedZero: true, updatedAt: `${item.reportDate}T18:00:00.000Z`, metrics: item.metrics, followups: [], photos: [] }; } seed.followups.forEach((item, index) => { const report = value.reports[keyFor(item.reportDate, item.departmentId)]; if (report) report.followups.push({ id: `demo-follow-${index + 1}`, category: item.category, content: item.content, quantity: item.quantity, unit: item.unit, status: item.status, responsiblePerson: item.responsiblePerson, dueDate: item.dueDate, completedDate: item.completedDate, isAbnormal: Boolean(item.isAbnormal), notes: item.notes, sourceStatus: item.sourceStatus }); }); for (const day of [...new Set(seed.reports.map((item) => item.reportDate))]) publish(value, day, true); }
export async function ensureAccessSeeded() { await state(); }
export async function ensureHistoricalSeeded() { await state(); }
function ipFromRequest(request: Request) { return request.headers.get("x-nf-client-connection-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"; }
export async function login(request: Request, code: string) { if (!/^\d{6}$/.test(code)) throw new Error("请输入6位数字访问码。"); return mutate(async (value) => { const ipKey = await sha256(`login-ip:${ipFromRequest(request)}`), current = new Date(), previous = value.attempts[ipKey]; if (previous?.lockedUntil && new Date(previous.lockedUntil) > current) throw new Error("访问码连续输错次数过多，请15分钟后再试。"); const lookupHash = await codeLookup(code), access = value.access.find((item) => item.active && item.lookupHash === lookupHash); if (!access) { const started = previous ? new Date(previous.windowStartedAt) : current, inWindow = current.getTime() - started.getTime() < 900000, count = inWindow ? (previous?.failureCount ?? 0) + 1 : 1, lock = count >= 5 ? new Date(current.getTime() + 900000).toISOString() : null; value.attempts[ipKey] = { failureCount: count, windowStartedAt: inWindow ? previous?.windowStartedAt ?? current.toISOString() : current.toISOString(), lockedUntil: lock }; throw new Error(lock ? "访问码连续输错次数过多，请15分钟后再试。" : `访问码不正确，还可尝试${5 - count}次。`); } delete value.attempts[ipKey]; const token = randomToken(), id = await sha256(token), expiresAt = new Date(current.getTime() + SESSION_DAYS * 86400000).toISOString(), session = { id, accessId: access.id, role: access.role, departmentId: access.departmentId, expiresAt }; value.sessions[id] = session; audit(value, "login", { role: access.role, departmentId: access.departmentId }); return { token, session, label: access.label }; }); }
export async function getSession(request: Request): Promise<Session | null> { const token = parseCookie(request, SESSION_COOKIE); if (!token) return null; const id = await sha256(token); return mutate((value) => { const session = value.sessions[id]; if (!session || new Date(session.expiresAt) <= new Date()) { delete value.sessions[id]; return null; } return session; }); }
export async function logout(request: Request) { const token = parseCookie(request, SESSION_COOKIE); if (token) await mutate(async (value) => { delete value.sessions[await sha256(token)]; }); }
export async function requireSession(request: Request) { const session = await getSession(request); if (!session) throw new Error("登录已失效，请重新输入访问码。"); return session; }
/** 部门只能填写、修改今天的日报（含照片和草稿）；更早的日期只能查看。管理员不受此限制 */
function dateAllowed(date: string) { return isFillableDate(date); }
const FILL_WINDOW_ERROR = "只能填写本部门今天的日报。";
function validateFollowup(item: Record<string, any>) { const label = String(item.content ?? "").trim().slice(0, 20); if (!label) throw new Error("跟进事项必须填写事项内容。"); if (!String(item.responsiblePerson ?? "").trim()) throw new Error(`「${label}」必须填写责任人。`); if (item.status === "completed" && !item.completedDate) throw new Error(`「${label}」已完成，必须填写完成日期。`); if (item.status !== "completed" && !item.dueDate) throw new Error(`「${label}」未完成，必须填写截止日期。`); }
/** 结转生效起点：只有该日期（含）之后填报的未闭环事项才会带入下一天，更早的历史事项不结转 */
const CARRY_SINCE = "2026-09-15";
/** 收集某部门在 reportDate 之前所有未闭环的跟进事项（同一事项取最新状态；管理员已关闭的不再带入） */
function collectCarried(value: Stored, departmentId: string, reportDate: string): Array<Record<string, any>> { const dismissed = new Set(value.followupDismissed ?? []); const latest = new Map<string, Record<string, any>>(); for (const report of Object.values(value.reports).filter((item) => item.departmentId === departmentId && item.reportDate >= CARRY_SINCE && item.reportDate < reportDate).sort((a, b) => a.reportDate.localeCompare(b.reportDate))) for (const item of report.followups ?? []) latest.set(String(item.id), item); return [...latest.values()].filter((item) => item.status !== "completed" && !dismissed.has(String(item.id))).map((item) => ({ ...item, carried: true })); }
export async function saveReport(session: Session, payload: ReportPayload, submit: boolean) { if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.reportDate)) throw new Error("日报日期不正确。"); const departmentId = session.role === "department" ? session.departmentId! : payload.departmentId; if (!departmentById(departmentId)) throw new Error("部门不正确。"); if (session.role === "department" && (!dateAllowed(payload.reportDate) || departmentId !== session.departmentId)) throw new Error(FILL_WINDOW_ERROR); if (!payload.reporterName.trim()) throw new Error("请填写填报人。"); if (submit && !payload.confirmedZero) throw new Error("提交前请确认所有数量已经核对，0代表今日没有发生。"); (payload.followups ?? []).forEach(validateFollowup); return mutate((value) => { const key = keyFor(payload.reportDate, departmentId), old = value.reports[key]; if (session.role === "department" && old && ["submitted", "approved"].includes(old.status)) throw new Error("该日报已经提交，需由管理员退回后才能修改。"); const mergedFollowups: Array<Record<string, any>> = (payload.followups ?? []).map((item) => ({ ...item, id: item.id ?? crypto.randomUUID(), isAbnormal: Boolean(item.isAbnormal) })); if (session.role === "department") { const carried = collectCarried(value, departmentId, payload.reportDate), carriedIds = new Set(carried.map((item) => String(item.id))); for (const item of carried) if (!mergedFollowups.some((existing) => String(existing.id) === String(item.id))) mergedFollowups.push(item); for (const item of mergedFollowups) item.carried = carriedIds.has(String(item.id)); } const report: Report = { id: old?.id ?? crypto.randomUUID(), reportDate: payload.reportDate, departmentId, reporterName: payload.reporterName.trim(), routineStatus: payload.routineStatus, status: submit ? "submitted" : old?.status === "returned" ? "returned" : "draft", notes: payload.notes?.trim() ?? "", reviewComment: old?.status === "returned" ? "" : old?.reviewComment ?? "", confirmedZero: payload.confirmedZero, updatedAt: nowIso(), metrics: payload.metrics, followups: mergedFollowups, photos: old?.photos ?? [] }; value.reports[key] = report; audit(value, submit ? "submit_report" : "save_report", { departmentId, reportDate: payload.reportDate }); return { id: report.id, status: report.status }; }); }
function publicPhoto(photo: Record<string, any>) { const rest = { ...photo }; delete rest.fullArchived; return { ...rest, url: `/api/photo/${photo.id}`, thumbUrl: `/api/photo/${photo.id}?size=thumb` }; }
function publicReport(report: Report) { return { ...report, summary: metricSummary(report.departmentId, report.metrics), photos: report.photos.map(publicPhoto) }; }
function reportsFor(value: Stored, reportDate: string, departmentId?: string | null) { return Object.values(value.reports).filter((item) => item.reportDate === reportDate && (!departmentId || item.departmentId === departmentId)).sort((a, b) => a.departmentId.localeCompare(b.departmentId)).map(publicReport); }
function snapshot(value: Stored, reportDate: string) { const approved = reportsFor(value, reportDate).filter((item) => item.status === "approved"), included = new Map(approved.map((item) => [item.departmentId, item])); const reports = DEPARTMENTS.map((department) => included.get(department.id) ?? ({ departmentId: department.id, reportDate, status: "missing", metrics: {}, followups: [], photos: [], summary: "未提交或未审核" })); return { reportDate, generatedAt: nowIso(), departments: DEPARTMENTS.map(({ id, name, project, shortName }) => ({ id, name, project, shortName })), reports, kpis: buildKpis(approved, reportDate) }; }
function publish(value: Stored, reportDate: string, historical = false) { const version = Math.max(0, ...value.publications.filter((item) => item.reportDate === reportDate).map((item) => item.version)) + 1, result = { id: `${historical ? "hist-pub" : "pub"}-${reportDate}-${version}`, reportDate, version, snapshot: snapshot(value, reportDate), publishedAt: historical ? `${reportDate}T20:00:00.000Z` : nowIso() }; value.publications.push(result); return result; }
export async function publishDate(reportDate: string) { return mutate((value) => publish(value, reportDate)); }
export async function adminReview(session: Session, reportId: string, action: "approve" | "return" | "reopen", comment = "") { if (session.role !== "admin") throw new Error("只有管理员可以审核日报。"); await mutate((value) => { const report = Object.values(value.reports).find((item) => item.id === reportId); if (!report) throw new Error("日报不存在。"); report.status = action === "approve" ? "approved" : "returned"; report.reviewComment = comment.trim(); report.updatedAt = nowIso(); audit(value, action, { reportId, comment: comment.trim() }); }); }
export async function rotateAccessCode(session: Session, accessId: string, code: string) { if (session.role !== "admin") throw new Error("只有管理员可以更换访问码。"); if (!/^\d{6}$/.test(code)) throw new Error("新访问码必须是6位数字。"); await mutate(async (value) => { const target = value.access.find((item) => item.id === accessId); if (!target) throw new Error("访问角色不存在。"); const lookupHash = await codeLookup(code); if (value.access.some((item) => item.id !== accessId && item.lookupHash === lookupHash)) throw new Error("该访问码已被其他角色使用，请换一个。"); target.lookupHash = lookupHash; target.updatedAt = nowIso(); Object.entries(value.sessions).forEach(([id, item]) => { if (item.accessId === accessId) delete value.sessions[id]; }); audit(value, "rotate_code", { accessId }); }); }
export async function adminSaveReport(session: Session, reportId: string, payload: ReportPayload) { if (session.role !== "admin") throw new Error("只有管理员可以修改日报。"); return mutate((value) => { const report = Object.values(value.reports).find((item) => item.id === reportId); if (!report) throw new Error("日报不存在。"); if (!payload.reporterName?.trim()) throw new Error("请填写填报人。"); report.reporterName = payload.reporterName.trim(); report.routineStatus = payload.routineStatus; report.notes = payload.notes?.trim() ?? ""; report.metrics = payload.metrics; const keptIds = new Set((payload.followups ?? []).map((item) => String(item.id))), removedIds = (report.followups ?? []).filter((item) => !keptIds.has(String(item.id))).map((item) => String(item.id)); if (removedIds.length) value.followupDismissed = [...(value.followupDismissed ?? []), ...removedIds].slice(-2000); report.followups = (payload.followups ?? []).map((item) => ({ ...item, id: item.id ?? crypto.randomUUID(), isAbnormal: Boolean(item.isAbnormal) })); report.confirmedZero = Boolean(payload.confirmedZero); report.updatedAt = nowIso(); audit(value, "admin_edit", { reportId, departmentId: report.departmentId, reportDate: report.reportDate }); return { id: report.id, status: report.status }; }); }
type Publication = Stored["publications"][number];
/** 同一日期可多次发布，只取版本号最大的一次 */
function latestPublications(value: Stored) { const latest = new Map<string, Publication>(); for (const item of value.publications) { const current = latest.get(item.reportDate); if (!current || item.version >= current.version) latest.set(item.reportDate, item); } return latest; }
function monthlyTrend(value: Stored, month: string) { return [...latestPublications(value).values()].filter((item) => item.reportDate.startsWith(month)).sort((a, b) => a.reportDate.localeCompare(b.reportDate)).map((item) => ({ date: item.reportDate, ...item.snapshot.kpis })); }
export async function loadData(session: Session, reportDate: string, project = "全部") { await ensureHistoricalSeeded(); await archiveExpiredPhotos(reportDate); const value = await state(), month = reportDate.slice(0, 7); if (session.role === "client") { const publication = value.publications.filter((item) => item.reportDate === reportDate).at(-1) ?? [...value.publications].sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.version - a.version)[0]; const monthly = monthlyTrend(value, month); return { role: session.role, selectedDate: publication?.reportDate ?? reportDate, snapshot: publication?.snapshot ?? null, publishedAt: publication?.publishedAt ?? null, monthly }; } const monthly = monthlyTrend(value, month); const todayReport = session.role === "department" && session.departmentId ? value.reports[keyFor(reportDate, session.departmentId)] : null; const carried = session.role === "department" && session.departmentId && dateAllowed(reportDate) ? collectCarried(value, session.departmentId, reportDate).filter((item) => !(todayReport?.followups ?? []).some((existing) => String(existing.id) === String(item.id))) : []; return { role: session.role, departmentId: session.departmentId, reportDate, project, reports: reportsFor(value, reportDate, session.role === "department" ? session.departmentId : null), carried, snapshot: snapshot(value, reportDate), monthly, accessCodes: session.role === "admin" ? value.access.map(({ lookupHash, salt, codeHash, ...item }) => item) : [] }; }
export async function snapshotForExport(session: Session, reportDate: string) { const value = await state(); if (session.role === "client") { const publication = value.publications.filter((item) => item.reportDate === reportDate).at(-1) ?? [...value.publications].sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.version - a.version)[0]; return publication?.snapshot ?? null; } return snapshot(value, reportDate); }
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ARCHIVE_BATCH = 6;
async function readBlob(key: string): Promise<Uint8Array | null> { const data = await storage().get(key, { type: "arrayBuffer" }) as ArrayBuffer | null; return data ? new Uint8Array(data) : null; }
async function writeBlob(key: string, bytes: Buffer, contentType: string, fileName?: string) { await storage().set(key, bytes, { metadata: { contentType, ...(fileName ? { fileName } : {}) } }); }
async function blobExists(key: string) { const store = storage(); if (typeof store.getMetadata === "function") return Boolean(await store.getMetadata(key)); return Boolean(await store.get(key, { type: "arrayBuffer" })); }
/** 缺缩略图时从原图补一份（不删除原图）。日报日期已超过 30 天则在缩略图就绪后删掉原图。 */
async function settlePhoto(photo: Record<string, any>, reportDate: string, variant: "full" | "thumb") {
  const id = String(photo.id), fullKey = photoBlobKey(id), thumbKey = photoThumbKey(id);
  const expired = photo.fullArchived === true || photoExpired(reportDate);
  let thumb = await readBlob(thumbKey);
  let full: Uint8Array | null = null;
  if (!thumb || (!expired && variant === "full")) full = await readBlob(fullKey);
  if (!thumb && full) {
    try { const made = await makeThumbnail(Buffer.from(full)); await writeBlob(thumbKey, made, "image/jpeg"); thumb = new Uint8Array(made); }
    catch (error) { console.error("thumbnail", id, error); }
  }
  let markArchived = false;
  if (expired && photo.fullArchived !== true) {
    const fullStillThere = Boolean(full) || await blobExists(fullKey);
    if (thumb) { if (fullStillThere) await storage().delete(fullKey); full = null; markArchived = true; }
    else if (!fullStillThere) markArchived = true;
  }
  const preferThumb = variant === "thumb" || expired;
  let bytes = preferThumb ? thumb : full;
  let asThumb = Boolean(preferThumb && thumb);
  if (!bytes && full) { bytes = full; asThumb = false; }
  if (!bytes && thumb) { bytes = thumb; asThumb = true; }
  if (!bytes) return { markArchived, body: null };
  const fileName = String(photo.fileName || "photo.jpg");
  return { markArchived, body: { object: bytes, contentType: asThumb ? "image/jpeg" : String(photo.contentType || "image/jpeg"), fileName: asThumb ? jpegFileName(fileName) : fileName } };
}
async function markPhotosArchived(ids: string[]) {
  if (!ids.length) return;
  const pending = new Set(ids);
  await mutate((value) => { for (const report of Object.values(value.reports)) for (const photo of report.photos ?? []) if (pending.has(String(photo.id))) photo.fullArchived = true; });
}
/** 打开日报时顺手清理过期原图，每次最多处理几张，避免一次请求扫完全部历史。不依赖外部定时任务。 */
export async function archiveExpiredPhotos(preferDate?: string) {
  try {
    const today = todayShanghai();
    const value = await state();
    const reports = Object.values(value.reports).filter((report) => photoExpired(report.reportDate, today) && (report.photos ?? []).some((photo) => !photo.fullArchived));
    reports.sort((a, b) => {
      if (preferDate && a.reportDate === preferDate && b.reportDate !== preferDate) return -1;
      if (preferDate && b.reportDate === preferDate && a.reportDate !== preferDate) return 1;
      return a.reportDate.localeCompare(b.reportDate);
    });
    const queue: Array<{ photo: Record<string, any>; reportDate: string }> = [];
    for (const report of reports) {
      for (const photo of report.photos ?? []) {
        if (photo.fullArchived) continue;
        queue.push({ photo, reportDate: report.reportDate });
        if (queue.length >= ARCHIVE_BATCH) break;
      }
      if (queue.length >= ARCHIVE_BATCH) break;
    }
    const archived: string[] = [];
    for (const item of queue) {
      try { const settled = await settlePhoto(item.photo, item.reportDate, "thumb"); if (settled.markArchived) archived.push(String(item.photo.id)); }
      catch (error) { console.error("archive photo", item.photo?.id, error); }
    }
    await markPhotosArchived(archived);
  } catch (error) { console.error("archive photos", error); }
}
export async function uploadPhoto(session: Session, reportId: string, file: File, caption: string) {
  if (!file.type.match(/^image\/(jpeg|png|webp|heic|heif)$/)) throw new Error("仅支持JPG、PNG、WebP或HEIC照片。");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("单张照片不能超过10MB。");
  if (file.size === 0) throw new Error("照片文件是空的。");
  const original = Buffer.from(await file.arrayBuffer());
  const stored = await compressForStorage(original, file.type);
  if (stored.bytes.length > PHOTO_BYTE_LIMIT) throw new Error("照片压缩后仍超过1.5MB，请换一张较小的照片。");
  const thumb = await makeThumbnail(stored.bytes);
  const id = crypto.randomUUID();
  const fileName = stored.contentType === file.type ? file.name : jpegFileName(file.name);
  return mutate(async (value) => {
    const report = Object.values(value.reports).find((item) => item.id === reportId);
    if (!report) throw new Error("请先保存日报，再上传照片。");
    if (session.role === "department" && (report.departmentId !== session.departmentId || ["submitted", "approved"].includes(report.status))) throw new Error("当前日报不能上传照片。");
    if (session.role === "department" && !dateAllowed(report.reportDate)) throw new Error(FILL_WINDOW_ERROR);
    if (report.photos.length >= MAX_PHOTOS_PER_DAY) throw new Error("每个部门每天最多上传6张照片。");
    const fullKey = photoBlobKey(id), thumbKey = photoThumbKey(id);
    await writeBlob(fullKey, stored.bytes, stored.contentType, fileName);
    try { await writeBlob(thumbKey, thumb, "image/jpeg", jpegFileName(fileName)); }
    catch (error) { await storage().delete(fullKey); throw error; }
    report.photos.push({ id, fileName, contentType: stored.contentType, caption: caption.trim(), displayOrder: report.photos.length, fullArchived: false });
    return { id, url: `/api/photo/${id}`, thumbUrl: `/api/photo/${id}?size=thumb` };
  });
}
export async function deletePhoto(session: Session, photoId: string) { await mutate(async (value) => { const report = Object.values(value.reports).find((item) => item.photos.some((photo) => photo.id === photoId)); if (!report) return; if (session.role === "department" && (report.departmentId !== session.departmentId || ["submitted", "approved"].includes(report.status))) throw new Error("当前照片不能删除。"); if (session.role === "department" && !dateAllowed(report.reportDate)) throw new Error(FILL_WINDOW_ERROR); report.photos = report.photos.filter((photo) => photo.id !== photoId); await storage().delete(photoBlobKey(photoId)); await storage().delete(photoThumbKey(photoId)); }); }
export async function getPhoto(session: Session, photoId: string, variant: "full" | "thumb" = "full") {
  const value = await state(), report = Object.values(value.reports).find((item) => item.photos.some((photo) => photo.id === photoId));
  if (!report) return null;
  if (session.role === "department" && report.departmentId !== session.departmentId) throw new Error("无权查看该照片。");
  if (session.role === "client" && !value.publications.some((item) => JSON.stringify(item.snapshot).includes(`\"id\":\"${photoId}\"`))) throw new Error("该照片尚未发布。");
  const photo = report.photos.find((item) => item.id === photoId)!;
  const settled = await settlePhoto(photo, report.reportDate, variant);
  if (settled.markArchived) await markPhotosArchived([photoId]);
  return settled.body;
}
type PeriodReport = { reportDate: string; departmentId: string; reporterName?: string; routineStatus?: string; status?: string; notes?: string; metrics?: Record<string, any>; followups?: Array<Record<string, any>> };
type PeriodRange = { from: string; to: string };
function periodRange(from: unknown, to: unknown): PeriodRange { if (!isDateKey(from) || !isDateKey(to) || from > to) throw new Error("统计日期范围不正确。"); if (daysBetween(from, to) >= 366) throw new Error("统计范围最长为一年。"); return { from, to }; }
/** 周报/月报/统计的数据来源：管理员实时口径只取已审核日报；甲方口径只取每个日期最新发布快照中已纳入的部门日报。返回截至 to 的全部记录（按日期升序），期初之前的记录用于判断跟进事项是否为本期新增 */
function periodReports(value: Stored, source: PeriodSource, publications: Map<string, Publication>, to: string): PeriodReport[] {
  const list: PeriodReport[] = source === "published"
    ? [...publications.values()].filter((item) => item.reportDate <= to).flatMap((item) => (item.snapshot?.reports ?? []).filter((report: PeriodReport) => report.status !== "missing").map((report: PeriodReport) => ({ ...report, reportDate: item.reportDate })))
    : Object.values(value.reports).filter((report) => report.status === "approved" && report.reportDate <= to);
  return list.sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.departmentId.localeCompare(b.departmentId));
}
function periodDays(value: Stored, source: PeriodSource, publications: Map<string, Publication>, range: PeriodRange): PeriodDay[] {
  return datesBetween(range.from, range.to).map((date) => {
    const publication = publications.get(date), included = new Set<string>((publication?.snapshot?.reports ?? []).filter((report: PeriodReport) => report.status !== "missing").map((report: PeriodReport) => report.departmentId));
    const statuses: Record<string, DayStatus> = {};
    let stale = false;
    for (const department of DEPARTMENTS) {
      if (source === "published") { statuses[department.id] = !publication ? "unpublished" : included.has(department.id) ? "approved" : "missing"; continue; }
      const report = value.reports[keyFor(date, department.id)];
      statuses[department.id] = (report?.status as DayStatus | undefined) ?? "missing";
      if (publication && report && report.updatedAt > publication.publishedAt && (report.status === "approved" || included.has(department.id))) stale = true;
    }
    return { date, published: Boolean(publication), publishedAt: publication?.publishedAt ?? null, stale, active: Boolean(publication) || Object.values(statuses).some((status) => status !== "missing" && status !== "unpublished"), statuses };
  });
}
function periodFact(report: PeriodReport): PeriodFact {
  const metrics: Record<string, number> = {};
  for (const metric of departmentById(report.departmentId)?.metrics ?? []) { if (metric.type === "status") continue; const amount = Number(report.metrics?.[metric.key] ?? 0) || 0; if (amount) metrics[metric.key] = amount; }
  return { date: report.reportDate, departmentId: report.departmentId, reporterName: String(report.reporterName ?? ""), kpis: buildKpis([report], report.reportDate), metrics };
}
/** 固定工作的异常/未执行项，以及各部门数量型“异常”指标 */
function periodIssues(reports: PeriodReport[]): PeriodIssue[] {
  const issues: PeriodIssue[] = [];
  for (const report of reports) {
    const department = departmentById(report.departmentId), metrics = report.metrics ?? {}, base = { date: report.reportDate, departmentId: report.departmentId };
    if (!department) continue;
    let routineFlagged = false;
    for (const metric of department.metrics) {
      const raw = metrics[metric.key];
      if (metric.type === "status" && (raw === "abnormal" || raw === "not_done")) { issues.push({ ...base, kind: "routine", label: metric.label, value: raw === "abnormal" ? "异常" : "未执行", count: 1 }); routineFlagged = true; }
      else if (metric.key === "abnormal" && Number(raw ?? 0) > 0) issues.push({ ...base, kind: "count", label: metric.label, value: `${Number(raw)}${metric.unit ?? ""}`, count: Number(raw) });
    }
    if (!routineFlagged && report.routineStatus && report.routineStatus !== "normal") issues.push({ ...base, kind: "routine", label: "固定工作", value: report.routineStatus === "abnormal" ? "存在异常" : "有未执行项", count: 1 });
  }
  return issues;
}
/** 结转事项每天都会出现在日报里，这里按 id 去重并取期间内最后一次出现时的状态；管理员已移除的事项不再计入 */
function periodFollowups(reports: PeriodReport[], range: PeriodRange, today: string, dismissed: Set<string>): PeriodFollowup[] {
  const seen = new Map<string, { departmentId: string; firstSeen: string; lastSeen?: string; item?: Record<string, any> }>();
  for (const report of reports) (report.followups ?? []).forEach((item, index) => {
    const id = String(item.id ?? `${report.reportDate}:${report.departmentId}:${index}`);
    if (dismissed.has(id)) return;
    const entry = seen.get(id) ?? { departmentId: report.departmentId, firstSeen: report.reportDate };
    if (report.reportDate >= range.from) { entry.lastSeen = report.reportDate; entry.item = item; }
    seen.set(id, entry);
  });
  const asOf = range.to < today ? range.to : today;
  return [...seen].flatMap(([id, entry]) => {
    const item = entry.item;
    if (!item || !entry.lastSeen) return [];
    const status = String(item.status ?? "in_progress"), dueDate = item.dueDate ? String(item.dueDate) : null;
    return [{ id, departmentId: entry.departmentId, kind: item.kind === "key" ? "key" : "follow", category: String(item.category ?? "其他"), content: String(item.content ?? ""), status, responsiblePerson: String(item.responsiblePerson ?? ""), dueDate, completedDate: item.completedDate ? String(item.completedDate) : null, isAbnormal: Boolean(item.isAbnormal), firstSeen: entry.firstSeen, lastSeen: entry.lastSeen, isNew: entry.firstSeen >= range.from, overdue: status !== "completed" && dueDate !== null && dueDate < asOf }];
  });
}
function periodData(value: Stored, role: Role, source: PeriodSource, range: PeriodRange, compare: PeriodRange | null, today: string): PeriodData {
  const publications = latestPublications(value), reports = periodReports(value, source, publications, range.to), inRange = reports.filter((report) => report.reportDate >= range.from);
  const compareSlice: PeriodSlice | null = compare ? { ...compare, days: periodDays(value, source, publications, compare), facts: periodReports(value, source, publications, compare.to).filter((report) => report.reportDate >= compare.from).map(periodFact) } : null;
  return { role, source, today, ...range, days: periodDays(value, source, publications, range), facts: inRange.map(periodFact), followups: periodFollowups(reports, range, today, new Set(value.followupDismissed ?? [])), issues: periodIssues(inRange), compare: compareSlice };
}
export async function loadPeriod(session: Session, query: { from?: string | null; to?: string | null; compareFrom?: string | null; compareTo?: string | null; source?: string | null }) {
  if (session.role === "department") throw new Error("部门账号暂不开放周报、月报和数据统计。");
  const range = periodRange(query.from, query.to), compare = query.compareFrom || query.compareTo ? periodRange(query.compareFrom, query.compareTo) : null;
  return periodData(await state(), session.role, session.role === "admin" && query.source !== "published" ? "live" : "published", range, compare, todayShanghai());
}

type ExcelCell = string | number | null | undefined;
type ExcelSheet = { name: string; rows: ExcelCell[][]; styles?: Record<number, "title" | "head"> };
function excelWorkbook(sheets: ExcelSheet[]) {
  const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const cell = (item: ExcelCell, style?: string) => { const attr = style ? ` ss:StyleID="${style}"` : ""; if (item == null || item === "") return `<Cell${attr}/>`; return typeof item === "number" && Number.isFinite(item) ? `<Cell${attr}><Data ss:Type="Number">${item}</Data></Cell>` : `<Cell${attr}><Data ss:Type="String">${escape(String(item))}</Data></Cell>`; };
  return `\uFEFF<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Styles><Style ss:ID="title"><Font ss:Bold="1" ss:Size="14"/></Style><Style ss:ID="head"><Font ss:Bold="1"/><Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/></Style></Styles>${sheets.map((sheet) => `<Worksheet ss:Name="${escape(sheet.name)}"><Table>${sheet.rows.map((row, index) => `<Row>${row.map((item) => cell(item, sheet.styles?.[index])).join("")}</Row>`).join("")}</Table></Worksheet>`).join("")}</Workbook>`;
}
export type ExportQuery = { kind: "week" | "month" | "range"; from: string; to: string; compareFrom?: string; compareTo?: string; project?: string | null; departmentId?: string | null; source?: string | null };
const EXPORT_TITLE = { week: "工作周报", month: "工作月报", range: "数据统计" };
const COMPARE_LABEL = { week: "上周", month: "上月", range: "上期" };
/** 周报/月报/统计 Excel：汇总、每日、部门、跟进事项、异常与日报明细共用页面上的同一套汇总函数；部门账号只能导出本部门 */
export async function exportPeriodExcel(session: Session, query: ExportQuery) {
  const range = periodRange(query.from, query.to), compare = query.compareFrom && query.compareTo ? periodRange(query.compareFrom, query.compareTo) : null;
  const value = await state(), today = todayShanghai(), ownDepartment = session.role === "department" ? departmentById(session.departmentId) : null;
  if (session.role === "department" && !ownDepartment) throw new Error("部门不正确。");
  const source: PeriodSource = session.role === "client" ? "published" : query.source === "published" ? "published" : "live", published = source === "published";
  const project = ownDepartment?.project ?? (PROJECTS.some((item) => item === query.project) ? String(query.project) : "全部");
  const departmentId = ownDepartment?.id ?? (departmentById(query.departmentId) ? String(query.departmentId) : "all");
  const departments = scopeDepartments(project, departmentId), ids = new Set(departments.map((department) => department.id)), nameOf = (id: string) => departmentById(id)?.name ?? id;
  const data = periodData(value, session.role, source, range, compare, today), summary = summarizePeriod(data, departments), previous = data.compare ? summarizePeriod(data.compare, departments) : null;
  const followups = sortFollowups(data.followups.filter((item) => ids.has(item.departmentId))), stats = followupStats(followups), statusText = (status: string) => FOLLOWUP_STATUSES.find((item) => item.value === status)?.label ?? status;
  const kpiCells = (kpis: Kpis | null, stock = true): ExcelCell[] => (kpis ? [kpis.workItems, kpis.completedItems, kpis.completionRate, kpis.newRepairs, kpis.completedRepairs, kpis.abnormal, stock ? kpis.open : null, stock ? kpis.overdue : null, kpis.service.express, kpis.service.meetings, kpis.service.participants, kpis.service.water, kpis.service.patrol, kpis.service.disinfect, kpis.service.garbage] : Array(15).fill(null));

  const overview: ExcelCell[][] = [
    [`新浪启皓、五栋物业${EXPORT_TITLE[query.kind]}`],
    ["统计区间", `${formatChineseDate(range.from)} 至 ${formatChineseDate(range.to)}`], ["统计口径", SOURCE_LABEL[source]], ["统计范围", scopeLabel(project, departmentId)],
    ["导出时间", new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(new Date())], [],
    ["概况", "数值", "说明"],
    ["发布天数", summary.publishedDays, `期间共 ${summary.dayCount} 天${summary.staleDays ? `，其中 ${summary.staleDays} 天发布后有更新、尚未重新发布` : ""}`],
    ["有数据天数", summary.dataDays, "日均 = 合计 ÷ 有数据天数"],
    [published ? "部门日报纳入发布" : "部门日报已提交", summary.coverage.submitted, `应报 ${summary.coverage.expected}（有日报的 ${summary.activeDays} 天 × ${departments.length} 个部门），覆盖率 ${percent(summary.coverage.submitted, summary.coverage.expected) ?? "--"}%`],
    ...(published ? [] : [["部门日报已审核", summary.coverage.approved, `待审核 ${summary.coverage.pending}，已退回 ${summary.coverage.returned}，草稿 ${summary.coverage.draft}，未提交 ${summary.coverage.missing}`]]),
    ["跟进事项（按事项去重）", stats.total, `本期新增 ${stats.isNew}，本期已完成 ${stats.completed}，其中异常/风险 ${stats.abnormal}`],
    [`期末未闭环（截至${formatChineseDate(range.to < today ? range.to : today)}）`, stats.open, `其中逾期 ${stats.overdue}`], [],
  ];
  const metricHead = overview.length;
  overview.push(["指标", "合计", "单位", "日均", ...(previous ? [COMPARE_LABEL[query.kind], "变化", "变化率(%)"] : [])]);
  for (const metric of PERIOD_METRICS) {
    const current = metric.value(summary.totals), before = previous?.dataDays ? metric.value(previous.totals) : null, delta = change(current, before);
    overview.push([metric.label, current, metric.unit, metric.rate ? null : average(current, summary.dataDays), ...(previous ? [previous.dataDays ? before : "无数据", delta?.diff ?? null, metric.rate ? null : delta?.pct ?? null] : [])]);
  }
  const dailyHead = ["日期", "星期", "发布状态", "纳入日报(份)", "工作项", "完成工作", "闭环率(%)", "新增报修", "完成维修", "异常", "未闭环(当日)", "逾期(当日)", "快递(件)", "会议(场)", "参会(人)", "水桶(桶)", "巡检(次)", "消毒(次)", "垃圾清运(次)"];
  const daily: ExcelCell[][] = [dailyHead, ...summary.byDay.map(({ day, reports, kpis }) => [day.date, weekdayLabel(day.date), day.published ? (day.stale ? "已发布（有更新未重新发布）" : "已发布") : "未发布", reports, ...kpiCells(kpis)]), ["合计", "", "", summary.byDay.reduce((sum, item) => sum + item.reports, 0), ...kpiCells(summary.totals, false)]];
  const departmentHead = ["项目", "部门", "纳入日报(份)", "应报(天)", published ? "纳入发布(天)" : "已提交(天)", ...(published ? [] : ["已审核(天)", "待审核(天)"]), "未提交(天)", "工作项", "完成工作", "闭环率(%)", "新增报修", "完成维修", "异常", "主要数量"];
  const departmentRows: ExcelCell[][] = [departmentHead, ...summary.byDepartment.map((item) => [item.department.project, item.department.name, item.reports, item.coverage.expected, item.coverage.submitted, ...(published ? [] : [item.coverage.approved, item.coverage.pending]), item.coverage.expected - item.coverage.submitted, ...kpiCells(item.kpis).slice(0, 6), item.department.metrics.filter((metric) => item.metrics[metric.key]).map((metric) => `${metric.label}${item.metrics[metric.key]}${metric.unit ?? ""}`).join("；")])];
  const metricRows: ExcelCell[][] = [["项目", "部门", "指标", "合计", "单位", "日均"], ...summary.byDepartment.flatMap((item) => item.department.metrics.filter((metric) => metric.type !== "status").map((metric) => [item.department.project, item.department.name, metric.label, item.metrics[metric.key] ?? 0, metric.unit ?? "", average(item.metrics[metric.key] ?? 0, item.reports)]))];
  const followupRows: ExcelCell[][] = [["部门", "类型", "类别", "事项内容", "状态", "异常/风险", "责任人", "截止日期", "完成日期", "首次出现", "期间最后更新", "本期新增", "逾期"], ...followups.map((item) => [nameOf(item.departmentId), item.kind === "key" ? "重点" : "跟进", item.category, item.content, statusText(item.status), item.isAbnormal ? "是" : "", item.responsiblePerson, item.dueDate, item.completedDate, item.firstSeen, item.lastSeen, item.isNew ? "是" : "", item.overdue ? "是" : ""])];
  const issueRows: ExcelCell[][] = [["日期", "部门", "类别", "事项", "情况"], ...data.issues.filter((item) => ids.has(item.departmentId)).map((item) => [item.date, nameOf(item.departmentId), item.kind === "routine" ? "固定工作" : "数量异常", item.label, item.value]), ...followups.filter((item) => item.isAbnormal).map((item) => [item.firstSeen, nameOf(item.departmentId), "异常跟进事项", item.content, statusText(item.status)])];
  const detailSource: Array<Record<string, any>> = published
    ? [...latestPublications(value).values()].filter((item) => item.reportDate >= range.from && item.reportDate <= range.to).sort((a, b) => a.reportDate.localeCompare(b.reportDate)).flatMap((item) => item.snapshot.reports.map((report: Record<string, any>) => ({ ...report, reportDate: item.reportDate })))
    : Object.values(value.reports).filter((item) => item.reportDate >= range.from && item.reportDate <= range.to).sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.departmentId.localeCompare(b.departmentId)).map(publicReport);
  const detailRows: ExcelCell[][] = [["日期", "项目", "部门", "填报人", "状态", "固定工作", "非固定工作", "待跟进及重点工作", "纳入统计"], ...detailSource.filter((report) => ids.has(report.departmentId)).map((report) => [report.reportDate, departmentById(report.departmentId)?.project ?? "", nameOf(report.departmentId), report.reporterName ?? "", REPORT_STATUS_LABEL[report.status] ?? report.status, report.summary ?? "", report.notes ?? "", (report.followups ?? []).map((item: Record<string, any>) => item.content).join("；"), (published ? report.status !== "missing" : report.status === "approved") ? "是" : "否"])];
  const fileName = query.kind === "month" ? `物业月报_${range.from.slice(0, 7)}.xls` : query.kind === "week" ? `物业周报_${range.from}至${range.to}.xls` : `物业数据统计_${range.from}至${range.to}.xls`;
  const head: ExcelSheet["styles"] = { 0: "head" };
  return { fileName, content: excelWorkbook([
    { name: "汇总", rows: overview, styles: { 0: "title", 6: "head", [metricHead]: "head" } },
    { name: "每日数据", rows: daily, styles: head }, { name: "部门汇总", rows: departmentRows, styles: head }, { name: "部门指标", rows: metricRows, styles: head },
    { name: "跟进事项", rows: followupRows, styles: head }, { name: "异常记录", rows: issueRows, styles: head }, { name: "日报明细", rows: detailRows, styles: head },
  ]) };
}
