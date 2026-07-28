// SCR-11 問いをつくる（ADR-010）: 書く → 選ぶ → プラン の3駅ジャーニー。
// 生成は brief（焦点カード先行表示）→ candidates（4件）の2段。待ち時間は「読む時間」に変える。
// 問いを選んだ瞬間にプランを自動作成して /projects/:id へ遷移する（保存モーダルは無い）。
import { useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, Check, ChevronDown, Compass, LoaderCircle, Sparkles } from "lucide-react";
import type { NormalizedResearchMaterial, ProjectSourceMode, QuestionFreeInput, ResearchBrief, RQCandidate, Step1Response } from "../../shared/research-project";
import { api } from "../lib/api";
import { newActionId } from "../lib/session";
import { clearQuestionDraft, loadQuestionMaterials, materialTypeLabel, readQuestionDraft, writeQuestionDraft } from "../lib/questionMaterials";
import { useAccountAccess } from "../components/AccountAccess";
import { Button, Card, Chip, Disclosure, Skeleton, TrustNote } from "../components/ui";

const EMPTY_INPUT: QuestionFreeInput = { recentInterest: "", discomfort: "", graduateTopic: "", reason: "", referenceInfo: "", notes: "" };
const INPUTS: [keyof QuestionFreeInput, string, string][] = [
  ["recentInterest", "最近気になっていること", "ふと調べてしまうこと、繰り返し考えること"],
  ["discomfort", "日常や仕事で感じた違和感", "うまく説明できないモヤモヤでも構いません"],
  ["graduateTopic", "大学院で扱えたら面白そうなこと", "対象、場面、変えたいことなど"],
  ["reason", "なぜ気になるのか", "きっかけや自分との関係"],
  ["referenceInfo", "参考情報", "書籍、記事、URL、キーワードなど"],
  ["notes", "任意補足", "条件や避けたい方向など"],
];
const STATIONS = ["気になることを書く", "問いを選ぶ", "研究プラン"];
// 表示層の平易ラベル（docs/03 SCR-11）。R番号記号は画面に出さない
const RQ_TYPE_LABELS: Record<string, string> = {
  R1: "実態をしる", R2: "型に分ける", R3: "関係をしらべる", R4: "効果をたしかめる",
  R5: "過程を追う", R6: "意味をきく", R7: "考え方を組み立てる", R8: "仕組みを説明する",
  R9: "ものさしをつくる", R10: "方法をつくる", R11: "道具をつくる", R12: "研究を集めて整理する",
};
const typeLabel = (typeName: string) => RQ_TYPE_LABELS[typeName?.match(/^(R\d{1,2})/)?.[1] || ""] || typeName;

type BusyStage = "" | "materials" | "brief" | "candidates" | "outline";

