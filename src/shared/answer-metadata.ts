export const MESSAGE_TIME_REQUEST_EVENT = "gpt-toc-peng:message-time-request";
export const MESSAGE_TIME_RESPONSE_EVENT = "gpt-toc-peng:message-time-response";
export const MESSAGE_TIME_READY_EVENT = "gpt-toc-peng:message-time-ready";

export type AnswerMetadata = {
  createdAtMs: number | null;
  prompt: string;
  fullPrompt?: string;
  promptMessageId?: string | null;
  promptTurnIndex?: number | null;
};

export const normalizeMessageTime = (seconds: unknown, now = Date.now()): number | null => {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const milliseconds = Math.round(seconds * 1000);
  return milliseconds >= Date.UTC(2000, 0, 1) && milliseconds <= now + 86_400_000
    ? milliseconds : null;
};

export const normalizePrompt = (text: string): string => {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 240 ? `${normalized.slice(0, 239).trimEnd()}…` : normalized;
};

const twoDigits = (value: number): string => String(value).padStart(2, "0");

export const formatAnswerTime = (createdAtMs: number, nowMs = Date.now()): string => {
  const date = new Date(createdAtMs);
  const today = new Date(nowMs);
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const sameDay = (other: Date): boolean =>
    date.getFullYear() === other.getFullYear() &&
    date.getMonth() === other.getMonth() && date.getDate() === other.getDate();
  const prefix = sameDay(today) ? "今天" : sameDay(yesterday) ? "昨天" :
    `${date.getFullYear()}-${twoDigits(date.getMonth() + 1)}-${twoDigits(date.getDate())}`;
  return `${prefix} ${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
};

export const getAnswerHeaderText = (metadata: AnswerMetadata | undefined): string => {
  const time = metadata?.createdAtMs === null || metadata?.createdAtMs === undefined
    ? "" : formatAnswerTime(metadata.createdAtMs);
  if (time && metadata?.prompt) return `${time} · ${metadata.prompt}`;
  return time || metadata?.prompt || "回答";
};
