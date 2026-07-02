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

/** Log full remix instruction + raw Gemini text. Default off — enable on Dockhost when debugging. */
export function shouldLogExtensionRemixFull(): boolean {
  return parseBooleanConfig(process.env.EXTENSION_REMIX_LOG_FULL, false);
}

/** Always log redacted Gemini request JSON. Default on. */
export function shouldLogExtensionRemixRequestBody(): boolean {
  return parseBooleanConfig(process.env.EXTENSION_REMIX_LOG_REQUEST_BODY, true);
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

export type RemixMode = "section" | "auto" | "legacy";

export function logExtensionRemixStart(fields: {
  remixRequestId: string;
  mode: RemixMode;
  style: string;
  locale: string;
  changeRequest: string;
  originalPromptChars: number;
  sectionLabel?: string;
  sectionTextChars?: number;
}): void {
  extensionLog("remix.start", {
    remixRequestId: fields.remixRequestId,
    mode: fields.mode,
    style: fields.style,
    locale: fields.locale,
    changeRequestChars: fields.changeRequest.length,
    changeRequestPreview: fields.changeRequest.slice(0, 240),
    originalPromptChars: fields.originalPromptChars,
    ...(fields.sectionLabel ? { sectionLabel: fields.sectionLabel } : {}),
    ...(typeof fields.sectionTextChars === "number"
      ? { sectionTextChars: fields.sectionTextChars }
      : {}),
  });
}

export function logExtensionRemixClassifierRequest(fields: {
  remixRequestId: string;
  mode: RemixMode;
  style: string;
  locale: string;
  model: string;
  endpointHost: string;
  viaProxy: boolean;
  instruction: string;
  availableLabels: string[];
  generationConfig: Record<string, unknown>;
  geminiBody: unknown;
}): void {
  const { head: instructionHead, tail: instructionTail } = textHeadTail(fields.instruction);

  extensionLog("remix.classifier_request", {
    remixRequestId: fields.remixRequestId,
    mode: fields.mode,
    style: fields.style,
    locale: fields.locale,
    model: fields.model,
    endpointHost: fields.endpointHost,
    viaProxy: fields.viaProxy,
    availableLabels: fields.availableLabels,
    instructionChars: fields.instruction.length,
    instructionHead,
    ...(instructionTail ? { instructionTail } : {}),
    generationConfig: fields.generationConfig,
  });

  if (shouldLogExtensionRemixRequestBody()) {
    extensionLog("remix.classifier_request_body_redacted", {
      remixRequestId: fields.remixRequestId,
      body: redactGenerateContentBody(fields.geminiBody),
    });
  }

  if (shouldLogExtensionRemixFull()) {
    extensionLog("remix.classifier_request_instruction_full", {
      remixRequestId: fields.remixRequestId,
      instruction: fields.instruction,
    });
  }
}

export function logExtensionRemixClassifierResponse(fields: {
  remixRequestId: string;
  mode: RemixMode;
  style: string;
  locale: string;
  model: string;
  httpStatus: number;
  latencyMs: number;
  geminiData: unknown;
  rawText: string;
  labels: string[];
  labelsParseFailed?: boolean;
}): void {
  const responseSummary = summarizeGeminiApiResponse(fields.geminiData);
  const { head: rawTextHead, tail: rawTextTail } = textHeadTail(fields.rawText);

  extensionLog("remix.classifier_response", {
    remixRequestId: fields.remixRequestId,
    mode: fields.mode,
    style: fields.style,
    locale: fields.locale,
    model: fields.model,
    httpStatus: fields.httpStatus,
    latencyMs: fields.latencyMs,
    usageMetadata: extractUsageMetadata(fields.geminiData),
    rawTextChars: fields.rawText.length,
    rawTextHead,
    ...(rawTextTail ? { rawTextTail } : {}),
    labels: fields.labels,
    labelsCount: fields.labels.length,
    labelsParseFailed: fields.labelsParseFailed ?? false,
    ...responseSummary,
  });

  if (shouldLogExtensionRemixFull()) {
    extensionLog("remix.classifier_response_text_full", {
      remixRequestId: fields.remixRequestId,
      rawText: fields.rawText,
      labels: fields.labels,
      geminiData: fields.geminiData,
    });
  }
}

export function logExtensionRemixGeminiRequest(fields: {
  remixRequestId: string;
  mode: RemixMode;
  style: string;
  locale: string;
  model: string;
  endpointHost: string;
  viaProxy: boolean;
  instruction: string;
  generationConfig: Record<string, unknown>;
  geminiBody: unknown;
  step?: "rewriter" | "single";
  selectedLabels?: string[];
}): void {
  const { head: instructionHead, tail: instructionTail } = textHeadTail(fields.instruction);

  extensionLog("remix.gemini_request", {
    remixRequestId: fields.remixRequestId,
    step: fields.step ?? "single",
    ...(fields.selectedLabels ? { selectedLabels: fields.selectedLabels } : {}),
    mode: fields.mode,
    style: fields.style,
    locale: fields.locale,
    model: fields.model,
    endpointHost: fields.endpointHost,
    viaProxy: fields.viaProxy,
    instructionChars: fields.instruction.length,
    instructionHead,
    ...(instructionTail ? { instructionTail } : {}),
    generationConfig: fields.generationConfig,
  });

  if (shouldLogExtensionRemixRequestBody()) {
    extensionLog("remix.gemini_request_body_redacted", {
      remixRequestId: fields.remixRequestId,
      body: redactGenerateContentBody(fields.geminiBody),
    });
  }

  if (shouldLogExtensionRemixFull()) {
    extensionLog("remix.gemini_request_instruction_full", {
      remixRequestId: fields.remixRequestId,
      instruction: fields.instruction,
    });
  }
}

export function logExtensionRemixGeminiResponse(fields: {
  remixRequestId: string;
  mode: RemixMode;
  style: string;
  locale: string;
  model: string;
  httpStatus: number;
  latencyMs: number;
  geminiData: unknown;
  rawText: string;
  autoChanges?: Array<{ label: string; text: string }>;
  autoChangesParseFailed?: boolean;
}): void {
  const responseSummary = summarizeGeminiApiResponse(fields.geminiData);
  const { head: rawTextHead, tail: rawTextTail } = textHeadTail(fields.rawText);

  extensionLog("remix.gemini_response", {
    remixRequestId: fields.remixRequestId,
    mode: fields.mode,
    style: fields.style,
    locale: fields.locale,
    model: fields.model,
    httpStatus: fields.httpStatus,
    latencyMs: fields.latencyMs,
    usageMetadata: extractUsageMetadata(fields.geminiData),
    rawTextChars: fields.rawText.length,
    rawTextHead,
    ...(rawTextTail ? { rawTextTail } : {}),
    ...(fields.mode === "auto"
      ? {
          autoChangesCount: fields.autoChanges?.length ?? 0,
          autoChangesLabels: fields.autoChanges?.map((c) => c.label) ?? [],
          autoChangesParseFailed: fields.autoChangesParseFailed ?? false,
        }
      : {}),
    ...responseSummary,
  });

  if (shouldLogExtensionRemixFull()) {
    extensionLog("remix.gemini_response_text_full", {
      remixRequestId: fields.remixRequestId,
      rawText: fields.rawText,
      ...(fields.autoChanges ? { autoChanges: fields.autoChanges } : {}),
      geminiData: fields.geminiData,
    });
  }
}
