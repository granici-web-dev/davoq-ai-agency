/** Лимиты плана (§7). Живут в коде: тарифы меняются чаще, чем схема. */
export interface PlanLimits {
  maxDocuments: number;
  maxTotalBytes: number;
  maxChunks: number;
}

const PLANS: Record<string, PlanLimits> = {
  starter:  { maxDocuments: 10,  maxTotalBytes: 20 * 1024 * 1024,  maxChunks: 2_000 },
  pro:      { maxDocuments: 50,  maxTotalBytes: 100 * 1024 * 1024, maxChunks: 10_000 },
  business: { maxDocuments: 200, maxTotalBytes: 500 * 1024 * 1024, maxChunks: 50_000 },
};

export const limitsFor = (plan: string): PlanLimits => PLANS[plan] ?? PLANS.starter!;
