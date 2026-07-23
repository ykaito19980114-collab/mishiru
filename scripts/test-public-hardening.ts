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
check(labs.response.status === 200 && labs.body?.total === 5893, "掲載停止依頼を除く確認済み研究室5,893件だけを一覧へ掲載する");

const heldLab = await json("/api/labs/lab-4");
check(heldLab.response.status === 404, "未確認研究室は直接URLでも表示しない");

for (const suppressedLabId of ["lab-874", "lab-1291", "lab-6736", "lab-8036", "lab-10504", "lab-12172", "lab-12280", "lab-13850"]) {
  const suppressedLab = await json(`/api/labs/${suppressedLabId}`);
  check(suppressedLab.response.status === 404, `掲載停止依頼済みの${suppressedLabId}を表示しない`);
}

const sitemap = await fetch(`${BASE}/sitemap.xml`);
const sitemapBody = await sitemap.text();
check(!sitemapBody.includes("/labs/lab-4</loc>"), "未確認研究室をサイトマップへ載せない");
for (const suppressedLabId of ["lab-874", "lab-1291", "lab-6736", "lab-8036", "lab-10504", "lab-12172", "lab-12280", "lab-13850"]) {
  check(!sitemapBody.includes(`/labs/${suppressedLabId}</loc>`), `掲載停止依頼済みの${suppressedLabId}をサイトマップへ載せない`);
}

console.log(`Public hardening tests: ${passed} passed`);
