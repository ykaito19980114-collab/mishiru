import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import type { Lab, LabResearchEvidence } from "../shared/types";
import {
  looksLikeAggregateLabName,
  looksLikeAggregateLabPage,
  looksLikeResearcherProfile,
} from "../shared/lab-url-quality";

// ExcelをCSVへ変換後、次のように実行する。
// LAB_WORKBOOK_CSV=/path/to/研究室リスト_DB.csv \
// LAB_WORKBOOK_SOURCE=/path/to/研究室リスト_DB.xlsx \
// pnpm run import:lab-workbook -- --apply
const root = process.cwd();
const csvPath = process.env.LAB_WORKBOOK_CSV;
const sourcePath = process.env.LAB_WORKBOOK_SOURCE;
const apply = process.argv.includes("--apply");
const importedAt = "2026-07-28";

if (!csvPath) {
  throw new Error("LAB_WORKBOOK_CSV にCSV変換した研究室リストのパスを指定してください。");
}

interface WorkbookRow {
  excelRow: number;
  no: string;
  name: string;
  summary: string;
  questions: string[];
  sourceUrl: string;
  evidenceMemo: string;
  verificationStatus: string;
  urlStatus: string;
}

interface BaseRow {
  excelRow: number;
  no: string;
  university: string;
  department: string;
  name: string;
  faculty: string;
  keywords: string;
  url: string;
}

const cell = (value: unknown) => String(value ?? "").trim();
const isNo = (value: string) => /^\d+$/.test(value);
const isUrl = (value: string) => /^https?:\/\//i.test(value);
const normalizeName = (value: string) => value
  .normalize("NFKC")
  .replace(/[（(][^）)]*[）)]/g, "")
  .replace(/研究室|研究所|研究グループ|グループ|ラボ|講座|分野|部門|領域|ユニット/g, "")
  .replace(/[\s・／/]+/g, "")
  .toLowerCase();
const normalizeUrl = (value: string) => value
  .replace(/\/(?:index\.(?:html?|php))?$/i, "")
  .toLowerCase();

const trustedQuestionStatus = (status: string) =>
  status === "確認済" || /(?:confirmed|verified)/i.test(status);

const homepageStatus = (status: string) => {
  if (/不可|不安定|未確認|旧ページ|メンテナンス|共通|一覧|シラバス|退職|退官|定年/i.test(status)) {
    return false;
  }
  if (status === "success" || status === "取得済") return true;
  return /研究室公式(?:ページ|URL|サイト)|学科公式研究室(?:ページ|紹介)|大学公式研究室(?:ページ|情報|紹介)|研究グループ公式ページ|グループ公式ページ|学科公式サイト/i.test(status);
};

const rawCsv = fs.readFileSync(path.resolve(csvPath), "utf-8").replace(/^\uFEFF/, "");
const parsed = Papa.parse<string[]>(rawCsv, { skipEmptyLines: false });
if (parsed.errors.length) {
  throw new Error(`CSV解析エラー: ${parsed.errors.slice(0, 5).map((error) => error.message).join(" / ")}`);
}

const baseByNo = new Map<string, BaseRow>();
const updateByNo = new Map<string, WorkbookRow>();
let duplicateUpdateRows = 0;
for (const [index, columns] of parsed.data.entries()) {
  const excelRow = index + 1;
  const noA = cell(columns[0]).replace(/^\uFEFF/, "");
  const noH = cell(columns[7]).replace(/\.0$/, "");
  if (isNo(noA)) {
    baseByNo.set(noA, {
      excelRow,
      no: noA,
      university: cell(columns[1]),
      department: cell(columns[2]),
      name: cell(columns[3]),
      faculty: cell(columns[4]),
      keywords: cell(columns[5]),
      url: cell(columns[6]),
    });
  }
  if (isNo(noH)) {
    if (updateByNo.has(noH)) duplicateUpdateRows += 1;
    updateByNo.set(noH, {
      excelRow,
      no: noH,
      name: cell(columns[8]),
      summary: cell(columns[9]),
      questions: [cell(columns[10]), cell(columns[11])].filter(Boolean),
      sourceUrl: cell(columns[12]),
      evidenceMemo: cell(columns[13]),
      verificationStatus: cell(columns[14]),
      urlStatus: cell(columns[15]),
    });
  }
}

const labsPath = path.join(root, "data", "labs.json");
const suppressionsPath = path.join(root, "data", "lab-suppressions.json");
const overridesPath = path.join(root, "data", "lab-homepage-overrides.json");
const labs = JSON.parse(fs.readFileSync(labsPath, "utf-8")) as Lab[];
const suppressions = JSON.parse(fs.readFileSync(suppressionsPath, "utf-8")) as {
  ids: string[];
  sourceNos: string[];
};
const overrides = JSON.parse(fs.readFileSync(overridesPath, "utf-8")) as {
  labId: string;
  url: string;
  applyAtRuntime?: boolean;
  publish?: boolean;
}[];
const suppressedIds = new Set(suppressions.ids);
const suppressedNos = new Set(suppressions.sourceNos.map(String));
const manualOverrideIds = new Set(
  overrides
    .filter((override) => override.applyAtRuntime && override.publish !== false)
    .map((override) => override.labId),
);

