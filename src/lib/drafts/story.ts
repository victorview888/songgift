// Draft lifecycle adapted from ShrimpReel (MIT), e1447714d61eb67af653c931e917dce7b63012b0/src/lib/photo-draft.ts.
// Text-only SongGift draft; sessionStorage replaces photo IndexedDB. License: third-party/shrimpreel/LICENSE.
export type StoryForm = { recipientName: string; relationship: string; occasion: string; story: string; mood: string; style: string };
export const initialStory: StoryForm = { recipientName: "", relationship: "", occasion: "", story: "", mood: "Warm and heartfelt", style: "Acoustic pop" };
export const STORY_DRAFT_KEY = "songgift-story-draft-v1";
export const STORY_DRAFT_TTL = 24 * 3600_000;
export const ACCOUNT_CLEARED_EVENT = "songgift-account-cleared";
export type StoryDraft = { version: 1; ownerId: string | null; requestId: string; savedAt: number; form: StoryForm; orderId?: string; stage?: "writing" | "ready" };
type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function validStoryForm(value: unknown): value is StoryForm {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(initialStory).every(key => typeof record[key] === "string" && (record[key] as string).length <= (key === "story" ? 8000 : 100));
}
function storage(): Store | undefined { try { return typeof window === "undefined" ? undefined : window.sessionStorage; } catch { return undefined; } }
export function newStoryDraft(ownerId: string | null, now = Date.now()): StoryDraft {
  return { version: 1, ownerId, requestId: crypto.randomUUID(), savedAt: now, form: { ...initialStory } };
}
export function clearStoryDraft(store = storage()) {
  try { store?.removeItem(STORY_DRAFT_KEY); store?.removeItem("songgift-draft-story"); } catch { /* Restricted storage must not block sign-out. */ }
}
export function saveStoryDraft(draft: StoryDraft, store = storage()) {
  try { if (!store) return false; store.setItem(STORY_DRAFT_KEY, JSON.stringify(draft)); return true; } catch { return false; }
}
export function loadStoryDraft(ownerId: string | null, store = storage(), now = Date.now()): StoryDraft | null {
  if (!store) return null;
  try {
    const raw = store.getItem(STORY_DRAFT_KEY);
    if (!raw) {
      // Legacy drafts had no account/time metadata. Only migrate a guest draft.
      const legacy = store.getItem("songgift-draft-story");
      if (!legacy) return null;
      store.removeItem("songgift-draft-story");
      if (ownerId !== null) return null;
      const form: unknown = JSON.parse(legacy);
      if (!validStoryForm(form)) return null;
      const draft = { ...newStoryDraft(null, now), form: Object.fromEntries(Object.keys(initialStory).map(key => [key, form[key as keyof StoryForm]])) as StoryForm };
      saveStoryDraft(draft, store); return draft;
    }
    const data = JSON.parse(raw);
    if (data?.version !== 1 || !uuid(data.requestId) || !(data.ownerId === null || uuid(data.ownerId)) || !validStoryForm(data.form) ||
      !Number.isFinite(data.savedAt) || data.savedAt > now + 60_000 || now - data.savedAt > STORY_DRAFT_TTL ||
      (data.orderId !== undefined && (!uuid(data.orderId) || !["writing", "ready"].includes(data.stage))) || (data.orderId === undefined && data.stage !== undefined)) {
      clearStoryDraft(store); return null;
    }
    if (data.ownerId !== null && data.ownerId !== ownerId) { if (ownerId !== null) clearStoryDraft(store); return null; }
    return { version: 1, ownerId, requestId: data.requestId, savedAt: data.savedAt,
      form: Object.fromEntries(Object.keys(initialStory).map(key => [key, data.form[key]])) as StoryForm,
      ...(data.orderId ? { orderId: data.orderId, stage: data.stage } : {}) };
  } catch { clearStoryDraft(store); return null; }
}
