export interface AiUsageConfig { interestAnalysisDailyLimit: number | null; }

export function aiUsageConfig(): AiUsageConfig {
  if (process.env.NODE_ENV !== "production" || process.env.MISHIRU_UNLIMITED_AI === "true") return { interestAnalysisDailyLimit: null };
  const configured = Number(process.env.MISHIRU_INTEREST_DAILY_LIMIT || "1");
  return { interestAnalysisDailyLimit: Number.isFinite(configured) && configured >= 0 ? configured : 1 };
}
