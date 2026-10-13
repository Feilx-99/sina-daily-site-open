import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const accessCodes = sqliteTable("access_codes", {
  id: text("id").primaryKey(), label: text("label").notNull(), role: text("role").notNull(), departmentId: text("department_id"),
  lookupHash: text("lookup_hash").notNull(), salt: text("salt").notNull(), codeHash: text("code_hash").notNull(), active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("uidx_access_codes_lookup_hash").on(table.lookupHash)]);
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(), accessId: text("access_id").notNull(), role: text("role").notNull(), departmentId: text("department_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), expiresAt: text("expires_at").notNull(),
}, (table) => [index("idx_sessions_expires_at").on(table.expiresAt)]);
export const loginAttempts = sqliteTable("login_attempts", {
  ipHash: text("ip_hash").primaryKey(), failureCount: integer("failure_count").notNull().default(0),
  windowStartedAt: text("window_started_at").notNull(), lockedUntil: text("locked_until"),
});
export const dailyReports = sqliteTable("daily_reports", {
  id: text("id").primaryKey(), reportDate: text("report_date").notNull(), departmentId: text("department_id").notNull(),
  reporterName: text("reporter_name").notNull(), routineStatus: text("routine_status").notNull(), status: text("status").notNull().default("draft"),
  notes: text("notes").notNull().default(""), reviewComment: text("review_comment").notNull().default(""),
  confirmedZero: integer("confirmed_zero", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  submittedAt: text("submitted_at"), approvedAt: text("approved_at"),
}, (table) => [uniqueIndex("uidx_daily_reports_date_department").on(table.reportDate, table.departmentId), index("idx_daily_reports_date_status").on(table.reportDate, table.status)]);
export const dailyMetrics = sqliteTable("daily_metrics", {
  id: integer("id").primaryKey({ autoIncrement: true }), reportId: text("report_id").notNull(), metricKey: text("metric_key").notNull(),
  numericValue: real("numeric_value"), textValue: text("text_value"),
}, (table) => [uniqueIndex("uidx_daily_metrics_report_key").on(table.reportId, table.metricKey), index("idx_daily_metrics_report").on(table.reportId)]);
export const followups = sqliteTable("followups", {
  id: text("id").primaryKey(), reportId: text("report_id"), sourceId: text("source_id"), reportDate: text("report_date").notNull(),
  departmentId: text("department_id").notNull(), category: text("category").notNull(), content: text("content").notNull(), quantity: real("quantity"),
  unit: text("unit").notNull().default(""), status: text("status").notNull(), responsiblePerson: text("responsible_person").notNull().default(""),
  dueDate: text("due_date"), completedDate: text("completed_date"), isAbnormal: integer("is_abnormal", { mode: "boolean" }).notNull().default(false),
  notes: text("notes").notNull().default(""), sourceStatus: text("source_status").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_followups_date_department").on(table.reportDate, table.departmentId), index("idx_followups_status_due").on(table.status, table.dueDate)]);
export const photos = sqliteTable("photos", {
  id: text("id").primaryKey(), reportId: text("report_id").notNull(), objectKey: text("object_key").notNull(), fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(), sizeBytes: integer("size_bytes").notNull(), caption: text("caption").notNull().default(""),
  displayOrder: integer("display_order").notNull().default(0), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("idx_photos_report").on(table.reportId)]);
export const publications = sqliteTable("publications", {
  id: text("id").primaryKey(), reportDate: text("report_date").notNull(), version: integer("version").notNull(), snapshotJson: text("snapshot_json").notNull(),
  publishedAt: text("published_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("uidx_publications_date_version").on(table.reportDate, table.version), index("idx_publications_date").on(table.reportDate)]);
export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }), action: text("action").notNull(), role: text("role").notNull(),
  departmentId: text("department_id"), targetId: text("target_id"), detail: text("detail").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const historyItems = sqliteTable("history_items", {
  id: integer("id").primaryKey({ autoIncrement: true }), reportDate: text("report_date").notNull(), departmentId: text("department_id").notNull(),
  sequence: integer("sequence").notNull(), content: text("content").notNull(), category: text("category").notNull(), sourceStatus: text("source_status").notNull(),
}, (table) => [index("idx_history_items_date_department").on(table.reportDate, table.departmentId)]);
export const systemMeta = sqliteTable("system_meta", {
  key: text("key").primaryKey(), value: text("value").notNull(), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