const isPublic = (lab: Lab) =>
  (lab.status === "published" || lab.status === "claimed")
  && lab.quality?.sourceKind === "lab_homepage"
  && Boolean(lab.official_url);
const publicBeforeIds = new Set(labs.filter(isPublic).map((lab) => lab.id));
const notesWithoutOldImport = (lab: Lab) =>
  (lab.quality?.notes || []).filter((note) =>
    !note.startsWith("研究室リスト_DB 2026-07-28") && !/確認できない|再確認/.test(note));

const promotionCandidates = labs.flatMap((lab) => {
  const no = String(lab.sourceNo || lab.id.replace(/^lab-0*/, ""));
  const base = baseByNo.get(no);
  const update = updateByNo.get(no);
  if (!base || !update) return [];
  const nameMatches = normalizeName(base.name) === normalizeName(update.name);
  const wasPublic = publicBeforeIds.has(lab.id) || manualOverrideIds.has(lab.id);
  const eligible =
    !wasPublic
    && !suppressedIds.has(lab.id)
    && !suppressedNos.has(no)
    && trustedQuestionStatus(update.verificationStatus)
    && nameMatches
    && isUrl(base.url)
    && homepageStatus(update.urlStatus)
    && !looksLikeResearcherProfile(base.url)
    && !looksLikeAggregateLabPage(base.url)
    && !looksLikeAggregateLabName(base.name);
  return eligible ? [{ lab, no, base, update, urlKey: normalizeUrl(base.url) }] : [];
});
const identitiesByUrl = new Map<string, Set<string>>();
for (const lab of labs.filter(isPublic)) {
  if (!lab.official_url) continue;
  const identities = identitiesByUrl.get(normalizeUrl(lab.official_url)) || new Set<string>();
  identities.add(normalizeName(lab.name));
  identitiesByUrl.set(normalizeUrl(lab.official_url), identities);
}
for (const override of overrides.filter((item) => item.applyAtRuntime && item.publish !== false && isUrl(item.url))) {
  const lab = labs.find((item) => item.id === override.labId);
  if (!lab) continue;
  const identities = identitiesByUrl.get(normalizeUrl(override.url)) || new Set<string>();
  identities.add(normalizeName(lab.name));
  identitiesByUrl.set(normalizeUrl(override.url), identities);
}
for (const candidate of promotionCandidates) {
  const identities = identitiesByUrl.get(candidate.urlKey) || new Set<string>();
  identities.add(normalizeName(candidate.base.name));
  identitiesByUrl.set(candidate.urlKey, identities);
}
const ambiguousUrlKeys = new Set(
  [...identitiesByUrl.entries()]
    .filter(([, identities]) => identities.size > 1)
    .map(([url]) => url),
);
const safeHomepageIds = new Set(
  promotionCandidates
    .filter((candidate) => !ambiguousUrlKeys.has(candidate.urlKey))
    .map((candidate) => candidate.lab.id),
);

let evidenceStored = 0;
let trustedEvidence = 0;
let displayedContentUpdated = 0;
let provisionalStored = 0;
let promoted = 0;
let preservedPublic = 0;
let missingBaseRow = 0;
let mismatchedNames = 0;
let suppressedEvidence = 0;
const promotedLabs: { id: string; no: string; university: string; name: string; url: string }[] = [];
const mismatchSample: { no: string; baseName: string; updateName: string }[] = [];
const evidenceRecords: (LabResearchEvidence & { labId: string; sourceNo: string })[] = [];

