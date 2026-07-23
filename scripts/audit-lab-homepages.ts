/**
 * 研究室ホームページ監査・発見パイプライン。
 *
 * 教員ページ、researchmap、大学の研究室一覧は「発見元」にだけ使用し、
 * 研究室名または責任者名との一致を確認できた研究室ホームページだけを
 * official_url として採用する。未確認ページは review_requested にする。
 *
 * 実行例:
 *   pnpm tsx scripts/audit-lab-homepages.ts --offset=0 --limit=500 --concurrency=8 --apply
 *   pnpm tsx scripts/audit-lab-homepages.ts --concurrency=12 --apply
 */
import fs from "fs";
import path from "path";
import type { Lab, LabQuality, LabSource } from "../shared/types";

type NormalizedLab = {
  sourceNo: string;
  url?: string;
  facultyPage?: string;
  researchmap?: string;
  notes?: string;
};

type Override = {
  labId: string;
  url: string;
  label: string;
  evidenceUrl: string;
  checkedAt: string;
  note: string;
  publish?: boolean;
};

type FetchRecord = {
  requestedUrl: string;
  finalUrl: string;
  ok: boolean;
  status: number;
  contentType: string;
  title: string;
  text: string;
  links: { url: string; anchor: string; context: string }[];
  linksCollected: boolean;
  error?: string;
  checkedAt: string;
};

type Candidate = {
  url: string;
  score: number;
  anchor: string;
  evidenceUrl: string;
  reasons: string[];
};

type LabAudit = {
  labId: string;
  currentUrl: string | null;
  acceptedUrl: string | null;
  evidenceUrl: string | null;
  outcome: "verified" | "discovered" | "manual_hold" | "unresolved";
  confidence: number;
  matchedKeywords: string[];
  reasons: string[];
};

const ROOT = process.cwd();
const DATA = path.join(ROOT, "data");
const LABS_FILE = path.join(DATA, "labs.json");
const NORMALIZED_FILE = path.join(DATA, "normalized", "labs.json");
const OVERRIDES_FILE = path.join(DATA, "lab-homepage-overrides.json");
const CACHE_FILE = path.join(DATA, "runtime", "lab-homepage-crawl-cache.json");
const REPORT_FILE = path.join(DATA, "lab-publication-audit.json");
const CHECKED_AT = "2026-07-23";
const args = new Set(process.argv.slice(2));
const argValue = (name: string, fallback: number) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1];
  return raw ? Number(raw) : fallback;
};
const APPLY = args.has("--apply");
const LIMIT = argValue("limit", Number.POSITIVE_INFINITY);
const OFFSET = Math.max(0, argValue("offset", 0));
const CONCURRENCY = Math.max(1, Math.min(16, argValue("concurrency", 8)));

const labs = JSON.parse(fs.readFileSync(LABS_FILE, "utf-8")) as Lab[];
const normalized = JSON.parse(fs.readFileSync(NORMALIZED_FILE, "utf-8")) as NormalizedLab[];
const overrides = JSON.parse(fs.readFileSync(OVERRIDES_FILE, "utf-8")) as Override[];
const normalizedByNo = new Map(normalized.map((item) => [String(item.sourceNo), item]));
const overrideById = new Map(overrides.map((item) => [item.labId, item]));
let fetchCache: Record<string, FetchRecord> = {};
try { fetchCache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")); } catch { fetchCache = {}; }
for (const record of Object.values(fetchCache)) {
  record.text = record.text.slice(0, 24_000);
  record.links = record.links.slice(0, 400);
}

const PROFILE_HOST_PARTS = [
  "researchmap.jp", "k-ris.keio.ac.jp", "r-info.tohoku.ac.jp", "research-db.",
  "researcher", "researchers.", "research-db", "researchmap", "ridb.", "yudb.",
  "hyokadb", "profs.", "elsevierpure.com", "search.adb.", "rdb.",
  "nrid.nii.ac.jp", "kaken.nii.ac.jp", "jglobal.jst.go.jp", "orcid.org",
  "scholar.google.", "cir.nii.ac.jp",
];
const DIRECTORY_PATH_PARTS = [
  "/staff", "/faculty", "/teacher", "/member", "/members", "/researchers",
  "/laboratory/index", "/laboratories", "/lab/list", "/labs/",
];
const AGGREGATE_NAME = /全研究室|研究室群|各研究室|各分野|各領域|各専攻|講座群|連携研究室|教員一覧|担当教員一覧|研究室・教員一覧|ほか(?:\d+)?(?:研究室)?|他研究室|多数|主要分野/;

function isAggregateLabName(name: string) {
  if (AGGREGATE_NAME.test(name)) return true;
  const wrapped = /^[（(].*[）)]$/.test(name);
  const separators = (name.match(/[・／/]/g) || []).length;
  return wrapped && separators >= 1 && !/^[（(][^）)]*研究室[^）)]*[）)]$/.test(name);
}

