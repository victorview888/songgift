export type SongStoryInput = {
  recipientName: string;
  relationship: string;
  occasion: string;
  story: string;
  mood: string;
  style: string;
  email?: string;
  orderId?: string;
};

export type LyricsGenerationResult = {
  provider: string;
  model: string;
  status: "completed" | "mock";
  title: string;
  lyricsText: string;
  factsUsed: string[];
  pronunciationNotes: string[];
  orderId?: string;
  persistenceStatus?: "saved" | "skipped";
};

export type MusicGenerationInput = {
  recipientName: string;
  occasion: string;
  story: string;
  mood: string;
  style: string;
  lyricsText: string;
  orderId?: string;
};

export type MusicGenerationResult = {
  provider: string;
  model: string;
  status: "completed" | "queued" | "processing" | "failed" | "mock";
  providerJobId?: string;
  mimeType?: string;
  audioBase64?: string;
  audioUrl?: string;
  watermarked?: boolean;
  expiresAt?: string;
  traceId?: string;
  assetId?: string;
  storagePath?: string;
  persistenceStatus?: "saved" | "skipped";
  message?: string;
};
