import {
  MESSAGE_TIME_READY_EVENT,
  MESSAGE_TIME_REQUEST_EVENT,
  MESSAGE_TIME_RESPONSE_EVENT,
  normalizeMessageTime
} from "../shared/answer-metadata";
import { ASSISTANT_SELECTOR, getMessageId } from "../shared/chatgpt-dom";

type PageMessage = { id?: unknown; create_time?: unknown };
type FiberNode = {
  memoizedProps?: unknown;
  pendingProps?: unknown;
  return?: FiberNode | null;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? value as Record<string, unknown> : null;

const messageFromProps = (value: unknown, id: string): PageMessage | null => {
  const props = asRecord(value);
  if (!props) return null;
  const direct = asRecord(props.message);
  if (direct?.id === id) return direct;
  const children = Array.isArray(props.children) ? props.children.slice(0, 3) : [props.children];
  for (const child of children) {
    const childProps = asRecord(asRecord(child)?.props);
    const message = asRecord(childProps?.message);
    if (message?.id === id) return message;
  }
  return null;
};

export const readPageMessageTime = (element: Element): number | null => {
  const id = getMessageId(element);
  if (!id) return null;
  const candidates = [element, element.querySelector("[data-chatgpt-selection-message-id]")]
    .filter((candidate): candidate is Element => candidate !== null);
  for (const candidate of candidates) {
    const attached = candidate as unknown as Record<string, unknown>;
    const fiberKey = Object.getOwnPropertyNames(attached).find((key) => key.startsWith("__reactFiber$"));
    let fiber = fiberKey ? attached[fiberKey] as FiberNode | null : null;
    for (let depth = 0; fiber && depth < 8; depth += 1, fiber = fiber.return ?? null) {
      for (const props of [fiber.memoizedProps, fiber.pendingProps]) {
        const message = messageFromProps(props, id);
        if (message) return normalizeMessageTime(message.create_time);
      }
    }
  }
  return null;
};

type TimeRequest = { requestId: string; ids: string[] };

document.addEventListener(MESSAGE_TIME_REQUEST_EVENT, (event) => {
  let request: TimeRequest;
  try {
    request = JSON.parse((event as CustomEvent<string>).detail) as TimeRequest;
  } catch {
    return;
  }
  if (!request || typeof request.requestId !== "string" || request.requestId.length > 100 ||
    !Array.isArray(request.ids) || request.ids.length > 100) return;
  const ids = new Set(request.ids.filter((id): id is string => typeof id === "string" && id.length <= 150));
  const entries: { id: string; createdAtMs: number }[] = [];
  for (const element of document.querySelectorAll(ASSISTANT_SELECTOR)) {
    const id = getMessageId(element);
    if (!id || !ids.has(id)) continue;
    const createdAtMs = readPageMessageTime(element);
    if (createdAtMs !== null) entries.push({ id, createdAtMs });
  }
  document.dispatchEvent(new CustomEvent(MESSAGE_TIME_RESPONSE_EVENT, {
    detail: JSON.stringify({ requestId: request.requestId, entries })
  }));
});

document.dispatchEvent(new Event(MESSAGE_TIME_READY_EVENT));