function labNo(lab: Lab) {
  return String(lab.sourceNo || lab.id.replace(/^lab-0*/, ""));
}

function normalizeUrl(value: string | null | undefined) {
  const raw = String(value || "").trim().replace(/[。、，；;）)]+$/g, "");
  if (!/^https?:\/\//i.test(raw)) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function urlsIn(value: string | null | undefined) {
  return Array.from(String(value || "").matchAll(/https?:\/\/[^\s（）]+/g))
    .map((match) => normalizeUrl(match[0]))
    .filter(Boolean);
}

function decodeHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_all, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function pageTitle(html: string) {
  return decodeHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").slice(0, 300);
}

function coreLabName(name: string) {
  return name
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/研究室|研究所|研究グループ|グループ|ラボ|講座|分野|部門|領域|ユニット/g, " ")
    .replace(/[・／/\s]+/g, "")
    .trim();
}

function personTokens(name: string) {
  const clean = name.replace(/\s+/g, "");
  if (!clean || clean === "各教員" || clean.startsWith("全")) return [];
  return Array.from(new Set([clean, clean.slice(0, 2)].filter((value) => value.length >= 2)));
}

function isProfileUrl(value: string) {
  const url = normalizeUrl(value).toLowerCase();
  return PROFILE_HOST_PARTS.some((part) => url.includes(part));
}

function looksLikeDirectory(value: string, text: string) {
  const url = normalizeUrl(value).toLowerCase();
  const directoryPath = DIRECTORY_PATH_PARTS.some((part) => url.includes(part));
  const labMentions = (text.match(/研究室|laborator(?:y|ies)/gi) || []).length;
  return directoryPath && labMentions >= 8;
}

function looksLikePersonProfile(value: string, title: string) {
  const url = normalizeUrl(value).toLowerCase();
  return /\/(?:faculty|staff|teacher|researcher|profile|people|member)(?:\/|$)/i.test(url)
    || /教員紹介|研究者情報|研究者総覧|教員プロフィール|faculty\s*profile|researcher\s*profile/i.test(title);
}

function presentsAsLabHomepage(page: FetchRecord) {
  const labMarker = /研究室|ラボ|laborator(?:y|ies)|\blab\b/i;
  const titleSaysLab = labMarker.test(page.title);
  const urlSaysLab = /(?:^|[./_-])(?:lab|labo|laboratory|kenkyu)(?:[./_-]|$)/i.test(page.finalUrl);
  const pageLeadSaysLab = labMarker.test(page.text.slice(0, 1_200));
  const pageSaysLab = titleSaysLab || urlSaysLab || pageLeadSaysLab;
  return pageSaysLab
    && !isProfileUrl(page.finalUrl)
    && !looksLikePersonProfile(page.finalUrl, page.title)
    && !looksLikeDirectory(page.finalUrl, page.text);
}

const inFlight = new Map<string, Promise<FetchRecord>>();
const hostLastRequest = new Map<string, number>();
let completedFetches = 0;
let cacheWrites = 0;

