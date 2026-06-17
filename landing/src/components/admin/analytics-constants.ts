export const CLIENT_SOURCE_LABELS: Record<string, string> = {
  site: "Site",
  embed_stv: "Web embed STV",
  extension_stv: "Extension STV",
  extension_lite: "Extension Lite",
  promptshot: "PromptShot",
  unknown: "Unknown",
};

export const CLIENT_SOURCE_COLORS: Record<string, string> = {
  site: "#6366f1",
  embed_stv: "#8b5cf6",
  extension_stv: "#22c55e",
  extension_lite: "#14b8a6",
  promptshot: "#f59e0b",
  unknown: "#71717a",
};

export const CLIENT_SOURCES_ORDER = [
  "site",
  "embed_stv",
  "extension_stv",
  "extension_lite",
  "promptshot",
  "unknown",
] as const;

export function clientSourceLabel(source: string): string {
  return CLIENT_SOURCE_LABELS[source] ?? source;
}

export function clientSourceColor(source: string): string {
  return CLIENT_SOURCE_COLORS[source] ?? "#71717a";
}
