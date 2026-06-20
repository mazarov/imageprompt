import { SECTION_SPEC_ORDER } from "@/lib/extension-prompt-sections";
import { extensionLog } from "@/lib/extension-pipeline-log";
import { redactGenerateContentBody, summarizeGeminiApiResponse } from "@/lib/gemini-vibe-debug-log";

const PREVIEW_CHARS = 600;
const TAIL_CHARS = 400;

function parseBooleanConfig(value: string | null | undefined, fallback: boolean): boolean {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["true", "1", "yes", "y", "on"].includes(raw)) return true;
  if (["false", "0", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

/** Log full system prompt + model text. Default off — enable on Dockhost when debugging truncation. */
export function shouldLogExtensionAnalyzeFull(): boolean {
  return parseBooleanConfig(process.env.EXTENSION_ANALYZE_LOG_FULL, false);
}

/** Always log redacted Gemini request JSON (no base64). Default on. */
export function shouldLogExtensionAnalyzeRequestBody(): boolean {
  return parseBooleanConfig(process.env.EXTENSION_ANALYZE_LOG_REQUEST_BODY, true);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type AnalyzePromptDiagnostics = {
  style: string;
  rawTextChars: number;
  promptTextChars: number;
  foundSections: string[];
  foundSectionCount: number;
  expectedSectionCount: number;
  missingSections: string[];
  lastSectionFound: string | null;
  lastLinePreview: string;
  endsMidSentence: boolean;
  likelyTruncated: boolean;
  truncationReasons: string[];
};

export function analyzePromptDiagnostics(
  style: string,
  rawText: string,
  finishReason: unknown,
): AnalyzePromptDiagnostics {
  const trimmed = rawText.trim();
  const foundSections: string[] = [];

  if (style === "photoreal") {
    for (const label of SECTION_SPEC_ORDER) {
      const re = new RegExp(`^${escapeRegex(label)}\\s*:`, "im");
      if (re.test(trimmed)) foundSections.push(label);
    }
  }

  const expectedSectionCount = style === "photoreal" ? SECTION_SPEC_ORDER.length : 0;
  const missingSections =
    style === "photoreal"
      ? SECTION_SPEC_ORDER.filter((label) => !foundSections.includes(label))
      : [];

  const lines = trimmed.split(/\r?\n/).filter((line) => line.length > 0);
  const lastLinePreview = (lines.at(-1) ?? "").slice(0, 160);
  const endsMidSentence =
    trimmed.length > 0 && !/[.!?:]["')\]]*\s*$/.test(trimmed) && !/^\s*[-•]\s/.test(lastLinePreview);

  const finishReasonStr = typeof finishReason === "string" ? finishReason : String(finishReason ?? "");
  const truncationReasons: string[] = [];
  if (finishReasonStr === "MAX_TOKENS") truncationReasons.push("finishReason_MAX_TOKENS");
  if (style === "photoreal" && missingSections.length > 0) {
    truncationReasons.push(`missing_sections:${missingSections.join(",")}`);
  }
  if (endsMidSentence) truncationReasons.push("ends_mid_sentence");

  return {
    style,
    rawTextChars: rawText.length,
    promptTextChars: 0,
    foundSections,
    foundSectionCount: foundSections.length,
    expectedSectionCount,
    missingSections,
    lastSectionFound: foundSections.at(-1) ?? null,
    lastLinePreview,
    endsMidSentence,
    likelyTruncated: truncationReasons.length > 0,
    truncationReasons,
  };
}

function textHeadTail(text: string): { head: string; tail?: string } {
  if (text.length <= PREVIEW_CHARS + TAIL_CHARS) {
    return { head: text };
  }
  return {
    head: text.slice(0, PREVIEW_CHARS),
    tail: text.slice(-TAIL_CHARS),
  };
}

function extractUsageMetadata(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  const um = (data as Record<string, unknown>).usageMetadata;
  if (!um || typeof um !== "object") return null;
  const u = um as Record<string, unknown>;
  return {
    promptTokenCount: u.promptTokenCount ?? null,
    candidatesTokenCount: u.candidatesTokenCount ?? null,
    totalTokenCount: u.totalTokenCount ?? null,
    thoughtsTokenCount: u.thoughtsTokenCount ?? null,
    cachedContentTokenCount: u.cachedContentTokenCount ?? null,
  };
}

export function logExtensionAnalyzeStart(fields: {
  analyzeRequestId: string;
  style: string;
  locale: string;
  imageSource: "base64" | "url";
  imageMimeType: string;
  imageBase64Chars: number;
}): void {
  extensionLog("analyze.start", fields);
}

export function logExtensionAnalyzeGeminiRequest(fields: {
  analyzeRequestId: string;
  style: string;
  locale: string;
  model: string;
  endpointHost: string;
  viaProxy: boolean;
  systemPrompt: string;
  imageMimeType: string;
  imageBase64Chars: number;
  generationConfig: Record<string, unknown>;
  geminiBody: unknown;
}): void {
  const { head: systemPromptHead, tail: systemPromptTail } = textHeadTail(fields.systemPrompt);

  extensionLog("analyze.gemini_request", {
    analyzeRequestId: fields.analyzeRequestId,
    style: fields.style,
    locale: fields.locale,
    model: fields.model,
    endpointHost: fields.endpointHost,
    viaProxy: fields.viaProxy,
    systemPromptChars: fields.systemPrompt.length,
    systemPromptHead,
    ...(systemPromptTail ? { systemPromptTail } : {}),
    imageMimeType: fields.imageMimeType,
    imageBase64Chars: fields.imageBase64Chars,
    generationConfig: fields.generationConfig,
  });

  if (shouldLogExtensionAnalyzeRequestBody()) {
    extensionLog("analyze.gemini_request_body_redacted", {
      analyzeRequestId: fields.analyzeRequestId,
      body: redactGenerateContentBody(fields.geminiBody),
    });
  }

  if (shouldLogExtensionAnalyzeFull()) {
    extensionLog("analyze.gemini_request_system_prompt_full", {
      analyzeRequestId: fields.analyzeRequestId,
      systemPrompt: fields.systemPrompt,
    });
  }
}

export function logExtensionAnalyzeGeminiResponse(fields: {
  analyzeRequestId: string;
  style: string;
  locale: string;
  model: string;
  httpStatus: number;
  latencyMs: number;
  geminiData: unknown;
  rawText: string;
  promptText: string;
  criticalRulesAppended: boolean;
}): void {
  const responseSummary = summarizeGeminiApiResponse(fields.geminiData);
  const finishReason = responseSummary.finishReason;
  const diagnostics = analyzePromptDiagnostics(fields.style, fields.rawText, finishReason);
  diagnostics.promptTextChars = fields.promptText.length;

  const { head: rawTextHead, tail: rawTextTail } = textHeadTail(fields.rawText);
  const { head: promptTextHead, tail: promptTextTail } = textHeadTail(fields.promptText);

  extensionLog("analyze.gemini_response", {
    analyzeRequestId: fields.analyzeRequestId,
    style: fields.style,
    locale: fields.locale,
    model: fields.model,
    httpStatus: fields.httpStatus,
    latencyMs: fields.latencyMs,
    usageMetadata: extractUsageMetadata(fields.geminiData),
    rawTextChars: fields.rawText.length,
    promptTextChars: fields.promptText.length,
    criticalRulesAppended: fields.criticalRulesAppended,
    rawTextHead,
    ...(rawTextTail ? { rawTextTail } : {}),
    promptTextHead,
    ...(promptTextTail ? { promptTextTail } : {}),
    diagnostics,
    ...responseSummary,
  });

  if (diagnostics.likelyTruncated) {
    extensionLog("analyze.truncation_suspected", {
      analyzeRequestId: fields.analyzeRequestId,
      ...diagnostics,
      style: fields.style,
      locale: fields.locale,
      finishReason,
      usageMetadata: extractUsageMetadata(fields.geminiData),
      rawText: shouldLogExtensionAnalyzeFull() ? fields.rawText : undefined,
      rawTextHead,
      rawTextTail,
    });
  }

  if (shouldLogExtensionAnalyzeFull()) {
    extensionLog("analyze.gemini_response_text_full", {
      analyzeRequestId: fields.analyzeRequestId,
      rawText: fields.rawText,
      promptText: fields.promptText,
      geminiData: fields.geminiData,
    });
  }
}
