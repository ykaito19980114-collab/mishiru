// 受入テスト（docs/02 §7 AC-01〜10）。devサーバー起動中に実行。
// 実行: BASE=http://localhost:3100 npx tsx scripts/test-acceptance.ts
const BASE = process.env.BASE || "http://localhost:3100";

let pass = 0, fail = 0;
const results: string[] = [];
function check(id: string, cond: boolean, detail = "") {
  if (cond) { pass++; results.push(`✅ ${id} ${detail}`); }
  else { fail++; results.push(`❌ ${id} ${detail}`); }
}
const uuid = () => "t-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
async function j(path: string, opts?: RequestInit) {
  const res = await fetch(BASE + path, opts);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
const post = (path: string, body: unknown) => {
  const sessionId = String((body as { sessionId?: string } | null)?.sessionId || "admin");
  return j(path, { method: "POST", headers: { "Content-Type": "application/json", "x-mishiru-dev-user": `acceptance-${sessionId}` }, body: JSON.stringify(body) });
};
const guestPost = (path: string, body: unknown) => j(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function run() {
  // ---- AC-11: 未登録は価値操作5回まで、6回目で登録案内 ----
  const guestSid = uuid();
  const guestCard = (await j(`/api/cards?sessionId=${guestSid}&batch=1`)).body.cards[0];
  let guestResult: Awaited<ReturnType<typeof guestPost>> | null = null;
  for (let i = 0; i < 6; i++) guestResult = await guestPost("/api/card-actions", { actionId: uuid(), sessionId: guestSid, cardId: guestCard.id, action: "like" });
  check("AC-11", guestResult?.status === 403 && guestResult.body?.error?.code === "ACCOUNT_REQUIRED", "6回目で無料アカウント登録を案内");

  // ---- AC-12: 登録/ログイン後は匿名セッションを引き継ぎ、上限を解除 ----
  const authHeaders = { "Content-Type": "application/json", "x-mishiru-dev-user": `account-${guestSid}` };
  const linked = await j("/api/auth/link-session", { method: "POST", headers: authHeaders, body: JSON.stringify({ sessionId: guestSid }) });
  const afterLink = await j("/api/card-actions", { method: "POST", headers: authHeaders, body: JSON.stringify({ actionId: uuid(), sessionId: guestSid, cardId: guestCard.id, action: "save" }) });
  const linkedAccess = await j(`/api/access?sessionId=${guestSid}`, { headers: authHeaders });
  check("AC-12a", linked.status === 200 && linked.body.sessionId === guestSid, "匿名sessionIdをアカウントへ引き継ぐ");
  check("AC-12b", afterLink.status === 200 && linkedAccess.body.authenticated === true && linkedAccess.body.limit === null, "ログイン後は匿名上限を適用しない");
  const accountDelete = await j(`/api/me?sessionId=${guestSid}`, { method: "DELETE", headers: authHeaders });
  check("AC-13", accountDelete.status === 200 && accountDelete.body.accountDeleted === true, "本人確認済みの退会処理でアカウントデータを削除");

  // ---- AC-01: 初回10枚評価 → プロファイル＋候補研究室 ----
  const sid = uuid();
  const { body: cardsRes } = await j(`/api/cards?sessionId=${sid}&batch=12`);
  const cards = cardsRes.cards;
  check("AC-01a", cards.length >= 10, `カード${cards.length}枚取得`);
  for (let i = 0; i < 10; i++) {
    await post("/api/card-actions", { actionId: uuid(), sessionId: sid, cardId: cards[i].id, action: i % 3 === 0 ? "save" : "like" });
  }
  const { body: prof } = await j(`/api/profile?sessionId=${sid}`);
  check("AC-01b", prof.ready === true && !!prof.profile, "10枚評価でプロファイル生成");
  check("AC-01c", Array.isArray(prof.candidates) && prof.candidates.length > 0, `候補研究室${prof.candidates?.length}件`);
  check("AC-01d", /傾向/.test(prof.profile?.summary || ""), "断定でなく傾向表現(FR-PROF-02)");

  // ---- AC-09: 候補に接続理由（保存カードとの対応） ----
  check("AC-09", prof.candidates?.[0]?.reasons?.length > 0 && /保存|気になる/.test(prof.candidates[0].reasons[0]), "接続理由に保存カード参照");

  // ---- AC-07: 再訪で履歴復元 ----
  const { body: actions } = await j(`/api/card-actions?sessionId=${sid}`);
  check("AC-07", actions.actions.length === 10, `評価履歴${actions.actions.length}件が復元可能`);

  // ---- AC-10: 冪等性（同一actionIdは1件） ----
  const aid = uuid();
  const sid2 = uuid();
  const c0 = (await j(`/api/cards?sessionId=${sid2}&batch=1`)).body.cards[0];
  await post("/api/card-actions", { actionId: aid, sessionId: sid2, cardId: c0.id, action: "like" });
  const dup = await post("/api/card-actions", { actionId: aid, sessionId: sid2, cardId: c0.id, action: "like" });
  check("AC-10", dup.body.duplicate === true && dup.body.evaluatedCount === 1, "二重送信が1件");

  // ---- AC-02: 研究室ページに出典・更新日・修正依頼（必須項目 or 未確認） ----
  const { body: labsRes } = await j(`/api/labs?sessionId=${sid}&limit=1`);
  const labId = labsRes.data[0].id;
  const { body: labRes } = await j(`/api/labs/${labId}?sessionId=${sid}`);
  const lab = labRes.lab;
  check("AC-02a", "sources" in lab && "last_updated" in lab, "出典・最終更新日フィールドあり");
  check("AC-02b", "sections" in lab && Object.keys(lab.sections).length === 9, "必須項目(9セクション+概要)構造");
  check("AC-02c", lab.confidence === "public_info" || lab.confidence === "verified", "確度表示あり");

  // ---- FR-LAB-01: 未確認項目はnull（フロントで「未確認」表示） ----
  check("FR-LAB-01", lab.sections.daily_life === null || typeof lab.sections.daily_life === "string", "未確認項目はnullで返る");

  // ---- AC-03: Claim受付 → 記録 ----
  const claim = await post("/api/claims", { type: "fix", labId, name: "テスト", affiliation: "大学", email: "t@example.com", message: "修正希望" });
  check("AC-03", claim.body.ok === true && !!claim.body.id, `Claim受付 id=${claim.body.id}`);

  // ---- AC-04: 診断レポート（LLM未設定→テンプレ） ----
  const rep = await post("/api/admin/reports/generate", { labId });
  check("AC-04", !!rep.body.report?.content && rep.body.report.generatedBy === "template", "テンプレでレポート生成(FR-REPORT-02)");
  check("AC-04b", /想定|カード接続|接続/.test(rep.body.report.content), "想定カード接続を含む");

  // ---- AC-05: 外部データ不能でも破綻しない（=常時JSONストアで200） ----
  check("AC-05", labRes && lab && labsRes.data.length > 0, "外部API未接続でも研究室表示が成立");

  // ---- AC-08: リード次アクション日必須 ----
  const noDate = await post("/api/admin/leads", { university: "京大", labName: "テスト研" });
  check("AC-08a", noDate.status === 400, "次アクション日なしは拒否");
  const withDate = await post("/api/admin/leads", { university: "京大", labName: "テスト研", nextActionDate: "2026-07-20", nextAction: "初回" });
  check("AC-08b", !!withDate.body.lead?.id, "次アクション日ありで登録");

  // ---- FR-MATCH-02: カード関連研究室0件でも近いカードで行き止まりにしない ----
  const { body: cd } = await j(`/api/cards/${cards[0].id}?sessionId=${sid}`);
  check("FR-MATCH-02", (cd.relatedLabs.length > 0) || (cd.nearbyCards.length > 0), "関連研究室 or 近接カードあり");

  // ---- AC-06: セッション削除 ----
  const del = await j(`/api/me?sessionId=${sid}`, { method: "DELETE" });
  check("AC-06a", del.body.ok === true && del.body.deleted.actions === 10, `削除 actions=${del.body.deleted.actions}`);
  const { body: after } = await j(`/api/card-actions?sessionId=${sid}`);
  check("AC-06b", after.actions.length === 0, "削除後は履歴0件");

  // ---- STATE-02: 記事差戻し（professor_review→editing）は理由必須 ----
  const art = await post("/api/admin/articles", { labName: "テスト研", title: "テスト記事" });
  const artId = art.body.article.id;
  const patch = (body: unknown) => j(`/api/admin/articles/${artId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  await patch({ status: "professor_review" }); // 教授確認へ
  const noReason = await patch({ status: "editing" }); // 差戻し・理由なし → 拒否
  check("STATE-02a", noReason.status === 400, "差戻しは理由なしで拒否");
  const withReason = await patch({ status: "editing", returnReason: "表現の修正が必要" });
  check("STATE-02b", withReason.status === 200 && withReason.body.article.returnReason === "表現の修正が必要", "理由ありで差戻し成功");

  // ---- Test-PROH-03: 自由口コミ投稿APIが存在しない ----
  const review = await post("/api/reviews", { text: "口コミ" });
  check("PROH-03", review.status === 404, "口コミ投稿APIは存在しない(404)");

  // ---- FR-NAME-01: 氏名に「（教員）」等のゴミが残っていない ----
  const { body: labList } = await j(`/api/labs?limit=100`);
  const dirty = labList.data.filter((l: any) => /（|\(|教員|准教授|研究室$/.test(l.pi?.name || ""));
  check("FR-NAME-01", dirty.length === 0, `氏名クレンジング（ゴミ${dirty.length}件）`);

  // ---- FR-SEARCH-AI: 自然文で研究室が返る＋解釈が可視化される ----
  const searchSid = uuid();
  const { body: ai } = await j(`/api/labs/smart?q=${encodeURIComponent("宇宙とロボット")}&sessionId=${searchSid}`, { headers: { "x-mishiru-dev-user": `acceptance-${searchSid}` } });
  check("FR-SEARCH-AI-a", ai.data?.length > 0 && ai.total > 0, `AI検索ヒット${ai.total}件`);
  check("FR-SEARCH-AI-b", (ai.interpreted?.keywords?.length > 0 || ai.interpreted?.fieldLabels?.length > 0), "解釈（分野/キーワード）を返す");
  check("FR-SEARCH-AI-c", /宇宙|ロボット/.test(ai.data?.[0]?.name || "") || ai.data?.[0]?.keywords?.some((k: string) => /宇宙|ロボット/.test(k)), "上位結果が入力に関連");

  // ---- FR-LABCARD/FR-CACHE: 研究室カードデッキ（ADR-005） ----
  const sidL = uuid();
  const t0 = Date.now();
  const { body: deck1 } = await j(`/api/lab-cards?sessionId=${sidL}&batch=8`);
  check("FR-LABCARD-01a", deck1.cards?.length === 8, `デッキ8枚取得（${Date.now() - t0}ms）`);
  check("FR-LABCARD-01b", deck1.cards.every((c: any) => c.title && c.summary && c.lab?.id), "カード文面＋研究室情報を含む");
  check("FR-LABCARD-01c", deck1.cards.every((c: any) => Array.isArray(c.questions) && c.questions.length >= 1), "「この分野が挑む問い」を含む");
  // 7日キャッシュ：同一セッション再取得＋別セッション初回（週次共有ウィンドウで同じ8枚→キャッシュ命中）
  const t1 = Date.now();
  await j(`/api/lab-cards?sessionId=${sidL}&batch=8`);
  const sameMs = Date.now() - t1;
  const t2 = Date.now();
  const { body: deckOther } = await j(`/api/lab-cards?sessionId=${uuid()}&batch=8`);
  const otherMs = Date.now() - t2;
  const sameLabs = deckOther.cards.every((c: any) => deck1.cards.some((p: any) => p.labId === c.labId));
  check("FR-CACHE-01a", sameMs < 1500, `同一セッション再取得 ${sameMs}ms`);
  check("FR-CACHE-01b", otherMs < 1500 && sameLabs, `別セッション初回 ${otherMs}ms（共有ウィンドウで同一デッキ→キャッシュ命中）`);
  // 評価10枚（2バッチ）→ プロファイル・候補（研究室評価のみで成立）
  let posted = 0;
  for (const c of deck1.cards) {
    await post("/api/lab-card-actions", { actionId: uuid(), sessionId: sidL, cardId: undefined, labId: c.labId, action: posted % 2 ? "like" : "save" });
    posted++;
  }
  const { body: deck2 } = await j(`/api/lab-cards?sessionId=${sidL}&batch=8`);
  check("FR-LABCARD-02a", deck2.cards.every((c: any) => !deck1.cards.some((p: any) => p.labId === c.labId)), "評価済み研究室はデッキから除外");
  for (const c of deck2.cards.slice(0, 2)) {
    await post("/api/lab-card-actions", { actionId: uuid(), sessionId: sidL, labId: c.labId, action: "like" });
    posted++;
  }
  const { body: profL } = await j(`/api/profile?sessionId=${sidL}`);
  check("FR-LABCARD-02b", profL.ready === true && profL.candidates?.length > 0, `研究室評価${posted}枚でプロファイル＋候補${profL.candidates?.length}件`);
  check("FR-LABCARD-02c", profL.profile?.orientationLabel === "", "テーマ評価なし時は基礎/応用を出さない");

  // ---- FR-PROF-03: プロフィール拡充（extras） ----
  const ex = profL.extras;
  check("FR-PROF-03a", ex && (ex.likedLabs.length + ex.savedLabs.length) === 10, `リアクション研究室一覧（気になる${ex?.likedLabs?.length}+保存${ex?.savedLabs?.length}）`);
  check("FR-PROF-03b", Array.isArray(ex?.questions) && ex.questions.length >= 3 && ex.questions.every((q: any) => q.text), `興味を持ちそうな問い${ex?.questions?.length}件（研究室リンク付き）`);
  check("FR-PROF-03c", Array.isArray(ex?.areaBreakdown) && ex.areaBreakdown.length > 0 && ex.areaBreakdown.every((a: any) => a.label && a.share >= 0 && "labCount" in a), "分野内訳（比率＋研究室数）");
  check("FR-PROF-03d", ex?.stats?.evaluated === 10 && typeof profL.profileQuery === "string" && profL.profileQuery.length > 0, `探索ログstats＋profileQuery="${(profL.profileQuery || "").slice(0, 24)}…"`);
  // 未生成セッションでもextras（一覧）は返る
  const { body: profNR } = await j(`/api/profile?sessionId=${uuid()}`);
  check("FR-PROF-03e", profNR.ready === false && profNR.extras && Array.isArray(profNR.extras.likedLabs), "未生成時もextras構造を返す");
  // 冪等性＋保存タブ
  const dupA = uuid();
  await post("/api/lab-card-actions", { actionId: dupA, sessionId: sidL, labId: deck2.cards[2].labId, action: "save" });
  const dupRes = await post("/api/lab-card-actions", { actionId: dupA, sessionId: sidL, labId: deck2.cards[2].labId, action: "save" });
  check("FR-LABCARD-02d", dupRes.body.duplicate === true, "研究室アクションの冪等性");
  const { body: savedL } = await j(`/api/saved?sessionId=${sidL}`);
  check("FR-LABCARD-02e", savedL.savedLabs?.length >= 4, `保存タブに研究室${savedL.savedLabs?.length}件`);

  // ---- FR-LABCARD-04: デッキのAI検索モード・傾向モード ----
  const { body: deckQ } = await j(`/api/lab-cards?sessionId=${uuid()}&q=${encodeURIComponent("宇宙とロボット")}`);
  check("FR-LABCARD-04a", deckQ.mode === "search" && deckQ.cards?.length > 0 && (deckQ.interpreted?.keywords?.length > 0 || deckQ.interpreted?.fieldLabels?.length > 0),
    `AI検索デッキ（${deckQ.cards?.length}枚・${deckQ.totalMatched}件ヒット・解釈可視化）`);
  // 傾向モード：未生成→フォールバック
  const { body: deckNP } = await j(`/api/lab-cards?sessionId=${uuid()}&mode=profile`);
  check("FR-LABCARD-04b", deckNP.mode === "default" && deckNP.profileReady === false, "傾向未生成時は既定デッキへフォールバック");
  // 傾向モード：生成済み（sidLは10件評価済み）
  const { body: deckP } = await j(`/api/lab-cards?sessionId=${sidL}&mode=profile`);
  check("FR-LABCARD-04c", deckP.mode === "profile" && deckP.profileReady === true && deckP.cards?.length > 0 && Array.isArray(deckP.profileTop) && typeof deckP.profileQuery === "string",
    `傾向デッキ（${deckP.cards?.length}枚・傾向=${(deckP.profileTop || []).join("/")}）`);
  check("FR-LABCARD-04d", deckP.cards.every((c: any) => !deck1.cards.some((p: any) => p.labId === c.labId)), "傾向デッキも評価済みを除外");
  await j(`/api/me?sessionId=${sidL}`, { method: "DELETE" }); // 後始末

  // ---- 公式サイトURL：official_urlを持つ研究室はAPIで必ず返す（ページに常設掲載） ----
  const { body: urlLab } = await j(`/api/labs?has_url=true&limit=1`);
  const { body: urlDetail } = await j(`/api/labs/${urlLab.data[0].id}`);
  check("LAB-URL-01", typeof urlDetail.lab.official_url === "string" && urlDetail.lab.official_url.startsWith("http"), "公式サイトURLが研究室ページに供給される");

  // ---- FR-ENRICH: 研究室ページの充実（AIガイド＋論文の二段構え・信頼ゲート） ----
  const { body: en244 } = await j(`/api/labs/lab-244/enrich`); // 藤田桂英/情報AI
  check("FR-ENRICH-01", !!en244.aiGuide?.overview && Array.isArray(en244.aiGuide?.questions), "AI学生ガイド生成");
  check("FR-ENRICH-02a", en244.papers?.length > 0 && ["matched", "name_only"].includes(en244.papersConfidence), `著者一致の論文をin-app提供（${en244.papers?.length}件）`);
  // 誤同定ゲート：藤本聡(物理・共通名)は著者断定せず、関連論文モードにフォールバック
  const { body: en1 } = await j(`/api/labs/lab-1/enrich`);
  check("FR-ENRICH-02b", en1.papersConfidence !== "matched" && en1.papersConfidence !== "name_only", `共通名は著者断定しない（mode=${en1.papersConfidence}）`);
  check("FR-ENRICH-02c", (en1.papers || []).every((p: any) => !/knee|arthroscop|surgery/i.test(p.title)), "誤同定論文（膝手術等）を出さない");
  // 全ページ掲出：著者特定できない研究室でもキーワード関連論文で埋め込みが成立
  const { body: enRand } = await j(`/api/labs/lab-1000/enrich`);
  check("FR-ENRICH-02d", (en1.papers?.length > 0 || enRand.papers?.length > 0), `関連論文フォールバックで掲出（lab-1:${en1.papers?.length}件/lab-1000:${enRand.papers?.length}件）`);
  check("FR-ENRICH-03", "aiGuide" in en244 && "papers" in en244, "enrichは常に構造を返す（失敗時も画面を壊さない）");

  console.log(results.join("\n"));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}
run().catch((e) => { console.error("テスト実行エラー:", e); process.exit(1); });
