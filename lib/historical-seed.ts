/** 公开仓库不包含真实运营日报。默认种子为空，首次启动不会写入工作簿内容。 */
export type HistoricalReport = {
  reportDate: string;
  departmentId: string;
  reporterName: string;
  routineStatus: string;
  notes?: string;
  reviewComment?: string;
  metrics: Record<string, string | number | null>;
};

export type HistoricalFollowup = {
  reportDate: string;
  departmentId: string;
  category: string;
  content: string;
  quantity: number | null;
  unit: string;
  status: string;
  responsiblePerson: string;
  dueDate: string | null;
  completedDate: string | null;
  isAbnormal: boolean;
  notes: string;
  sourceStatus: string;
};

export type HistoricalSeed = { reports: HistoricalReport[]; followups: HistoricalFollowup[] };

export const HISTORICAL_SEED: HistoricalSeed = { reports: [], followups: [] };

/** 仅当环境变量 DEMO_SEED=true 且存储尚未初始化时写入。内容是虚构示例。 */
export const DEMO_SEED: HistoricalSeed = {
  reports: [
    {
      reportDate: "2026-01-06",
      departmentId: "qh_customer",
      reporterName: "演示填报人",
      routineStatus: "normal",
      notes: "这是公开仓库自带的虚构示例，不代表任何真实运营记录。",
      reviewComment: "示例数据",
      metrics: { inspect: "done", system: "done", photos: "done", expressSend: 2, expressReceive: 1, meetings: 1, participants: 6, abnormal: 0 },
    },
  ],
  followups: [
    {
      reportDate: "2026-01-06",
      departmentId: "qh_customer",
      category: "其他",
      content: "示例跟进：虚构事项，可删除",
      quantity: null,
      unit: "",
      status: "in_progress",
      responsiblePerson: "演示责任人",
      dueDate: "2026-01-10",
      completedDate: null,
      isAbnormal: false,
      notes: "虚构示例",
      sourceStatus: "跟进中",
    },
  ],
};
