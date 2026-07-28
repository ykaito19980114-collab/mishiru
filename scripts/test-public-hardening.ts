const BASE = process.env.BASE || "http://localhost:3100";
let passed = 0;
function check(value: unknown, label: string) { if (!value) throw new Error(`FAIL: ${label}`); passed += 1; console.log(`PASS ${label}`); }

async function json(path: string, init?: RequestInit) {
  const response = await fetch(`${BASE}${path}`, init);
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

const unknown = await json("/api/does-not-exist");
check(unknown.response.status === 404 && unknown.body?.error?.code === "NOT_FOUND", "未定義APIをJSON 404で返す");

const invalid = await json("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
check(invalid.response.status === 400 && invalid.body?.error?.code === "INVALID_JSON", "壊れたJSONを安全な400で返す");

const oversized = await json("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: "x".repeat(1_100_000) }) });
check(oversized.response.status === 413 && oversized.body?.error?.code === "PAYLOAD_TOO_LARGE", "巨大な入力を413で止める");

const event = await json("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: "security-test-session", events: [{ type: "admin_override", payload: { secret: "x" } }] }) });
check(event.response.status === 200 && event.body?.accepted === 0, "許可していない計測イベントを保存しない");

const honeypot = await json("/api/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ website: "https://bot.example", name: "bot", email: "bot@example.com", message: "spam" }) });
check(honeypot.response.status === 200 && honeypot.body?.ok === true, "自動投稿を静かに破棄する");

const aiConfig = await json("/api/ai/config");
check([401, 503].includes(aiConfig.response.status) && !aiConfig.body?.models, "AI設定を公開しない");

const health = await fetch(`${BASE}/api/health`);
check(health.headers.get("cache-control")?.includes("no-store") && Boolean(health.headers.get("x-request-id")), "APIをキャッシュせずリクエストIDを付ける");

const labs = await json("/api/labs?limit=1");
check(labs.response.status === 200 && labs.body?.total === 5897, "掲載停止依頼を除く確認済み研究室5,897件だけを一覧へ掲載する");

const namedSearch = await json(`/api/labs/smart?q=${encodeURIComponent("兵庫県立大学 古賀")}&sessionId=public-hardening-search`);
check(namedSearch.response.status === 200
  && namedSearch.body?.mode === "name"
  && namedSearch.body?.total === 1
  && namedSearch.body?.data?.[0]?.id === "lab-1234", "大学名と教員名から該当研究室を検索する");

const kohnoSearch = await json(`/api/labs/smart?q=${encodeURIComponent("河野 晴彦")}&sessionId=public-hardening-kohno-search`);
check(kohnoSearch.response.status === 200
  && kohnoSearch.body?.mode === "name"
  && kohnoSearch.body?.total === 1
  && kohnoSearch.body?.data?.[0]?.id === "lab-10520", "河野晴彦准教授の氏名から研究室を検索できる");

const yoshimuraSearch = await json(`/api/labs/smart?q=${encodeURIComponent("奈良女子大学 吉村倫一")}&sessionId=public-hardening-yoshimura-search`);
check(yoshimuraSearch.response.status === 200
  && yoshimuraSearch.body?.mode === "name"
  && yoshimuraSearch.body?.total === 1
  && yoshimuraSearch.body?.data?.[0]?.id === "lab-15282", "吉村倫一教授の氏名から吉村研究室を検索できる");

const kawaiSearch = await json(`/api/labs/smart?q=${encodeURIComponent("奈良女子大学 河合里紗")}&sessionId=public-hardening-kawai-search`);
check(kawaiSearch.response.status === 200
  && kawaiSearch.body?.mode === "name"
  && kawaiSearch.body?.total === 1
  && kawaiSearch.body?.data?.[0]?.id === "lab-15282", "河合里紗助教の氏名から吉村研究室を検索できる");

const kohnoEnrichment = await json("/api/labs/lab-10520/enrich");
check(kohnoEnrichment.response.status === 200
  && kohnoEnrichment.body?.aiGuide === null
  && Array.isArray(kohnoEnrichment.body?.papers)
  && kohnoEnrichment.body.papers.length === 0, "河野研究室でAI推測と同姓同名論文の自動表示を止める");

const tamakiLab = await json("/api/labs/lab-11748");
check(
  tamakiLab.response.status === 200
    && tamakiLab.body?.lab?.google_scholar_url === "https://scholar.google.co.jp/citations?user=AsO4n6gAAAAJ&hl=ja&oi=sra",
  "玉木先生本人から連絡されたGoogle Scholarプロフィールを返す",
);

const heldLab = await json("/api/labs/lab-4");
check(heldLab.response.status === 404, "未確認研究室は直接URLでも表示しない");

for (const suppressedLabId of ["lab-874", "lab-1291", "lab-6736", "lab-8036", "lab-10504", "lab-12172", "lab-12280", "lab-13850", "lab-3346", "lab-42", "lab-4751", "lab-8525", "lab-15283"]) {
  const suppressedLab = await json(`/api/labs/${suppressedLabId}`);
  check(suppressedLab.response.status === 404, `掲載停止依頼済みの${suppressedLabId}を表示しない`);
}
for (const [suppressedLabId, query] of [
  ["lab-42", "京都大学 木上淳"],
  ["lab-4751", "慶應義塾大学 志澤一之"],
  ["lab-8525", "熊本大学 佐久川貴志"],
  ["lab-3346", "京都大学 阿久津達也"],
] as const) {
  const search = await json(`/api/labs/smart?q=${encodeURIComponent(query)}&sessionId=removed-lab-search`);
  check(
    !search.body?.data?.some((lab: { id?: string }) => lab.id === suppressedLabId),
    `掲載停止依頼済みの${suppressedLabId}を検索結果へ載せない`,
  );
}

const sitemap = await fetch(`${BASE}/sitemap.xml`);
const sitemapBody = await sitemap.text();
check(!sitemapBody.includes("/labs/lab-4</loc>"), "未確認研究室をサイトマップへ載せない");
for (const suppressedLabId of ["lab-874", "lab-1291", "lab-6736", "lab-8036", "lab-10504", "lab-12172", "lab-12280", "lab-13850", "lab-3346", "lab-42", "lab-4751", "lab-8525", "lab-15283"]) {
  check(!sitemapBody.includes(`/labs/${suppressedLabId}</loc>`), `掲載停止依頼済みの${suppressedLabId}をサイトマップへ載せない`);
}

console.log(`Public hardening tests: ${passed} passed`);