async function fetchPage(value: string, collectLinks = false): Promise<FetchRecord> {
  const url = normalizeUrl(value);
  if (!url) return { requestedUrl: value, finalUrl: "", ok: false, status: 0, contentType: "", title: "", text: "", links: [], linksCollected: collectLinks, error: "invalid_url", checkedAt: CHECKED_AT };
  // 同じ監査日の取得結果は失敗も含めて再利用し、全件監査中の過剰な再アクセスを防ぐ。
  const cached = fetchCache[url];
  if (cached?.checkedAt === CHECKED_AT && (!collectLinks || cached.linksCollected)) return cached;
  const flightKey = `${url}|${collectLinks ? "links" : "page"}`;
  if (inFlight.has(flightKey)) return inFlight.get(flightKey)!;
  const task = (async () => {
    let host = "";
    try { host = new URL(url).host; } catch { /* handled by normalizeUrl */ }
    const elapsed = Date.now() - (hostLastRequest.get(host) || 0);
    if (elapsed < 350) await new Promise((resolve) => setTimeout(resolve, 350 - elapsed));
    hostLastRequest.set(host, Date.now());
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    let record: FetchRecord;
    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: ctrl.signal,
        headers: {
          "User-Agent": "MISHIRU-Publication-Audit/1.0 (+https://mishiru-lab.com; support@mishiru-lab.com)",
          "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.4,*/*;q=0.1",
        },
      });
      const contentType = response.headers.get("content-type") || "";
      const isHtml = /html|xhtml/i.test(contentType);
      const body = isHtml ? (await response.text()).slice(0, 2_000_000) : "";
      const finalUrl = normalizeUrl(response.url) || url;
      const text = isHtml ? decodeHtml(body).slice(0, 24_000) : "";
      record = {
        requestedUrl: url,
        finalUrl,
        ok: response.ok,
        status: response.status,
        contentType,
        title: isHtml ? pageTitle(body) : "",
        text,
        links: isHtml && collectLinks ? extractLinks(body, finalUrl).slice(0, 400) : [],
        linksCollected: collectLinks,
        checkedAt: CHECKED_AT,
      };
    } catch (error) {
      record = {
        requestedUrl: url,
        finalUrl: url,
        ok: false,
        status: 0,
        contentType: "",
        title: "",
        text: "",
        links: [],
        linksCollected: collectLinks,
        error: error instanceof Error ? error.message : "fetch_failed",
        checkedAt: CHECKED_AT,
      };
    } finally {
      clearTimeout(timer);
    }
    fetchCache[url] = record;
    completedFetches += 1;
    if (completedFetches % 500 === 0) {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(CACHE_FILE, JSON.stringify(fetchCache));
      cacheWrites += 1;
    }
    if (completedFetches % 100 === 0) {
      console.log(`[crawl] ${completedFetches} URL確認済み`);
    }
    return record;
  })().finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, task);
  return task;
}

function extractLinks(html: string, baseUrl: string) {
  const links: { url: string; anchor: string; context: string }[] = [];
  const re = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(re)) {
    const href = match[1] || match[2] || match[3] || "";
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    try {
      const url = normalizeUrl(new URL(href, baseUrl).toString());
      if (!url || /\.(?:jpg|jpeg|png|gif|svg|zip|docx?|xlsx?|pptx?)($|\?)/i.test(url)) continue;
      const start = Math.max(0, (match.index || 0) - 140);
      const end = Math.min(html.length, (match.index || 0) + match[0].length + 140);
      links.push({ url, anchor: decodeHtml(match[4] || ""), context: decodeHtml(html.slice(start, end)) });
    } catch {
      // 相対URLとして解決できないリンクは無視。
    }
  }
  return links;
}

function candidateScore(lab: Lab, link: { url: string; anchor: string; context: string }, evidenceUrl: string): Candidate {
  let score = 0;
  const reasons: string[] = [];
  const anchor = link.anchor.replace(/\s+/g, "");
  const context = link.context.replace(/\s+/g, "");
  const core = coreLabName(lab.name);
  const people = personTokens(lab.pi.name);
  if (core.length >= 2 && anchor.includes(core)) { score += 8; reasons.push("リンクに研究室名一致"); }
  else if (core.length >= 2 && context.includes(core)) { score += 2; reasons.push("リンク周辺に研究室名"); }
  if (people[0] && anchor.includes(people[0])) { score += 8; reasons.push("リンクに責任者名一致"); }
  else if (people[0] && context.includes(people[0])) { score += 2; reasons.push("リンク周辺に責任者名"); }
  else if (people[1] && anchor.includes(people[1])) { score += 4; reasons.push("リンクに責任者姓一致"); }
  else if (people[1] && context.includes(people[1])) { score += 1; reasons.push("リンク周辺に責任者姓"); }
  if (/研究室|ラボ|laboratory|\blab\b/i.test(link.anchor)) { score += 3; reasons.push("リンク表記が研究室"); }
  if (/公式|website|ホームページ|HP/i.test(link.anchor)) { score += 2; reasons.push("公式サイト表記"); }
  if (/lab|laboratory|kenkyu|labo/i.test(link.url)) score += 1;
  if (isProfileUrl(link.url)) score -= 12;
  if (/\.pdf($|\?)/i.test(link.url)) score -= 8;
  if (normalizeUrl(link.url) === normalizeUrl(evidenceUrl)) score -= 4;
  return { url: link.url, score, anchor: link.anchor, evidenceUrl, reasons };
}