const updatedLabs = labs.map((lab): Lab => {
  const no = String(lab.sourceNo || lab.id.replace(/^lab-0*/, ""));
  const base = baseByNo.get(no);
  const update = updateByNo.get(no);
  if (!update) return lab;
  if (!base) {
    missingBaseRow += 1;
    return lab;
  }

  const nameMatches = normalizeName(base.name) === normalizeName(update.name);
  if (!nameMatches) {
    mismatchedNames += 1;
    if (mismatchSample.length < 50) {
      mismatchSample.push({ no, baseName: base.name, updateName: update.name });
    }
  }

  const trusted = trustedQuestionStatus(update.verificationStatus);
  const evidence: LabResearchEvidence = {
    summary: update.summary,
    questions: update.questions,
    sourceUrl: update.sourceUrl,
    note: update.evidenceMemo,
    verificationStatus: update.verificationStatus,
    urlStatus: update.urlStatus,
    confidence: trusted ? "confirmed" : "candidate",
    importedAt,
    source: "研究室リスト_DB.xlsx",
    excelRow: update.excelRow,
  };
  evidenceRecords.push({ labId: lab.id, sourceNo: no, ...evidence });
  evidenceStored += 1;
  if (trusted) trustedEvidence += 1;
  else provisionalStored += 1;

  if (suppressedIds.has(lab.id) || suppressedNos.has(no)) {
    suppressedEvidence += 1;
    return lab;
  }

  const wasPublic = publicBeforeIds.has(lab.id) || manualOverrideIds.has(lab.id);
  if (wasPublic) preservedPublic += 1;
  const safeHomepage = safeHomepageIds.has(lab.id);
  if (safeHomepage) {
    promoted += 1;
    if (promotedLabs.length < 100) {
      promotedLabs.push({ id: lab.id, no, university: lab.university.name, name: lab.name, url: base.url });
    }
  }

  const showWorkbookContent = trusted && (wasPublic || safeHomepage);
  if (showWorkbookContent) displayedContentUpdated += 1;
  const homepageUrl = safeHomepage ? base.url : lab.official_url;
  const primarySources = safeHomepage
    ? [{ label: "研究室ホームページ", url: base.url }]
    : lab.sources;
  const sources = showWorkbookContent && isUrl(update.sourceUrl)
    && !primarySources.some((source) => normalizeUrl(source.url) === normalizeUrl(update.sourceUrl))
    ? [...primarySources, { label: "研究内容の根拠", url: update.sourceUrl }]
    : primarySources;

  return {
    ...lab,
    official_url: homepageUrl,
    has_url: Boolean(homepageUrl),
    sources,
    researchQuestions: showWorkbookContent ? update.questions : lab.researchQuestions,
    questions: showWorkbookContent ? update.questions : lab.questions,
    sections: {
      ...lab.sections,
      research_summary: showWorkbookContent ? update.summary : lab.sections.research_summary,
    },
    last_updated: showWorkbookContent || safeHomepage ? importedAt : lab.last_updated,
    quality: safeHomepage
      ? {
          publicationLevel: "sourced",
          contentLevel: "sourced",
          score: Math.max(lab.quality?.score || 0, 90),
          reviewStatus: "manually_researched",
          sourceKind: "lab_homepage",
          checkedAt: importedAt,
          missingFields: (lab.quality?.missingFields || []).filter((field) =>
            field !== "研究室ホームページ" && field !== "具体的な研究キーワード"),
          notes: [...notesWithoutOldImport(lab), `研究室リスト_DB 2026-07-28: ${update.urlStatus}`],
        }
      : showWorkbookContent && lab.quality
        ? {
            ...lab.quality,
            publicationLevel: lab.quality.publicationLevel === "hidden" ? "sourced" : lab.quality.publicationLevel,
            contentLevel: "sourced",
            checkedAt: importedAt,
            notes: [...notesWithoutOldImport(lab), `研究室リスト_DB 2026-07-28: 問い・研究概要を反映（${update.verificationStatus}）`],
          }
        : lab.quality,
  };
});

const publicAfter = updatedLabs.filter(isPublic).filter((lab) => {
  const no = String(lab.sourceNo || lab.id.replace(/^lab-0*/, ""));
  return !suppressedIds.has(lab.id) && !suppressedNos.has(no);
}).length;
const sourceSha256 = sourcePath && fs.existsSync(sourcePath)
  ? crypto.createHash("sha256").update(fs.readFileSync(sourcePath)).digest("hex")
  : null;
const report = {
  source: {
    fileName: sourcePath ? path.basename(sourcePath) : "研究室リスト_DB.xlsx",
    sha256: sourceSha256,
    importedAt,
  },
  input: {
    baseRows: baseByNo.size,
    updateRows: updateByNo.size,
    duplicateUpdateRows,
    existingLabs: labs.length,
  },
  policy: {
    mergeKey: "A列NoとH列Noを独立に読み、Noで結合",
    existingPublishedLabs: "URL・公開状態を維持し、確認済みの問いと概要だけ更新",
    newPublication: "確認済みの問い、研究室ページ取得済み、研究室名一致、非プロフィールURLをすべて満たす場合のみ公開",
    provisionalRows: "根拠情報をDBへ保存するが、公開表示には使用しない",
    suppressions: "既存の掲載停止リストを常に優先",
    duplicateRows: "同じNoが複数ある場合はExcel内の後の行を採用",
  },
  result: {
    evidenceStored,
    trustedEvidence,
    provisionalStored,
    displayedContentUpdated,
    promoted,
    preservedPublic,
    suppressedEvidence,
    missingBaseRow,
    mismatchedNames,
    promotionCandidates: promotionCandidates.length,
    rejectedAmbiguousHomepageUrls: ambiguousUrlKeys.size,
    publicBefore: publicBeforeIds.size,
    publicAfter,
  },
  warnings: {
    rightRowsWithoutLab: [...updateByNo.keys()].filter((no) => !labs.some((lab) =>
      String(lab.sourceNo || lab.id.replace(/^lab-0*/, "")) === no)),
    mismatchSample,
  },
  promotedSample: promotedLabs,
};

console.log(JSON.stringify(report, null, 2));
if (apply) {
  fs.writeFileSync(labsPath, JSON.stringify(updatedLabs), "utf-8");
  fs.writeFileSync(
    path.join(root, "data", "lab-research-evidence.json"),
    JSON.stringify(evidenceRecords),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(root, "data", "lab-workbook-update-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf-8",
  );
}
