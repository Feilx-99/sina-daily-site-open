import PptxGenJS from "pptxgenjs";
import { requireSession, snapshotForExport } from "@/lib/server/store";
import { countRoutineWork, departmentById, formatChineseDate, splitWorkLines } from "@/lib/domain";

const FONT = "Microsoft YaHei";
const RED = "C40000";
const DARK = "0F172A";
const SLATE = "334155";
const GRAY = "64748B";
const LIGHT = "F1F5F9";
const GROUP_HEX = ["065F46", "075985", "92400E", "5B21B6", "115E59", "9F1239", "3730A3", "9A3412", "155E75", "3F6212", "86198F", "166534"];
const STATUS_TEXT: Record<string, string> = { done: "已执行", abnormal: "异常", not_done: "未执行" };
const FOLLOWUP_STATUS: Record<string, string> = { not_started: "未开始", in_progress: "跟进中", completed: "完成", paused: "暂停" };
const REPORT_STATUS: Record<string, string> = { draft: "草稿", submitted: "待审核", returned: "已退回", approved: "已审核", missing: "未提交" };

type Cell = { text: string; options?: Record<string, unknown> };
const BORDER = { pt: 0.75, color: "CBD5E1" };

/** 根据内容行数选择行高和字号，让每页尽量饱满又不溢出 */
function density(rows: number, steps: Array<[number, number, number]>) {
  for (const [max, rowH, fontSize] of steps) if (rows <= max) return { rowH, fontSize };
  return { rowH: steps[steps.length - 1][1], fontSize: steps[steps.length - 1][2] };
}