function pageMatchScore(lab: Lab, page: FetchRecord) {
  if (!page.ok || !page.text) return { score: 0, reasons: ["ページを取得できない"] };
  let score = 0;
  const reasons: string[] = [];
  const text = `${page.title} ${page.text}`.replace(/\s+/g, "");
  const core = coreLabName(lab.name);
  const people = personTokens(lab.pi.name);
  if (core.length >= 2 && text.includes(core)) { score += 5; reasons.push("ページ本文に研究室名"); }
  if (people[0] && text.includes(people[0])) { score += 5; reasons.push("ページ本文に責任者名"); }
  else if (people[1] && text.includes(people[1])) { score += 2; reasons.push("ページ本文に責任者姓"); }
  if (/研究室|laboratory|\blab\b/i.test(`${page.title} ${page.text.slice(0, 3000)}`)) { score += 2; reasons.push("研究室ページ表記"); }
  if (isProfileUrl(page.finalUrl)) { score -= 10; reasons.push("教員・研究者プロフィール"); }
  if (looksLikeDirectory(page.finalUrl, page.text)) { score -= 7; reasons.push("研究室・教員一覧"); }
  return { score, reasons };
}

function keywordsConfirmedOnPage(lab: Lab, page: FetchRecord) {
  const text = page.text.replace(/[\s・･／/（）()[\]【】「」『』,，.。:：;；_-]+/g, "").toLowerCase();
  return Array.from(new Set(lab.keywords.filter((keyword) => {
    const normalized = keyword.replace(/[\s・･／/（）()[\]【】「」『』,，.。:：;；_-]+/g, "").toLowerCase();
    return normalized.length >= 2 && text.includes(normalized);
  }))).slice(0, 12);
}

function discoveryUrls(lab: Lab, source: NormalizedLab | undefined) {
  return Array.from(new Set([
    source?.url || "",
    source?.facultyPage || "",
    source?.researchmap || "",
    ...urlsIn(source?.notes),
  ].map(normalizeUrl).filter(Boolean)));
}

async function auditLab(lab: Lab): Promise<LabAudit> {
  const override = overrideById.get(lab.id);
  if (override) {
    const overridePage = override.publish === false ? null : await fetchPage(override.url);
    return {
      labId: lab.id,
      currentUrl: lab.official_url,
      acceptedUrl: override.publish === false ? null : normalizeUrl(override.url),
      evidenceUrl: normalizeUrl(override.evidenceUrl),
      outcome: override.publish === false ? "manual_hold" : "verified",
      confidence: override.publish === false ? 0 : 100,
      matchedKeywords: overridePage ? keywordsConfirmedOnPage(lab, overridePage) : [],
      reasons: [override.note],
    };
  }

  const source = normalizedByNo.get(labNo(lab));
  // data/labs.json で未確認扱いにした後も、元データに残る研究室URL候補を失わない。
  // URLはそのまま採用せず、以下の本文・責任者・研究室ページ判定を必ず通す。
  const currentUrl = normalizeUrl(lab.official_url) || normalizeUrl(source?.url);
  if (currentUrl) {
    const page = await fetchPage(currentUrl);
    const match = pageMatchScore(lab, page);
    const exactIdentity = match.reasons.some((reason) =>
      reason === "ページ本文に研究室名" || reason === "ページ本文に責任者名");
    const accepted = page.ok
      && presentsAsLabHomepage(page)
      && exactIdentity
      && match.score >= 7;
    if (accepted) {
      return {
        labId: lab.id,
        currentUrl,
        acceptedUrl: page.finalUrl,
        evidenceUrl: currentUrl,
        outcome: "verified",
        confidence: Math.min(100, 70 + Math.max(0, match.score) * 3),
        matchedKeywords: keywordsConfirmedOnPage(lab, page),
        reasons: ["既存URLを取得", ...match.reasons],
      };
    }
  }

  const pages = await Promise.all(discoveryUrls(lab, source).map((url) => fetchPage(url, true)));
  const candidates = pages
    .filter((page) => page.ok && page.links.length)
    .flatMap((page) => page.links.map((link) => candidateScore(lab, link, page.finalUrl)))
    .filter((candidate) => candidate.score >= 5)
    .sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    const page = await fetchPage(candidate.url);
    const match = pageMatchScore(lab, page);
    const combined = candidate.score + match.score;
    const anchorIdentity = candidate.reasons.some((reason) => reason.startsWith("リンクに研究室名") || reason.startsWith("リンクに責任者"));
    const pageIdentity = match.reasons.some((reason) => reason === "ページ本文に研究室名" || reason === "ページ本文に責任者名");
    if (page.ok && presentsAsLabHomepage(page) && combined >= 10 && (anchorIdentity || pageIdentity)) {
      return {
        labId: lab.id,
        currentUrl: currentUrl || null,
        acceptedUrl: page.finalUrl,
        evidenceUrl: candidate.evidenceUrl,
        outcome: "discovered",
        confidence: Math.min(99, 55 + combined * 3),
        matchedKeywords: keywordsConfirmedOnPage(lab, page),
        reasons: [...candidate.reasons, ...match.reasons],
      };
    }
  }
  return {
    labId: lab.id,
    currentUrl: currentUrl || null,
    acceptedUrl: null,
    evidenceUrl: discoveryUrls(lab, source)[0] || null,
    outcome: "unresolved",
    confidence: 0,
    matchedKeywords: [],
    reasons: ["研究室ホームページを確認できない"],
  };
}

