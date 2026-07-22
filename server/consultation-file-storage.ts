import fs from "node:fs";
import path from "node:path";
import { serverSupabase } from "./supabase";

const BUCKET = "mishiru-consultation-assets";
const PREFIX = `supabase:${BUCKET}/`;
let bucketReady: Promise<void> | null = null;

async function ensureBucket() {
  const supabase = serverSupabase();
  if (!supabase) return;
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data } = await supabase.storage.getBucket(BUCKET);
      if (data) return;
      const { error } = await supabase.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 20 * 1024 * 1024, allowedMimeTypes: ["application/pdf", "application/vnd.openxmlformats-officedocument.presentationml.presentation"] });
      if (error && !/already exists/i.test(error.message)) throw new Error(`ASSET_BUCKET_CREATE_FAILED:${error.message}`);
    })().catch((error) => { bucketReady = null; throw error; });
  }
  await bucketReady;
}

export async function persistConsultationFile(filePath: string, sessionId: string, projectId: string, assetId: string) {
  const supabase = serverSupabase();
  if (!supabase) return filePath;
  await ensureBucket();
  const safe = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100);
  const relativePath = `${safe(sessionId)}/${safe(projectId)}/${safe(assetId)}/${path.basename(filePath)}`;
  const ext = path.extname(filePath).toLowerCase();
  const contentType = ext === ".pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  const { error } = await supabase.storage.from(BUCKET).upload(relativePath, fs.readFileSync(filePath), { contentType, upsert: true });
  if (error) throw new Error(`ASSET_UPLOAD_FAILED:${error.message}`);
  try { fs.unlinkSync(filePath); } catch { /* 一時ファイルの削除失敗は配信を妨げない */ }
  return `${PREFIX}${relativePath}`;
}

export async function readConsultationFile(filePath: string): Promise<Buffer | null> {
  if (filePath.startsWith(PREFIX)) {
    const supabase = serverSupabase();
    if (!supabase) return null;
    const { data, error } = await supabase.storage.from(BUCKET).download(filePath.slice(PREFIX.length));
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  return fs.existsSync(filePath) ? fs.readFileSync(filePath) : null;
}

export async function removeConsultationFile(filePath: string) {
  if (filePath.startsWith(PREFIX)) {
    const supabase = serverSupabase();
    if (supabase) await supabase.storage.from(BUCKET).remove([filePath.slice(PREFIX.length)]);
    return;
  }
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* metadata deletion remains successful */ }
}

export function consultationFileName(filePath: string) {
  return path.basename(filePath.startsWith(PREFIX) ? filePath.slice(PREFIX.length) : filePath);
}
