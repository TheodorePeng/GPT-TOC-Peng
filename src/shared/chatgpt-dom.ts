export const ASSISTANT_SELECTOR =
  "[data-message-author-role='assistant'],[data-content-search-unit-key$=':assistant'],[data-chatgpt-search-unit-key$=':assistant']";
export const USER_SELECTOR =
  "[data-message-author-role='user'],[data-content-search-unit-key$=':user']";
export const MESSAGE_SELECTOR = `${USER_SELECTOR},${ASSISTANT_SELECTOR}`;
export const TURN_SELECTOR =
  "[data-testid^='conversation-turn-'],[data-content-search-turn-key]";

export const getMessageRole = (element: Element): "assistant" | "user" | null => {
  const legacyRole = element.getAttribute("data-message-author-role");
  if (legacyRole === "assistant" || legacyRole === "user") return legacyRole;
  const unitKey = element.getAttribute("data-content-search-unit-key") ??
    element.getAttribute("data-chatgpt-search-unit-key") ?? "";
  if (unitKey.endsWith(":assistant")) return "assistant";
  if (unitKey.endsWith(":user")) return "user";
  return null;
};

export const getMessageId = (element: Element): string | null => {
  const legacyId = element.getAttribute("data-message-id")?.trim();
  if (legacyId) return legacyId;
  const selectionId = element.getAttribute("data-chatgpt-selection-message-id")?.trim() ??
    element.querySelector("[data-chatgpt-selection-message-id]")
      ?.getAttribute("data-chatgpt-selection-message-id")?.trim();
  if (selectionId) return selectionId;
  return element.getAttribute("data-chatgpt-search-message-ids")?.trim().split(/\s+/)[0] || null;
};

export const getTurnIndex = (container: Element): number | null => {
  const key = container.getAttribute("data-testid") ??
    container.getAttribute("data-content-search-turn-key") ?? "";
  const match = key.match(/^(?:conversation-turn-|fallback-turn-)(\d+)$/);
  return match ? Number(match[1]) : null;
};