async function pool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return output;
}

function qualityFor(lab: Lab, audit: LabAudit, duplicateOf?: string): LabQuality {
  const specificKeywords = audit.matchedKeywords.filter((keyword) => keyword.replace(/\s/g, "").length >= 4);
  const missingFields: string[] = [];
  if (!audit.acceptedUrl) missingFields.push("研究室ホームページ");
  if (!lab.pi.name) missingFields.push("責任者名");
  if (!specificKeywords.length) missingFields.push("具体的な研究キーワード");
  if (duplicateOf) missingFields.push("重複ページ");
  const contentLevel: LabQuality["contentLevel"] = lab.verified
    ? "verified"
    : specificKeywords.length >= 1 && audit.matchedKeywords.length >= 2
      ? "sourced"
      : "basic";
  const publicationLevel: LabQuality["publicationLevel"] = duplicateOf || !audit.acceptedUrl
    ? "hidden"
    : contentLevel === "basic"
      ? "review"
      : "sourced";
  return {
    publicationLevel,
    contentLevel,
    score: Math.max(0, Math.min(100,
      (audit.acceptedUrl ? 60 : 0)
      + (lab.pi.name ? 10 : 0)
      + (specificKeywords.length ? 15 : 0)
      + (audit.matchedKeywords.length >= 2 ? 10 : 0)
      + (lab.verified ? 5 : 0))),
    reviewStatus: audit.outcome === "manual_hold"
      ? "manually_researched"
      : audit.acceptedUrl
        ? "automated"
        : "needs_review",
    sourceKind: audit.acceptedUrl ? "lab_homepage" : "none",
    checkedAt: CHECKED_AT,
    missingFields,
    duplicateOf,
    notes: audit.reasons,
  };
}

function sourceList(audit: LabAudit): LabSource[] {
  if (!audit.acceptedUrl) return [];
  return [{ label: "研究室ホームページ", url: audit.acceptedUrl }];
}

function evidenceSummary(audit: LabAudit) {
  const keywords = audit.matchedKeywords.slice(0, 4);
  if (!keywords.length) return "研究室ホームページを確認しました。研究内容の詳しい整理は準備中です。最新情報は、元のページで確認してください。";
  return `研究室ホームページでは「${keywords.join("」「")}」が研究分野・キーワードとして示されています。研究対象や方法の詳細は、元のページで確認できます。`;
}

function pendingSummary() {
  return "研究室名・所属などの基礎情報を掲載しています。研究室ホームページと研究内容は現在確認中です。";
}

