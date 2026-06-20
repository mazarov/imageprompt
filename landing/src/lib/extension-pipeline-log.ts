/**
 * Structured extension analyze/remix logs; grep `[extension.pipeline]` in Dockhost/server stdout.
 * Analyze detail: see extension-analyze-log.ts (analyzeRequestId correlates start → request → response).
 */
export function extensionLog(step: string, fields: Record<string, unknown>): void {
  console.warn("[extension.pipeline]", { step, ...fields });
}
