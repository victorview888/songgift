export function audioPreviewEnabled() { return process.env.SONGGIFT_AUDIO_PREVIEW_ENABLED === "true"; }
export function previewDailyLimit() {
  const value = process.env.SONGGIFT_AUDIO_PREVIEW_DAILY_LIMIT || "10";
  if (!/^[1-9]\d?$|^100$/.test(value)) throw new Error("Invalid audio preview budget.");
  return Number(value);
}