async function main() {
  const target = labs.slice(OFFSET, Number.isFinite(LIMIT) ? OFFSET + LIMIT : undefined);
  const rangeEnd = target.length ? OFFSET + target.length - 1 : OFFSET;
  console.log(`[audit] ${target.length}件 / range=${OFFSET}-${rangeEnd} / concurrency=${CONCURRENCY} / apply=${APPLY}`);
  const audits = await pool(target, CONCURRENCY, auditLab);
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(fetchCache));
  if (cacheWrites === 0) console.log(`[crawl] ${completedFetches} URL確認済み`);

  const acceptedById = new Map(audits.map((audit) => [audit.labId, audit]));
  const duplicateWinner = new Map<string, string>();
  const duplicateOf = new Map<string, string>();
  for (const lab of labs) {
    const key = [lab.university.name, lab.department, lab.name, lab.pi.name].join("\u0000");
    const winner = duplicateWinner.get(key);
    if (!winner) duplicateWinner.set(key, lab.id);
    else duplicateOf.set(lab.id, winner);
  }

  const aggregateIds = new Set(labs.filter((lab) => isAggregateLabName(lab.name)).map((lab) => lab.id));
  const updated = labs.map((lab) => {
    const audit = acceptedById.get(lab.id);
    if (!audit) return lab;
    const duplicate = duplicateOf.get(lab.id);
    const forceHold = aggregateIds.has(lab.id);
    const effectiveAudit = forceHold
      ? { ...audit, acceptedUrl: null, outcome: "manual_hold" as const, reasons: [...audit.reasons, "複数研究室をまとめた集合ページ"] }
      : audit;
    const quality = qualityFor(lab, effectiveAudit, duplicate);
    const homepageVerified = quality.sourceKind === "lab_homepage" && Boolean(effectiveAudit.acceptedUrl);
    const publishedStatus = lab.verified || lab.status === "claimed" ? "claimed" : "published";
    return {
      ...lab,
      sourceNo: labNo(lab),
      official_url: homepageVerified ? effectiveAudit.acceptedUrl : null,
      has_url: homepageVerified,
      sources: homepageVerified ? sourceList(effectiveAudit) : [],
      keywords: homepageVerified && effectiveAudit.matchedKeywords.length > 0
        ? effectiveAudit.matchedKeywords
        : lab.keywords,
      sections: {
        ...lab.sections,
        research_summary: homepageVerified ? evidenceSummary(effectiveAudit) : pendingSummary(),
      },
      status: publishedStatus,
      quality,
      last_updated: CHECKED_AT,
    } satisfies Lab;
  });

  let previousAudits: LabAudit[] = [];
  try {
    const previousReport = JSON.parse(fs.readFileSync(REPORT_FILE, "utf-8")) as { decisions?: LabAudit[] };
    previousAudits = previousReport.decisions || [];
  } catch {
    previousAudits = [];
  }
  const mergedById = new Map(previousAudits.map((audit) => [audit.labId, audit]));
  for (const audit of audits) mergedById.set(audit.labId, audit);
  const mergedAudits = labs.map((lab) => mergedById.get(lab.id)).filter((audit): audit is LabAudit => Boolean(audit));
  const counts = {
    input: mergedAudits.length,
    verified: mergedAudits.filter((item) => item.outcome === "verified" && item.acceptedUrl).length,
    discovered: mergedAudits.filter((item) => item.outcome === "discovered" && item.acceptedUrl).length,
    manualHold: mergedAudits.filter((item) => item.outcome === "manual_hold").length,
    unresolved: mergedAudits.filter((item) => item.outcome === "unresolved").length,
    duplicatePagesHeld: duplicateOf.size,
    aggregatePagesHeld: aggregateIds.size,
    publishable: updated.filter((lab) => lab.status === "published" || lab.status === "claimed").length,
  };
  const report = {
    generatedAt: `${CHECKED_AT}T00:00:00+09:00`,
    rule: "掲載停止対象を除く研究室ページは基礎情報を公開する。研究室名または責任者名との一致を確認できた研究室ホームページだけを外部リンクと内容整理に使用し、教員ページ・researchmap・部局一覧は代用しない。",
    counts,
    decisions: mergedAudits,
    unresolved: mergedAudits.filter((item) => !item.acceptedUrl),
    potentialDuplicateGroups: Array.from(
      labs.reduce((map, lab) => {
        const key = [lab.university.name, lab.department, lab.name].join("\u0000");
        map.set(key, [...(map.get(key) || []), lab.id]);
        return map;
      }, new Map<string, string[]>()),
    )
      .filter(([, ids]) => ids.length > 1)
      .map(([key, ids]) => ({ key: key.split("\u0000"), ids })),
  };
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  if (APPLY) fs.writeFileSync(LABS_FILE, JSON.stringify(updated));
  const batchCounts = {
    checked: audits.length,
    confirmed: audits.filter((item) => Boolean(item.acceptedUrl)).length,
    unresolved: audits.filter((item) => !item.acceptedUrl).length,
  };
  console.log(JSON.stringify({ batch: batchCounts, overall: counts }, null, 2));
}

await main();
