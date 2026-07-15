// 全国研究室CSV(19,785件) → data/labs.json 正規化パイプライン（別チャット設計を本リポジトリに実装）
// 派生列生成 + 100大学マスタ突合 + 12分野自動分類。実行: npx tsx scripts/convert-national.ts
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import { inferAreaTags } from "../shared/taxonomy";
import { UNIVERSITIES_MASTER } from "../shared/universities";
import { classifyField, fieldLabel } from "../shared/fields";
import { cleanPersonName } from "../shared/clean-name";
import type { Lab, LabMember, LabSource } from "../shared/types";

const CSV = process.env.CSV_PATH ||
  "/Users/kaitoyoshizumi/Downloads/全国大学研究室データベース_第1回-第46回統合_v20.xlsx - 研究室リスト_掲出用.csv";

const TITLES = ["特任教授", "特命教授", "名誉教授", "招へい教授", "客員教授", "特任准教授", "准教授", "教授", "特任講師", "講師", "特任助教", "助教"];

function parseMembers(raw: string): LabMember[] {
  if (!raw) return [];
  return raw.split(/／|\//).map((s) => s.trim()).filter(Boolean).map((part) => {
    const title = TITLES.find((t) => part.includes(t)) || (part.includes("教員") ? "教員" : "");
    // 氏名は clean-name で「（教員）」等を除去（外部論文検索に氏名だけを渡すため）
    const name = cleanPersonName(part) || "";
    return { name, title };
  }).filter((m) => m.name || m.title); // 完全に空のトークンは除外
}
const splitKeywords = (raw: string) =>
  (raw || "").split(/、|，|,|／|\/|・|;|；/).map((k) => k.trim()).filter(Boolean);

const raw = fs.readFileSync(CSV, "utf-8").replace(/^﻿/, "");
const parsed = Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true });

const today = "2026-07-03";
const labs: Lab[] = [];
const unknownUnivs = new Set<string>();
const fieldCount: Record<string, number> = {};
const regionCount: Record<string, number> = {};
let noUrl = 0;

for (const row of parsed.data) {
  const no = (row["No"] || "").trim();
  const univName = (row["大学名"] || "").trim();
  if (!no || !univName) continue;

  const facultyFull = (row["学部・研究科・専攻"] || "").trim();
  // 研究科・専攻の分割（最初の全角/半角スペースで2分割）
  const spIdx = facultyFull.search(/[ 　]/);
  const graduate_school = spIdx >= 0 ? facultyFull.slice(0, spIdx) : facultyFull;
  const major = spIdx >= 0 ? facultyFull.slice(spIdx + 1).trim() : "";

  const members = parseMembers(row["教授名・職位"] || "");
  // 有効な氏名を持つ最初のメンバーをPIに。無ければ氏名空（外部リンク非表示）＝生データにフォールバックしない
  const pi = members.find((m) => m.name) || members[0] || { name: "", title: "" };
  const keywords = splitKeywords(row["研究分野・キーワード"] || "");

  // URL正規化：httpで始まらない値（「要確認」等）は空に
  const rawUrl = (row["研究室URL"] || "").trim();
  const official_url = rawUrl.startsWith("http") ? rawUrl : null;
  if (!official_url) noUrl++;

  const meta = UNIVERSITIES_MASTER[univName];
  if (!meta) unknownUnivs.add(univName);

  const field_major = classifyField(row["研究分野・キーワード"] || "", facultyFull, row["研究室名"] || "");
  fieldCount[field_major] = (fieldCount[field_major] || 0) + 1;
  if (meta) regionCount[meta.region] = (regionCount[meta.region] || 0) + 1;

  const sources: LabSource[] = [];
  if (official_url) sources.push({ label: "研究室公式サイト", url: official_url });

  labs.push({
    id: `lab-${no}`,
    name: (row["研究室名"] || "").trim() || `${pi.name}研究室`,
    university: { name: univName, prefecture: meta?.prefecture || "", region: meta?.region || "" },
    university_type: meta?.type || null,
    department: facultyFull,
    graduate_school,
    major,
    members,
    pi,
    member_count: members.length || 1,
    keywords,
    area_tags: inferAreaTags(keywords),
    field_major,
    official_url,
    has_url: !!official_url,
    sources,
    sections: {
      research_summary: keywords.length
        ? `${keywords.slice(0, 4).join("、")}を主なテーマとする研究室です。`
        : null,
      student_themes: null, methods: null, key_papers: null, daily_life: null,
      mentoring: null, careers: null, fit: null, collaboration: null,
    },
    status: "published",
    verified: false,
    confidence: "public_info",
    last_updated: today,
  });
}

const outPath = path.join(process.cwd(), "data", "labs.json");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(labs), "utf-8");

// 検証レポート
console.log(`✔ ${labs.length}件を data/labs.json へ書き出し（${(fs.statSync(outPath).size / 1e6).toFixed(1)}MB）`);
console.log(`大学マスタ突合: ${unknownUnivs.size === 0 ? "全大学マッチ ✓" : "未マッピング=" + [...unknownUnivs].join(",")}`);
console.log(`URL未登録（営業リスト対象）: ${noUrl}件 (${(noUrl / labs.length * 100).toFixed(0)}%)`);
const other = fieldCount["other"] || 0;
console.log(`分野未分類(その他): ${other}件 (${(other / labs.length * 100).toFixed(1)}%)`);
console.log("分野分布:", Object.entries(fieldCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${fieldLabel(k)}=${v}`).join(" / "));
console.log("地域分布:", Object.entries(regionCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(" / "));
