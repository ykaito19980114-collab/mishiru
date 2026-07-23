/**
 * Gemini の Google Search grounding を使って、未確認研究室の公式サイト候補を探す。
 *
 * 検索結果は候補として保存するだけで公開しない。採用は必ず
 * audit-lab-homepages.ts の本文・担当者・個別研究室ページ判定を通す。
 *
 * 実行例:
 *   node --env-file=.env --import tsx scripts/discover-lab-homepages-with-search.ts \
 *     --offset=0 --limit=200 --batch-size=5
 */
import fs from "fs";
import path from "path";
import type { Lab } from "../shared/types";

type SearchCandidate = {
  labId: string;
  searchedAt: string;
  query: string;
  urls: string[];
  result: string;
  error?: string;
};

const ROOT = process.cwd();
const LABS_FILE = path.join(ROOT, "data", "labs.json");
const REPORT_FILE = path.join(ROOT, "data", "lab-publication-audit.json");
const OUTPUT_FILE = path.join(ROOT, "data", "lab-homepage-search-candidates.json");
const SEARCHED_AT = "2026-07-23";
const API_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const MODEL = process.env.GEMINI_SEARCH_MODEL || "gemini-2.5-flash-lite";
const API_KEY = process.env.GEMINI_API_KEY || "";
const argv = process.argv.slice(2);
const argValue = (name: string, fallback: number) => {
  const raw = argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
  return raw ? Number(raw) : fallback;
};
const OFFSET = Math.max(0, argValue("offset", 0));
const LIMIT = Math.max(1, argValue("limit", 100));
const BATCH_SIZE = Math.max(1, Math.min(10, argValue("batch-size", 5)));
const CONCURRENCY = Math.max(1, Math.min(8, argValue("concurrency", 2)));

if (!API_KEY) throw new Error("GEMINI_API_KEY が設定されていません");

const labs = JSON.parse(fs.readFileSync(LABS_FILE, "utf-8")) as Lab[];
const report = JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8")) as {
  decisions: { labId: string; acceptedUrl: string | null }[];
};
let existing: SearchCandidate[] = [];
try {
  existing = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf-8")) as SearchCandidate[];
} catch {
  existing = [];
}
const acceptedIds = new Set(report.decisions.filter((item) => item.acceptedUrl).map((item) => item.labId));
const existingById = new Map(existing.map((item) => [item.labId, item]));
const pending = labs.filter((lab) => !acceptedIds.has(lab.id));
const unsearched = pending.filter((lab) => !existingById.has(lab.id));
const target = unsearched.slice(OFFSET, OFFSET + LIMIT);

function normalizeUrl(value: string) {
  const raw = value.trim().replace(/[。、，；;）)\]}>]+$/g, "");
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    if (/google\.com\/search|vertexaisearch\.cloud\.google\.com/i.test(parsed.hostname + parsed.pathname)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function urlsIn(value: string) {
  return Array.from(value.matchAll(/https?:\/\/[^\s<>"'）)\]}]+/g))
    .map((match) => normalizeUrl(match[0]))
    .filter(Boolean);
}

function promptFor(batch: Lab[]) {
  const rows = batch.map((lab) =>
    `${lab.id} | 大学: ${lab.university.name} | 所属: ${lab.department || "不明"} | 研究室: ${lab.name} | 担当者: ${lab.pi.name || "不明"}`);
  return [
    "日本の大学研究室について、現在の公式な研究室ホームページをGoogle検索で探してください。",
    "大学の教員プロフィール、researchmap、研究者DB、学部・学科トップ、研究室一覧、求人・まとめサイトは研究室ホームページとして返さないでください。",
    "研究室自身のサイトを確認できた場合だけ、そのURLを返してください。不明な場合は NONE としてください。",
    "入力の各 lab-ID を必ず1回ずつ、同じ順序で出力し、形式は `lab-ID\\tURL` の1行だけにしてください。説明は不要です。",
    ...rows,
  ].join("\n");
}

async function search(batch: Lab[]) {
  const input = promptFor(batch);
  let lastError = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "x-goog-api-key": API_KEY,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          input,
          tools: [{ type: "google_search" }],
        }),
      });
      const body = await response.json() as {
        steps?: { type?: string; content?: { type?: string; text?: string }[] }[];
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message || `Gemini API ${response.status}`);
      const result = (body.steps || [])
        .filter((step) => step.type === "model_output")
        .flatMap((step) => step.content || [])
        .filter((part) => part.type === "text")
        .map((part) => part.text || "")
        .join("\n");
      const records: SearchCandidate[] = [];
      for (let index = 0; index < batch.length; index += 1) {
        const lab = batch[index];
        const nextId = batch[index + 1]?.id;
        const start = result.indexOf(lab.id);
        const end = nextId ? result.indexOf(nextId, Math.max(0, start + lab.id.length)) : result.length;
        const section = start >= 0 ? result.slice(start, end >= 0 ? end : result.length) : "";
        records.push({
          labId: lab.id,
          searchedAt: SEARCHED_AT,
          query: `${lab.university.name} ${lab.name} ${lab.pi.name} 研究室 公式`,
          urls: Array.from(new Set(urlsIn(section))).slice(0, 3),
          result: section.slice(0, 1_000),
        });
      }
      return records;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "search_failed";
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 1_500 * 2 ** attempt));
    }
  }
  return batch.map((lab) => ({
    labId: lab.id,
    searchedAt: SEARCHED_AT,
    query: `${lab.university.name} ${lab.name} ${lab.pi.name} 研究室 公式`,
    urls: [],
    result: "",
    error: lastError,
  }));
}

function save() {
  const ordered = labs.map((lab) => existingById.get(lab.id)).filter((item): item is SearchCandidate => Boolean(item));
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(ordered, null, 2));
}

console.log(`[search] pending=${pending.length} unsearched=${unsearched.length} target=${target.length} offset=${OFFSET} limit=${LIMIT} batchSize=${BATCH_SIZE} concurrency=${CONCURRENCY} model=${MODEL}`);
const batches = Array.from({ length: Math.ceil(target.length / BATCH_SIZE) }, (_, index) =>
  target.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE));
let batchCursor = 0;
let completed = 0;
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, async () => {
  while (batchCursor < batches.length) {
    const batch = batches[batchCursor++];
    const results = await search(batch);
    for (const item of results) existingById.set(item.labId, item);
    save();
    completed += batch.length;
    const found = results.filter((item) => item.urls.length).length;
    console.log(`[search] ${completed}/${target.length} 候補あり=${found}`);
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
}));
save();
const total = Array.from(existingById.values());
console.log(JSON.stringify({
  searched: total.length,
  candidates: total.filter((item) => item.urls.length).length,
  errors: total.filter((item) => item.error).length,
}, null, 2));
