export type AccountUser = { id: string; email?: string };
export type AccountAsset = { id: string; mime_type: string; created_at: string };
export type AccountOrder = {
  id: string; status: string; recipient_name: string; relationship: string | null;
  occasion: string; story: string; mood: string | null; style: string | null;
  title: string | null; lyrics_text: string | null; paid_at: string | null;
  created_at: string; updated_at: string; provider_job_id: string | null;
  generation_error: string | null; song_assets: AccountAsset[];
};
