import fs from "node:fs";
import path from "node:path";
import { serverSupabase } from "./supabase";

const BUCKET = "mishiru-project-covers";
const REMOTE_PREFIX = `supabase:${BUCKET}/`;
let bucketReady: Promise<void> | null = null;

async function ensureBucket() {
  const supabase = serverSupabase();
  if (!supabase) return;
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data } = await supabase.storage.getBucket(BUCKET);
      if (data) return;
      const { error } = await supabase.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: 5 * 1024 * 1024,
        allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
      });
      if (error && !/already exists/i.test(error.message)) throw new Error(`COVER_BUCKET_CREATE_FAILED:${error.message}`);
    })().catch((error) => { bucketReady = null; throw error; });
  }
  await bucketReady;
}

export async function saveProjectCover(input: { buffer: Buffer; mimeType: string; extension: string; dataset: string; sessionId: string; projectId: string; kind: string }) {
  const safe = (value: string, max = 100) => value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, max);
  const relativePath = [safe(input.dataset), safe(input.sessionId, 80), safe(input.projectId), `${safe(input.kind)}-${Date.now()}.${input.extension}`].join("/");
  const supabase = serverSupabase();
  if (supabase) {
    await ensureBucket();
    const { error } = await supabase.storage.from(BUCKET).upload(relativePath, input.buffer, { contentType: input.mimeType, upsert: false });
    if (error) throw new Error(`COVER_UPLOAD_FAILED:${error.message}`);
    return `${REMOTE_PREFIX}${relativePath}`;
  }

  const root = process.env.VERCEL ? path.join("/tmp", "mishiru", "uploads") : path.join(process.cwd(), "data", "runtime", "uploads");
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, input.buffer);
  return filePath;
}

export async function readProjectCover(storagePath: string): Promise<Buffer | null> {
  if (storagePath.startsWith(REMOTE_PREFIX)) {
    const supabase = serverSupabase();
    if (!supabase) return null;
    const relativePath = storagePath.slice(REMOTE_PREFIX.length);
    const { data, error } = await supabase.storage.from(BUCKET).download(relativePath);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  const allowedRoots = [path.join(process.cwd(), "data", "runtime", "uploads"), path.join("/tmp", "mishiru", "uploads")].map((root) => path.resolve(root));
  const resolved = path.resolve(storagePath);
  if (!allowedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`)) || !fs.existsSync(resolved)) return null;
  return fs.readFileSync(resolved);
}