function slideHeader(slide: PptxGenJS.Slide, title: string, sub: string) {
  slide.background = { color: "FFFFFF" };
  slide.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.1, fill: { color: RED } });
  slide.addText([
    { text: title, options: { bold: true, fontSize: 21, color: DARK } },
    { text: `   ${sub}`, options: { fontSize: 12, color: GRAY } },
  ], { x: 0.6, y: 0.28, w: 12.1, fontFace: FONT });
}

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const url = new URL(request.url);
    const reportDate = url.searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new Error("日期不正确。");
    const snapshot = await snapshotForExport(session, reportDate);
    if (!snapshot) throw new Error("该日期暂无已发布日报。");

    const pptx = new PptxGenJS();
    pptx.defineLayout({ name: "W", width: 13.33, height: 7.5 });
    pptx.layout = "W";
    const kpis: any = snapshot.kpis ?? {};
    const service: any = kpis.service ?? {};

    // ── 封面 ──────────────────────────────
    const cover = pptx.addSlide();
    cover.background = { color: DARK };
    cover.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: RED } });
    cover.addText("新浪启皓、五栋物业服务", { x: 0.8, y: 0.7, w: 11.7, fontFace: FONT, fontSize: 16, bold: true, color: "FCA5A5" });
    cover.addText(`${formatChineseDate(reportDate)} 工作日报`, { x: 0.8, y: 1.15, w: 11.7, fontFace: FONT, fontSize: 38, bold: true, color: "FFFFFF" });
    const kpiRows: Cell[][] = [
      [{ text: "指标", options: { bold: true, color: "FCA5A5", fill: { color: "1E293B" } } }, { text: "数值", options: { bold: true, color: "FCA5A5", fill: { color: "1E293B" }, align: "center" } }],
      [{ text: "今日工作（固定 · 跟进 · 非固定）", options: { color: "CBD5E1", fill: { color: "1E293B" } } }, { text: `${kpis.workItems ?? 0} 项（${kpis.routineCount ?? 0} · ${kpis.followupCount ?? 0} · ${kpis.notesCount ?? 0}）`, options: { bold: true, color: "FFFFFF", fill: { color: "1E293B" }, align: "center" } }],
      [{ text: "完成工作", options: { color: "CBD5E1", fill: { color: "1E293B" } } }, { text: `${kpis.completedItems ?? 0} 项`, options: { bold: true, color: "6EE7B7", fill: { color: "1E293B" }, align: "center" } }],
      [{ text: "工作闭环率", options: { color: "CBD5E1", fill: { color: "1E293B" } } }, { text: kpis.completionRate == null ? "--" : `${kpis.completionRate}%`, options: { bold: true, color: "6EE7B7", fill: { color: "1E293B" }, align: "center" } }],
      [{ text: "未闭环 / 异常 / 逾期", options: { color: "CBD5E1", fill: { color: "1E293B" } } }, { text: `${kpis.open ?? 0} / ${kpis.abnormal ?? 0} / ${kpis.overdue ?? 0} 项`, options: { bold: true, color: (kpis.open ?? 0) > 0 || (kpis.abnormal ?? 0) > 0 ? "FCA5A5" : "FFFFFF", fill: { color: "1E293B" }, align: "center" } }],
    ];
    cover.addTable(kpiRows, { x: 0.8, y: 2.75, w: 6.4, colW: [3.4, 3.0], rowH: 0.52, fontFace: FONT, fontSize: 13, border: { pt: 0.75, color: SLATE }, valign: "middle", margin: 0.08 });
    const serviceHead = ["快递(件)", "会议(场)", "参会(人)", "水桶(桶)", "巡检(次)", "消毒(次)", "垃圾(次)"];
    const serviceValues = [service.express ?? 0, service.meetings ?? 0, service.participants ?? 0, service.water ?? 0, service.patrol ?? 0, service.disinfect ?? 0, service.garbage ?? 0];
    const serviceRows: Cell[][] = [
      [{ text: "主要服务数量", options: { colspan: 7, bold: true, color: "FCA5A5", fill: { color: "1E293B" }, align: "center" } }],
      serviceHead.map((label) => ({ text: label, options: { color: "CBD5E1", fill: { color: "1E293B" }, align: "center" } })),
      serviceValues.map((value) => ({ text: String(value), options: { bold: true, fontSize: 18, color: "FFFFFF", fill: { color: "1E293B" }, align: "center" } })),
    ];
    cover.addTable(serviceRows, { x: 7.5, y: 2.75, w: 5.05, colW: [0.73, 0.73, 0.73, 0.73, 0.73, 0.7, 0.7], rowH: [0.52, 0.52, 0.72], fontFace: FONT, fontSize: 10.5, border: { pt: 0.75, color: SLATE }, valign: "middle", margin: 0.04 });
    cover.addText("由物业日报系统导出，全部内容可在 PPT 中直接编辑", { x: 0.8, y: 6.75, w: 11.7, fontFace: FONT, fontSize: 11, color: GRAY });

    // ── 每部门两页：A 固定+非固定，B 待跟进+小结 ──────────
    for (const report of snapshot.reports as any[]) {
      const department = departmentById(report.departmentId);
      const deptName = department?.name ?? report.departmentId;
      const sub = `${department?.project ?? ""}项目 · ${REPORT_STATUS[report.status] ?? report.status} · ${formatChineseDate(reportDate)}`;
      const metrics = report.metrics ?? {};

      // A 页
      const slideA = pptx.addSlide();
      slideHeader(slideA, `${deptName} · 固定工作与非固定工作`, sub);
      if (report.status === "missing") {
        slideA.addText("该部门尚未提交日报。", { x: 0.6, y: 1.4, w: 12.1, fontFace: FONT, fontSize: 16, color: GRAY });
      } else {
        const groupColors = new Map<string, string>();
        for (const metric of department?.metrics ?? []) if (metric.workGroup && !groupColors.has(metric.workGroup)) groupColors.set(metric.workGroup, GROUP_HEX[groupColors.size % GROUP_HEX.length]);
        const tags: Array<{ label: string; text: string; color: string }> = [];
        for (const metric of department?.metrics ?? []) {
          if (metric.type === "status") {
            const value = String(metrics[metric.key] ?? "done");
            tags.push({ label: metric.label, text: STATUS_TEXT[value] ?? value, color: metric.workGroup ? groupColors.get(metric.workGroup)! : GRAY });
          } else if (Number(metrics[metric.key] ?? 0) > 0) {
            tags.push({ label: metric.label, text: `${metrics[metric.key]}${metric.unit ?? ""}`, color: metric.workGroup ? groupColors.get(metric.workGroup)! : GRAY });
          }
        }
        const routine = department ? countRoutineWork(department, metrics) : { total: 0, done: 0 };
        const notesLines = splitWorkLines(String(report.notes ?? ""));
        const fixedRows = Math.max(1, Math.ceil(tags.length / 2));
        const { rowH, fontSize } = density(fixedRows + Math.max(1, notesLines.length), [[6, 0.62, 13], [8, 0.55, 12.5], [11, 0.48, 12], [14, 0.42, 11.5], [20, 0.34, 10.5], [999, 0.28, 9.5]]);

        const fixedTable: Cell[][] = [[{ text: `一、固定工作（${routine.total} 项计入今日工作 · 标签同色=合并计 1 项 · 灰色=不计入）`, options: { colspan: 4, bold: true, color: "FFFFFF", fill: { color: DARK } } }]];
        for (let row = 0; row < fixedRows; row++) {
          const a = tags[row * 2], b = tags[row * 2 + 1];
          const cells: Cell[] = a
            ? [{ text: a.label, options: { bold: true, color: a.color, fill: { color: LIGHT } } }, { text: a.text, options: { color: DARK, align: "center" } }]
            : [{ text: "", options: {} }, { text: "", options: {} }];
          if (b) cells.push({ text: b.label, options: { bold: true, color: b.color, fill: { color: LIGHT } } }, { text: b.text, options: { color: DARK, align: "center" } });
          else cells.push({ text: "", options: {} }, { text: "", options: {} });
          fixedTable.push(cells);
        }
        const fixedH = (fixedRows + 1) * rowH;
        const notesH = (Math.max(1, notesLines.length) + 1) * rowH;
        const aTop = 1.15 + Math.max(0, (5.6 - fixedH - 0.3 - notesH) * 0.4);
        slideA.addTable(fixedTable, { x: 0.6, y: aTop, w: 12.1, colW: [3.6, 2.45, 3.6, 2.45], rowH, fontFace: FONT, fontSize, border: BORDER, valign: "middle", margin: 0.06 });

        const notesY = aTop + fixedH + 0.3;
        const notesTable: Cell[][] = [[{ text: `二、非固定工作（${notesLines.length} 条，计入今日工作）`, options: { colspan: 2, bold: true, color: "FFFFFF", fill: { color: DARK } } }]];
        if (notesLines.length) notesLines.forEach((line, index) => notesTable.push([{ text: String(index + 1), options: { bold: true, color: RED, fill: { color: LIGHT }, align: "center" } }, { text: line, options: { color: DARK } }]));
        else notesTable.push([{ text: "今日无非固定工作", options: { colspan: 2, color: GRAY, align: "center" } }]);
        slideA.addTable(notesTable, { x: 0.6, y: notesY, w: 12.1, colW: [0.9, 11.2], rowH, fontFace: FONT, fontSize, border: BORDER, valign: "middle", margin: 0.06 });
      }

      // B 页
      const slideB = pptx.addSlide();
      slideHeader(slideB, `${deptName} · 待跟进及重点工作`, sub);
      const followups: any[] = report.status === "missing" ? [] : (report.followups ?? []);
      const { rowH: fRowH, fontSize: fFont } = density(Math.max(1, followups.length), [[3, 0.72, 13], [6, 0.6, 12.5], [10, 0.5, 12], [14, 0.42, 11], [18, 0.36, 10.5], [999, 0.3, 9.5]]);
      const followTable: Cell[][] = [[
        { text: `待跟进及重点工作（${followups.length} 条，计入今日工作）`, options: { colspan: 6, bold: true, color: "FFFFFF", fill: { color: DARK } } },
      ], [
        { text: "类型", options: { bold: true, color: DARK, fill: { color: LIGHT }, align: "center" } },
        { text: "类别", options: { bold: true, color: DARK, fill: { color: LIGHT }, align: "center" } },
        { text: "事项内容", options: { bold: true, color: DARK, fill: { color: LIGHT }, align: "center" } },
        { text: "状态", options: { bold: true, color: DARK, fill: { color: LIGHT }, align: "center" } },
        { text: "责任人", options: { bold: true, color: DARK, fill: { color: LIGHT }, align: "center" } },
        { text: "截止/完成", options: { bold: true, color: DARK, fill: { color: LIGHT }, align: "center" } },
      ]];
      if (followups.length) {
        for (const item of followups) {
          const key = item.kind === "key";
          followTable.push([
            { text: `${key ? "重点" : "跟进"}${item.carried ? "·结转" : ""}`, options: { bold: true, color: key ? RED : "0284C7", align: "center" } },
            { text: String(item.category ?? ""), options: { color: DARK, align: "center" } },
            { text: `${item.content ?? ""}${item.isAbnormal ? "（异常/风险）" : ""}`, options: { color: DARK } },
            { text: FOLLOWUP_STATUS[item.status] ?? String(item.status ?? ""), options: { color: item.status === "completed" ? "059669" : DARK, align: "center", bold: item.status === "completed" } },
            { text: String(item.responsiblePerson ?? ""), options: { color: DARK, align: "center" } },
            { text: String(item.status === "completed" ? item.completedDate ?? "" : item.dueDate ?? ""), options: { color: GRAY, align: "center" } },
          ]);
        }
      } else {
        followTable.push([{ text: "今日暂无待跟进或重点工作", options: { colspan: 6, color: GRAY, align: "center" } }]);
      }
      const fTotalRows = (followups.length ? followups.length : 1) + 2;
      const fTop = 1.15 + Math.max(0, (5.5 - fTotalRows * fRowH) * 0.45);
      slideB.addTable(followTable, { x: 0.6, y: fTop, w: 12.1, colW: [1.2, 1.4, 5.5, 1.1, 1.5, 1.4], rowH: fRowH, fontFace: FONT, fontSize: fFont, border: BORDER, valign: "middle", margin: 0.06 });

      if (report.status !== "missing") {
        const routine = department ? countRoutineWork(department, metrics) : { total: 0, done: 0 };
        const notesCount = splitWorkLines(String(report.notes ?? "")).length;
        const openWork = followups.filter((item) => item.status !== "completed").length;
        const totalWork = routine.total + notesCount + followups.length;
        const doneWork = routine.done + notesCount + (followups.length - openWork);
        slideB.addShape("rect", { x: 0.6, y: 6.85, w: 12.1, h: 0.45, fill: { color: LIGHT } });
        slideB.addText(`小结：今日工作 ${totalWork} 项（固定 ${routine.total} · 非固定 ${notesCount} · 跟进 ${followups.length}） · 完成 ${doneWork} 项 · 待跟进 ${openWork} 项`, { x: 0.75, y: 6.85, w: 11.9, h: 0.45, fontFace: FONT, fontSize: 12.5, bold: true, color: DARK, valign: "middle" });
      }
    }

    const buffer = (await pptx.write({ outputType: "nodebuffer" } as any)) as Buffer;
    const fileName = `物业日报_${reportDate}.pptx`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "content-disposition": `attachment; filename="daily-${reportDate}.pptx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导出失败，请稍后重试。";
    return Response.json({ error: message }, { status: message.includes("登录") ? 401 : 400 });
  }
}