export default function Questions() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const interestAnalysisId = searchParams.get("interestAnalysisId") || undefined;
  const restored = useMemo(() => readQuestionDraft(), []);
  const { access } = useAccountAccess();
  const [mode, setMode] = useState<ProjectSourceMode>(restored?.sourceMode || "free_input");
  const [freeInput, setFreeInput] = useState(restored?.freeInput || EMPTY_INPUT);
  const [materials, setMaterials] = useState<NormalizedResearchMaterial[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(restored?.selectedMaterialIds || []);
  const [brief, setBrief] = useState<ResearchBrief | null>(restored?.briefResponse || null);
  const [briefBy, setBriefBy] = useState<"ai" | "quality_fallback" | null>(restored?.briefGeneratedBy || null);
  const [step1, setStep1] = useState<Step1Response | null>(restored?.step1Response || null);
  const [selectedRq, setSelectedRq] = useState<RQCandidate | null>(restored?.selectedRq || null);
  const [busy, setBusy] = useState<BusyStage>("materials");
  const [error, setError] = useState<{ stage: "brief" | "candidates" | "outline"; message: string } | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // brief+candidatesで共有する価値操作ID（同一IDなら合計1消費・再送はサーバーの応答キャッシュが返る）
  const pairActionId = useRef<string>("");

  useEffect(() => {
    loadQuestionMaterials().then((items) => {
      setMaterials(items);
      const inherited = (searchParams.get("materialIds") || "").split(",").filter(Boolean);
      if (inherited.length) { setMode("saved_items"); setSelectedIds((current) => Array.from(new Set([...current, ...inherited.filter((id) => items.some((item) => materialKey(item) === id))]))); }
      const direction = searchParams.get("direction") || "";
      if (direction) setFreeInput((current) => current.recentInterest ? current : { ...current, recentInterest: direction });
    }).catch(() => setError({ stage: "brief", message: "保存したものを読み込めませんでした。通信状況を確認し、もう一度開いてください。" })).finally(() => setBusy(""));
  }, []);

  useEffect(() => {
    writeQuestionDraft({ sourceMode: mode, freeInput, selectedMaterialIds: selectedIds, materials: selectedMaterials(materials, selectedIds), briefResponse: brief, briefGeneratedBy: briefBy, step1Response: step1, selectedRq, step2Response: null, updatedAt: new Date().toISOString() });
  }, [mode, freeInput, selectedIds, materials, brief, briefBy, step1, selectedRq]);

  // 生成中の経過秒数（正直な進捗表示。偽のバーは置かない）
  useEffect(() => {
    if (busy !== "brief" && busy !== "candidates") { setElapsed(0); return; }
    const startedAt = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const chosenMaterials = useMemo(() => selectedMaterials(materials, selectedIds), [materials, selectedIds]);
  const prioritizedRqs = useMemo(() => prioritizeCandidates(step1?.output_type_proposals || []), [step1]);
  const enoughEvidence = mode === "free_input"
    ? Object.values(freeInput).some((value) => value.trim().length >= 8)
    : chosenMaterials.some((item) => item.officialDescription || item.officialQuestions?.length || item.excerpt || item.userReasonMemo);
  const focus = step1 || brief; // 焦点カードの中身（candidates完了後はstep1が正）
  const station = busy === "outline" ? 2 : step1 || busy === "candidates" || brief ? 1 : 0;
  const guestRemaining = !access.authenticated && access.remaining != null ? access.remaining : null;

  const runCandidates = async (sourceBrief: ResearchBrief, focusOverride?: { vertical_axis: string; question: string } | null) => {
    setBusy("candidates"); setError(null); setSelectedRq(null);
    try {
      const result = await api.generateQuestionCandidates({ freeInput, materials: chosenMaterials, brief: sourceBrief, focusOverride: focusOverride || null, actionId: pairActionId.current });
      setAiEnabled(result.aiEnabled);
      setStep1(result.step1);
      requestAnimationFrame(() => document.getElementById("rq-choices")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) {
      setError({ stage: "candidates", message: e instanceof Error ? e.message : "問いの候補を生成できませんでした。関心の整理は残っています。" });
    } finally { setBusy(""); }
  };

  const startGeneration = async () => {
    if (!enoughEvidence) { setError({ stage: "brief", message: "問いを作るには、この素材だけでは情報が足りません。気になった理由や、扱いたい違和感を追加してください。" }); return; }
    pairActionId.current = newActionId();
    setBusy("brief"); setError(null); setStep1(null); setSelectedRq(null); setBrief(null); setBriefBy(null);
    try {
      const result = await api.generateQuestionBrief({ sourceMode: mode, freeInput, materials: chosenMaterials, actionId: pairActionId.current });
      setAiEnabled(result.aiEnabled);
      setBrief(result.brief); setBriefBy(result.briefGeneratedBy);
      requestAnimationFrame(() => document.getElementById("focus-card")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      await runCandidates(result.brief);
    } catch (e) {
      setError({ stage: "brief", message: e instanceof Error ? e.message : "関心の整理に失敗しました。入力内容は残っています。もう一度お試しください。" });
      setBusy("");
    }
  };

  // 「別の見方」: briefを再利用してcandidatesだけ再生成（新しい1消費）
  const regenerateWithShift = async (shift: { new_domain: string; shifted_rq: string }) => {
    if (!focus || busy) return;
    pairActionId.current = newActionId();
    await runCandidates(focus, { vertical_axis: shift.new_domain, question: shift.shifted_rq });
  };

  const retryCandidates = async () => { if (focus) await runCandidates(focus); };

  const createPlan = async () => {
    if (!step1 || !selectedRq || busy) return;
    setBusy("outline"); setError(null);
    try {
      const { project } = await api.createPlanFromQuestion({ sourceMode: mode, freeInput, materials: chosenMaterials, selectedRq, step1, interestAnalysisId, actionId: newActionId() });
      clearQuestionDraft();
      navigate(`/projects/${project.id}`, { state: { justCreated: true } });
    } catch (e) {
      setError({ stage: "outline", message: e instanceof Error ? e.message : "研究プランを作成できませんでした。選んだ問いは残っています。" });
      setBusy("");
    }
  };

  return (
    <div className="question-page max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <Helmet><title>問いをつくる ｜ MISHIRU</title></Helmet>
      <header className="question-heading">
        <div><p className="eyebrow">問いをつくる</p><h1>気になることを、研究できる問いへ。</h1><p>まずは普段の言葉で書いてください。AIが問いの候補に整理します。</p></div>
        <Link to="/projects" className="question-library-link"><BookOpen className="w-4 h-4" />保存した研究プラン</Link>
      </header>

      {/* 3駅レール（ADR-010 J6）。現在地はライム＝選択の色 */}
      <nav className="journey-rail" aria-label="作成ステップ">
        {STATIONS.map((label, index) => (
          <span key={label} className={index === station ? "is-on" : index < station ? "is-done" : ""} aria-current={index === station ? "step" : undefined}>
            <b className="tnum">{String(index + 1).padStart(2, "0")}</b>{label}{index < station && <Check aria-hidden="true" />}
          </span>
        ))}
      </nav>

      <Card className="question-source-panel">
        <div className="segment-control">
          <button className={mode === "free_input" ? "active" : ""} onClick={() => setMode("free_input")}>気になることを書く</button>
          <button className={mode === "saved_items" ? "active" : ""} onClick={() => setMode("saved_items")}>保存したものを選ぶ</button>
        </div>
        {mode === "free_input" ? (
          <div className="question-input-grid">
            {INPUTS.slice(0, 1).map(([key, label, placeholder]) => <label key={key} className="question-primary-input"><span>{label}</span><textarea rows={4} value={freeInput[key]} placeholder={placeholder} onChange={(e) => setFreeInput({ ...freeInput, [key]: e.target.value })} /></label>)}
            <Disclosure className="question-optional-inputs" summary="もう少し詳しく書く（任意）" description="違和感や理由があると、問いの焦点がより明確になります">
              <div className="question-input-grid question-input-grid--optional">
                {INPUTS.slice(1).map(([key, label, placeholder]) => <label key={key}><span>{label}</span><textarea rows={key === "discomfort" ? 4 : 3} value={freeInput[key]} placeholder={placeholder} onChange={(e) => setFreeInput({ ...freeInput, [key]: e.target.value })} /></label>)}
              </div>
            </Disclosure>
          </div>
        ) : busy === "materials" ? <div className="grid md:grid-cols-2 gap-3"><Skeleton className="h-36"/><Skeleton className="h-36"/></div> : (
          <div>
            <p className="source-help">問いの材料を選んでください。複数選べます。</p>
            <div className="material-grid">{materials.map((item) => {
              const key = materialKey(item); const checked = selectedIds.includes(key);
              return <button key={key} className={`material-option ${checked ? "selected" : ""}`} onClick={() => setSelectedIds(toggle(selectedIds, key))}>
                <span className="material-check">{checked && <Check className="w-4 h-4" />}</span>
                <span><Chip tone="blue">{materialTypeLabel[item.sourceType] || item.sourceType}</Chip><strong>{item.title}</strong>
                {(item.excerpt || item.officialDescription) && <em>{item.excerpt || item.officialDescription}</em>}
                <small>{[item.userReaction, item.userReasonMemo, item.createdAt && new Date(item.createdAt).toLocaleDateString("ja-JP")].filter(Boolean).join(" ・ ")}</small>
                {item.url && <span className="material-url">{item.url}</span>}</span>
              </button>;
            })}</div>
          </div>
        )}
        {error?.stage === "brief" && <p className="form-error" role="alert">{error.message}</p>}
        <div className="panel-action panel-action--journey">
          <Button onClick={startGeneration} disabled={!!busy || !enoughEvidence}>
            {busy === "brief" || busy === "candidates" ? <><LoaderCircle className="w-4 h-4 animate-spin"/>問いをつくっています…</> : <><Sparkles className="w-4 h-4"/>問いの候補をつくる</>}
          </Button>
          {!enoughEvidence && !busy && <p className="cta-hint">一文でOK。20字くらいあると、問いがぐっと具体的になります。</p>}
          {guestRemaining != null && <p className="journey-remaining">無料であと<b className="tnum">{guestRemaining}</b>回つくれます</p>}
        </div>
      </Card>

      {interestAnalysisId && <TrustNote className="question-trust-note">整理した関心と、その根拠を使って問いを作ります。</TrustNote>}
      {aiEnabled === false && <TrustNote className="question-trust-note">AIを利用できないため、入力内容から作った下書きを表示します。</TrustNote>}

      {/* 第1段: 関心の輪郭（焦点カード）。生成が終わるまでの読み物であり、候補を選ぶための土台（ADR-010 J1） */}
      {busy === "brief" && (
        <section className="gen-stage" aria-live="polite">
          <p className="gen-stage__line"><LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true"/>関心の輪郭を読み取っています…（30秒ほど）<span className="tnum">{elapsed}秒</span></p>
          <Skeleton className="h-44" />
          <p className="gen-stage__note">入力と途中経過は、この端末に自動で残ります。</p>
        </section>
      )}

      {focus && busy !== "brief" && (
        <section id="focus-card" className="question-result-section">
          <Card className="focus-card">
            <div className="focus-card__head">
              <div><p className="eyebrow">問いの焦点</p><h2>あなたの関心を、こう捉えました</h2></div>
              <Chip tone={(step1?.generatedBy || briefBy) === "quality_fallback" ? "yellow" : "teal"}>{(step1?.generatedBy || briefBy) === "quality_fallback" ? "下書き" : "AIで作成"}</Chip>
            </div>
            <strong className="focus-card__core">{focus.source_synthesis.core_interest}</strong>
            <p className="focus-card__focus">{focus.source_synthesis.adopted_focus}</p>
            <div className="focus-card__cells">
              {([["対象", focus.decomposition.target], ["現象", focus.decomposition.phenomenon], ["場面・文脈", focus.decomposition.context]] as const).map(([label, value]) => value && (
                <div key={label} className="focus-cell"><small>{label}</small><p>{value}</p></div>
              ))}
            </div>
            <Disclosure summary="この焦点を選んだ理由（推測を含む）" description="使った材料のつながりと、AIの推測を分けて確認できます">
              <div className="source-synthesis__grid">
                <div><span>材料のつながり</span><ul>{focus.source_synthesis.material_connections.map((item) => <li key={item}>{item}</li>)}</ul></div>
                <div><span><Chip tone="yellow">推測</Chip> まだ確かめたいこと</span><ul>{[...focus.source_synthesis.assumptions, ...focus.source_synthesis.missing_information].map((item) => <li key={item}>{item}</li>)}</ul></div>
              </div>
              <div className="focus-position"><small>問いの位置づけ</small><p><b>{focus.research_map_position.domain_name}</b> ｜ {focus.research_map_position.vertical_axis} ｜ {focus.research_map_position.horizontal_axis}</p></div>
            </Disclosure>
            <div className="focus-shifts">
              <p className="focus-shifts__label"><Compass className="w-4 h-4" aria-hidden="true"/>別の見方から問いをつくり直す</p>
              <div className="focus-shifts__row">
                {focus.domain_shifts.map((shift, index) => (
                  <button key={`${shift.new_domain}-${index}`} type="button" className="shift-chip" disabled={!!busy}
                    title={busy ? "生成が終わったら選べます" : shift.shifted_rq}
                    onClick={() => regenerateWithShift(shift)}>{shift.new_domain}</button>
                ))}
              </div>
              <p className="focus-shifts__hint">{busy ? "生成が終わったら選べます。" : guestRemaining != null ? "選ぶと候補を作り直します（1回ぶんを使います）。" : "選ぶと、その方向で候補を作り直します。"}</p>
            </div>
          </Card>

          {/* 第2段: 候補スロット（生成中）→ 4枚の候補カード */}
          {busy === "candidates" && (
            <div className="gen-stage" aria-live="polite">
              <p className="gen-stage__line"><LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true"/>4つの問いを設計しています…（1分ほど）<span className="tnum">{elapsed}秒</span></p>
              <div className="rq-grid">{[0, 1, 2, 3].map((slot) => <Card key={slot} className="rq-slot"><Skeleton className="h-5 w-24"/><Skeleton className="h-7"/><Skeleton className="h-16"/><Skeleton className="h-4 w-40"/></Card>)}</div>
              <p className="gen-stage__note">上の「問いの焦点」を読みながらお待ちください。この画面を離れても、入力と焦点は残ります。</p>
            </div>
          )}
          {error?.stage === "candidates" && (
            <div className="form-error form-error--retry" role="alert"><p>{error.message}</p><Button variant="ghost" onClick={retryCandidates}>もう一度つくる（回数は減りません）</Button></div>
          )}

          {step1 && busy !== "candidates" && (
            <div id="rq-choices">
              {step1.generatedBy === "quality_fallback" && <div role="status"><TrustNote className="question-trust-note"><strong>問いの下書きを表示しています。</strong> 内容を確認し、必要に応じて書き直してください。</TrustNote></div>}
              {step1.generatedBy === "ai" && Boolean(step1.qualityReport?.repairedCount) && <div role="status">{step1.qualityReport?.warnings.map((warning) => <TrustNote className="question-trust-note" key={warning}>{warning}</TrustNote>)}</div>}
              <div className="rq-heading"><div><p className="eyebrow">おすすめの問い</p><h2>気になる問いを、ひとつ選ぶ</h2></div><span className="rq-heading__hint">カードを選ぶと、下に進むボタンが出ます</span></div>
              <div className="rq-grid">{prioritizedRqs.primary.map(({ rq, index }) => <QuestionCandidateCard key={rqId(rq, index)} rq={rq} selected={sameRq(selectedRq, rq)} onSelect={() => setSelectedRq(sameRq(selectedRq, rq) ? null : rq)} />)}</div>
              {prioritizedRqs.other.length > 0 && (
                <Disclosure className="other-rq-options" summary={`ほかの問い案（下書き・${prioritizedRqs.other.length}件）`} description="入力内容から機械的に組み立てた下書きです。型を変えて比べたいときに開いてください">
                  <div className="rq-grid">{prioritizedRqs.other.map(({ rq, index }) => <QuestionCandidateCard key={rqId(rq, index)} rq={rq} selected={sameRq(selectedRq, rq)} draft onSelect={() => setSelectedRq(sameRq(selectedRq, rq) ? null : rq)} />)}</div>
                </Disclosure>
              )}
            </div>
          )}
        </section>
      )}

      {/* 選んだ瞬間に出る下部固定バー（選択→操作の距離ゼロ）。押すとプランが即時に生まれる */}
      {selectedRq && step1 && !busy && (
        <div className="action-bar" role="region" aria-label="選んだ問い">
          <div className="action-bar__inner journey-action-bar">
            <div className="journey-action-bar__summary"><small>選んだ問い</small><p>{selectedRq.public_rq}</p></div>
            <Button className="action-bar__btn" onClick={createPlan}><ArrowRight className="w-4 h-4"/>この問いで研究プランをつくる</Button>
          </div>
        </div>
      )}
      {busy === "outline" && (
        <div className="action-bar" role="status"><div className="action-bar__inner journey-action-bar"><p className="gen-stage__line"><LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true"/>研究プランを準備しています…</p></div></div>
      )}
      {error?.stage === "outline" && <div className="form-error form-error--retry" role="alert"><p>{error.message}</p><Button variant="ghost" onClick={createPlan}>もう一度つくる</Button></div>}
    </div>
  );
}

function QuestionCandidateCard({ rq, selected, draft, onSelect }: { rq: RQCandidate; selected: boolean; draft?: boolean; onSelect: () => void }) {
  return <Card className={`rq-card ${selected ? "chosen" : ""}`} onClick={(event) => {
    if ((event.target as HTMLElement).closest("details, a, button, summary")) return;
    onSelect();
  }}>
    <div className="rq-card-top"><Chip tone={draft ? "yellow" : "blue"}>{draft ? "下書き" : typeLabel(rq.type_name)}</Chip>{!draft && rq.is_recommended && <span className="rq-reco">おすすめ</span>}</div>
    <h3>{rq.rq_title}</h3>
    <p className="rq-public">{rq.public_rq}</p>
    {rq.what_we_learn && <p className="rq-learn"><small>この問いで分かること</small>{rq.what_we_learn}</p>}
    <p className="rq-meta"><span><small>調べ方</small>{rq.methods}</span><span><small>取り組みやすさ</small>{rq.difficulty}</span></p>
    <details onClick={(event) => event.stopPropagation()}><summary>問いの組み立てと、専門向けの表現<ChevronDown/></summary><dl>
      {rq.components && <><Info label="対象" value={rq.components.target}/><Info label="着目する現象・概念" value={rq.components.focus}/><Info label="問う関係" value={rq.components.relationship}/><Info label="文脈・範囲" value={rq.components.context}/><Info label="必要な証拠" value={rq.components.evidence}/></>}
      <Info label="専門向けの研究の問い" value={rq.academic_rq}/><Info label="得られそうな成果" value={rq.expected_output}/>
      {rq.recommendation_reason && <Info label="おすすめの理由" value={rq.recommendation_reason}/>}</dl></details>
    <button type="button" className="rq-select" onClick={onSelect} aria-pressed={selected}>{selected ? <><Check className="w-4 h-4"/>選択中</> : "この問いを選ぶ"}</button>
  </Card>;
}

function prioritizeCandidates(candidates: RQCandidate[]) {
  const entries = candidates.map((rq, index) => ({ rq, index }));
  const primary = entries.filter(({ rq }) => rq.is_recommended).slice(0, 4);
  if (primary.length < Math.min(3, entries.length)) {
    primary.push(...entries.filter(({ index }) => !primary.some((item) => item.index === index)).slice(0, Math.min(3, entries.length) - primary.length));
  }
  const primaryIndexes = new Set(primary.map(({ index }) => index));
  return { primary, other: entries.filter(({ index }) => !primaryIndexes.has(index)) };
}
function materialKey(item: NormalizedResearchMaterial) { return `${item.sourceType}:${item.sourceId}`; }
function selectedMaterials(items: NormalizedResearchMaterial[], ids: string[]) { return items.filter((item) => ids.includes(materialKey(item))); }
function toggle(values: string[], value: string) { return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]; }
function rqId(rq: RQCandidate, index: number) { return `${index}:${rq.type_name}`; }
// 選択一致は参照でなく内容で判定する（localStorage復帰後はオブジェクト同一性が失われるため）
function sameRq(a: RQCandidate | null, b: RQCandidate) { return !!a && a.type_name === b.type_name && a.academic_rq === b.academic_rq; }
function Info({label,value}:{label:string;value:string}) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
