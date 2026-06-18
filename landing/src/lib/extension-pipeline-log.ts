/**
 * Structured extension analyze/remix logs; grep `[extension.pipeline]` in server logs.
 */
export function extensionLog(step: string, fields: Record<string, unknown>): void {
  console.warn("[extension.pipeline]", { step, ...fields });
}
