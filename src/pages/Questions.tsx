import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, Check, ChevronDown, ExternalLink, Layers, LoaderCircle, RotateCcw, Save, Sparkles } from "lucide-react";
import type { NormalizedResearchMaterial, ProjectSourceMode, QuestionFreeInput, ResearchProject, RQCandidate, Step1Response, Step2Response } from "../../shared/research-project";
import { api } from "../lib/api";
import { clearQuestionDraft, loadQuestionMaterials, materialTypeLabel, readQuestionDraft, writeQuestionDraft } from "../lib/questionMaterials";
import { Button, Card, Chip, Disclosure, ErrorState, Skeleton } from "../components/ui";

const EMPTY_INPUT: QuestionFreeInput = { recentInterest: "", discomfort: "", graduateTopic: "", reason: "", referenceInfo: "", notes: "" };
const INPUTS: [keyof QuestionFreeInput, string, string][] = [
  ["recentInterest", "最近気になっていること", "ふと調べてしまうこと、繰り返し考えること"],
  ["discomfort", "日常や仕事で感じた違和感", "うまく説明できないモヤモヤでも構いません"],
  ["graduateTopic", "大学院で扱えたら面白そうなこと", "対象、場面、変えたいことなど"],
  ["reason", "なぜ気になるのか", "きっかけや自分との関係"],
  ["referenceInfo", "参考情報", "書籍、記事、URL、キーワードなど"],
  ["notes", "任意補足", "条件や避けたい方向など"],
];

export default function Questions() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const interestAnalysisId = searchParams.get("interestAnalysisId") || undefined;
  const restored = useMemo(() => readQuestionDraft(), []);
  const [mode, setMode] = useState<ProjectSourceMode>(restored?.sourceMode || "free_input");
  const [freeInput, setFreeInput] = useState(restored?.freeInput || EMPTY_INPUT);
  const [materials, setMaterials] = useState<NormalizedResearchMaterial[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(restored?.selectedMaterialIds || []);
  const [step1, setStep1] = useState<Step1Response | null>(restored?.step1Response || null);
  const [selectedRq, setSelectedRq] = useState<RQCandidate | null>(restored?.selectedRq || null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [openDomainShift, setOpenDomainShift] = useState<number | null>(null);
  const [step2, setStep2] = useState<Step2Response | null>(restored?.step2Response || null);
  const [busy, setBusy] = useState<"materials" | "step1" | "step2" | "save" | "">("materials");
  const [error, setError] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [title, setTitle] = useState(selectedRq?.public_rq || step2?.research_outline.main_rq || "");
  const [subtitle, setSubtitle] = useState(step2?.research_outline.title_public || "");
  const [status, setStatus] = useState<"draft" | "consultation" | "on_hold">("draft");
  const [preset, setPreset] = useState("electric");
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [existingProjects,setExistingProjects]=useState<ResearchProject[]>([]); const [targetProjectId,setTargetProjectId]=useState("");

  useEffect(() => {
    loadQuestionMaterials().then((items) => {
      setMaterials(items);
      const inherited = (searchParams.get("materialIds") || "").split(",").filter(Boolean);
      if (inherited.length) { setMode("saved_items"); setSelectedIds((current) => Array.from(new Set([...current, ...inherited.filter((id) => items.some((item) => materialKey(item) === id))]))); }
      const direction = searchParams.get("direction") || "";
      if (direction) setFreeInput((current) => current.recentInterest ? current : { ...current, recentInterest: direction });
    }).catch(() => setError("保存素材を読み込めませんでした。")).finally(() => setBusy(""));
  }, []);

  useEffect(() => {
    writeQuestionDraft({ sourceMode: mode, freeInput, selectedMaterialIds: selectedIds, materials: selectedMaterials(materials, selectedIds), step1Response: step1, selectedRq, step2Response: step2, updatedAt: new Date().toISOString() });
  }, [mode, freeInput, selectedIds, materials, step1, selectedRq, step2]);
  useEffect(()=>{if(saveOpen)api.getProjects().then((result)=>setExistingProjects(result.projects)).catch(()=>setExistingProjects([]));},[saveOpen]);

  const chosenMaterials = useMemo(() => selectedMaterials(materials, selectedIds), [materials, selectedIds]);
  const prioritizedRqs = useMemo(() => prioritizeCandidates(step1?.output_type_proposals || []), [step1]);
  const enoughEvidence = mode === "free_input"
    ? Object.values(freeInput).some((value) => value.trim().length >= 8)
    : chosenMaterials.some((item) => item.officialDescription || item.officialQuestions?.length || item.excerpt || item.userReasonMemo);

  const generateStep1 = async () => {
    if (!enoughEvidence) { setError("この素材だけでは、研究の問いを作るための情報が不足しています。気になった理由や、扱いたい違和感を追加してください。"); return; }
    setBusy("step1"); setError(""); setStep2(null); setSelectedRq(null);
    try {
      const result = await api.generateQuestionStep1({ sourceMode: mode, freeInput, materials: chosenMaterials });
      setAiEnabled(result.aiEnabled);
      setStep1(result.step1);
      requestAnimationFrame(() => document.getElementById("question-step1")?.scrollIntoView({ behavior: "smooth" }));
    } catch (e) { setError(e instanceof Error ? e.message : "Step 1を生成できませんでした。"); }
    finally { setBusy(""); }
  };

  const generateStep2 = async () => {
    if (!step1 || !selectedRq) return;
    setBusy("step2"); setError("");
    try {
      const result = await api.generateQuestionStep2({ freeInput, selectedRq, step1 });
      setAiEnabled(result.aiEnabled);
      setStep2(result.step2); setTitle(selectedRq.public_rq || result.step2.research_outline.main_rq); setSubtitle(result.step2.research_outline.title_public);
      requestAnimationFrame(() => document.getElementById("question-step2")?.scrollIntoView({ behavior: "smooth" }));
    } catch (e) { setError(e instanceof Error ? e.message : "Step 2を生成できませんでした。"); }
    finally { setBusy(""); }
  };

  const saveProject = async () => {
    if (!step1 || !step2 || !selectedRq) return;
    setBusy("save"); setError("");
    try {
      if(targetProjectId){const {project}=await api.updateProject(targetProjectId,{sourceMode:mode,freeInput,relatedMaterialIds:chosenMaterials.map((item)=>item.sourceId),sourceMaterials:chosenMaterials,step1Response:step1,rqCandidates:step1.output_type_proposals,selectedRq,step2Response:step2,interestAnalysisId});clearQuestionDraft();navigate(`/projects/${project.id}`);}
      else{const { project } = await api.createProject({ displayTitle: title, subtitle, status, sourceMode: mode, freeInput, materials: chosenMaterials, step1Response: step1, selectedRq, step2Response: step2, cover: { ...coverPreset(preset) }, interestAnalysisId });clearQuestionDraft();navigate(`/projects/${project.id}`);}
    } catch (e) { setError(e instanceof Error ? e.message : "保存できませんでした。"); setBusy(""); }
  };

  return (
    <div className="question-page max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-10">
      <Helmet><title>問いにしてみる ｜ MISHIRU</title></Helmet>
      <header className="question-heading">
        <div><p className="eyebrow">QUESTION CRAFT</p><h1>気になることを、研究できる問いへ。</h1><p>言葉になりきらない関心をほどき、複数の問いを比べながら研究の骨子まで育てます。</p></div>
        <Link to="/projects"><Button variant="secondary"><BookOpen className="w-4 h-4" />本棚を見る</Button></Link>
      </header>

      <nav className="step-rail" aria-label="作成ステップ">
        {["素材を選ぶ", "問いを比べる", "骨子をつくる", "本棚へ保存"].map((label, index) => <span key={label} className={(step2 ? 3 : step1 ? 1 : 0) >= index ? "is-on" : ""}><b>{index + 1}</b>{label}</span>)}
      </nav>
      {interestAnalysisId && <p className="inherit-notice">みつめるの分析と根拠素材を引き継いでいます。ここから具体的なRQ候補を作ります。</p>}
      {aiEnabled === false && <p className="fallback-notice"><Sparkles className="w-4 h-4"/>選択中のAIは利用できません。生成できない場合は、品質検査済みの仮説たたき台へ切り替わります。</p>}
      {step1?.generatedBy === "quality_fallback" && <p className="fallback-notice" role="status"><Sparkles className="w-4 h-4"/><span><strong>これはAI生成結果ではなく、仮説たたき台です。</strong> 素材から対象・関係・証拠を組み立て、問いの形式を検査しています。理由メモを加えるか、もう一度生成すると焦点を改善できます。</span></p>}
      {step1?.generatedBy === "ai" && Boolean(step1.qualityReport?.repairedCount) && <div className="quality-notice" role="status">{step1.qualityReport?.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}

      <Card className="question-source-panel">
        <div className="segment-control">
          <button className={mode === "free_input" ? "active" : ""} onClick={() => setMode("free_input")}>自由入力から作る</button>
          <button className={mode === "saved_items" ? "active" : ""} onClick={() => setMode("saved_items")}>保存した素材から作る</button>
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
            <p className="source-help">複数選べます。公式情報と、あなたの反応・理由メモは分けたままAIへ渡します。</p>
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
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="panel-action"><Button onClick={generateStep1} disabled={!!busy || !enoughEvidence}>{busy === "step1" ? <><LoaderCircle className="w-4 h-4 animate-spin"/>素材を統合し、12種類の問いを検査しています…</> : <><Sparkles className="w-4 h-4"/>Step 1：問いの候補をつくる</>}</Button></div>
      </Card>

      {step1 && <section id="question-step1" className="question-result-section"><SectionHeading step="STEP 1" title="関心をほどき、問いを比べる" />
        {step1.source_synthesis && <Card className="source-synthesis"><div className="source-synthesis__head"><div><p className="eyebrow">SOURCE SYNTHESIS</p><h3>素材を、ひとつの研究焦点へ</h3></div><Chip tone={step1.generatedBy === "ai" ? "teal" : "yellow"}>{step1.generatedBy === "ai" ? "AI＋品質検査" : "仮説たたき台"}</Chip></div><strong>{step1.source_synthesis.core_interest}</strong><p>{step1.source_synthesis.adopted_focus}</p><Disclosure summary="素材のつながりと前提を見る" description="なぜこの焦点になったか、不足している情報を確認できます"><div className="source-synthesis__grid"><div><span>素材のつながり</span><ul>{step1.source_synthesis.material_connections.map((item) => <li key={item}>{item}</li>)}</ul></div><div><span>仮定・不足情報</span><ul>{[...step1.source_synthesis.assumptions, ...step1.source_synthesis.missing_information].map((item) => <li key={item}>{item}</li>)}</ul></div></div></Disclosure></Card>}
        <Disclosure className="question-research-context" summary="問いの背景と研究マップを見る" description="対象・文脈や、別領域から見た問いを確認できます">
          <Decomposition decomposition={step1.decomposition}/>
          <div className="research-map-grid"><Card className="research-map-main"><p className="eyebrow">RESEARCH MAP</p><h3>{step1.research_map_position.domain_name}</h3><dl><div><dt>対象の存在相</dt><dd>{step1.research_map_position.vertical_axis}</dd></div><div><dt>問いの様式</dt><dd>{step1.research_map_position.horizontal_axis}</dd></div></dl><p>{step1.research_map_position.reason}</p></Card>
            <Card className="domain-shifts"><h3>別領域へずらすと</h3><p className="domain-shifts__intro">気になる視点をひとつ選んで、問いの変わり方を見てみましょう。</p>{step1.domain_shifts.map((shift, index) => <details key={`${shift.new_domain}-${index}`} open={openDomainShift === index}><summary onClick={(event) => { event.preventDefault(); setOpenDomainShift(openDomainShift === index ? null : index); }}>{shift.new_domain}<ChevronDown/></summary><div className="domain-shift__content"><p className="domain-shift__question">{shift.shifted_rq}</p><p className="domain-shift__reason">{shift.reason}</p></div></details>)}</Card></div>
        </Disclosure>
        <div className="rq-heading"><div><p className="eyebrow">おすすめの問い</p><h2>まず、この中から選ぶ</h2></div><span>{compareIds.length}件を比較対象に選択</span></div>
        <div className="rq-grid">{prioritizedRqs.primary.map(({ rq, index }) => <QuestionCandidateCard key={rqId(rq, index)} rq={rq} selected={selectedRq === rq} compared={compareIds.includes(rqId(rq, index))} onCompare={() => setCompareIds(toggle(compareIds, rqId(rq, index)).slice(-3))} onSelect={() => setSelectedRq(rq)} />)}</div>
        {prioritizedRqs.other.length > 0 && <Disclosure className="other-rq-options" summary={`ほかの問い案を見る（${prioritizedRqs.other.length}件）`} description="異なる研究の型から比べたいときに開いてください"><div className="rq-grid">{prioritizedRqs.other.map(({ rq, index }) => <QuestionCandidateCard key={rqId(rq, index)} rq={rq} selected={selectedRq === rq} compared={compareIds.includes(rqId(rq, index))} onCompare={() => setCompareIds(toggle(compareIds, rqId(rq, index)).slice(-3))} onSelect={() => setSelectedRq(rq)} />)}</div></Disclosure>}
        {compareIds.length >= 2 && <Comparison candidates={step1.output_type_proposals.filter((rq, i) => compareIds.includes(rqId(rq, i)))}/>} 
        <div className="panel-action"><Button onClick={generateStep2} disabled={!selectedRq || !!busy}>{busy === "step2" ? <LoaderCircle className="w-4 h-4 animate-spin"/> : <ArrowRight className="w-4 h-4"/>}Step 2：研究骨子をつくる</Button></div>
      </section>}

      {step2 && <section id="question-step2" className="question-result-section"><SectionHeading step="STEP 2" title="調べ方と研究骨子を組み立てる" />
        <Card className="summary-banner"><span>一文要約</span><strong>{step2.one_sentence_summary}</strong></Card>
        <Card className="gap-card"><span>深掘りするギャップ</span><p>{step2.literature_review.target_gap_deep}</p><div className="query-row">{step2.search_queries.map((query) => <Chip key={query}>{query}</Chip>)}</div></Card>
        <Disclosure className="step2-evidence" summary="先行研究と参照先を詳しく見る" description="ギャップ、論文候補、学術コミュニティへの接続を段階的に確認できます">
          <div className="step2-evidence__stack">
            <Disclosure className="step2-evidence__group" defaultOpen summary="1. 先行研究のギャップ" description="分かっていること・未解明なこと・議論が残る点">
              <Card className="target-gap"><span>TARGET GAP</span><h3>今回の研究で明らかにすべきこと</h3><p>{step2.literature_review.target_gap_deep}</p></Card>
              <div className="step2-columns"><ResultList title="すでに分かっていること" items={step2.literature_review.knowns}/><ResultList title="まだ分かっていないこと" items={step2.literature_review.unknowns}/><ResultList title="議論が残っていること" items={step2.literature_review.controversies}/></div>
            </Disclosure>
            <Disclosure className="step2-evidence__group" summary="2. 読むべき論文と検索クエリ" description="参考・競合・隣接研究から読み始める">
              <PaperIdeas step2={step2}/><SearchQueries queries={step2.search_queries}/>
            </Disclosure>
            <Disclosure className="step2-evidence__group" summary="3. 学術コミュニティへの接続" description="主要領域、発表先、投稿先の候補と公式URL">
              <AcademicFields items={step2.academic_mapping.recommended_fields || []} fallback={step2.academic_mapping.target_domain}/>
              <div className="academic-links"><AcademicList title="発表に適した学会候補" items={step2.academic_mapping.recommended_societies}/><AcademicList title="投稿に適したジャーナル候補" items={step2.academic_mapping.recommended_journals}/></div>
            </Disclosure>
          </div>
        </Disclosure>
        <Card className="outline-preview"><div><p className="eyebrow">RESEARCH OUTLINE</p><h2>{step2.research_outline.title_public}</h2><p>{step2.research_outline.title_academic}</p></div><dl><Info label="目的" value={step2.research_outline.purpose}/><Info label="メインRQ" value={step2.research_outline.main_rq}/><Info label="研究デザイン" value={step2.research_outline.research_design}/><Info label="分析方法" value={step2.research_outline.analysis_method}/><Info label="学術的意義" value={step2.research_outline.significance.academic}/></dl></Card>
        <div className="panel-action"><Button onClick={() => setSaveOpen(true)}><Save className="w-4 h-4"/>研究プロジェクトとして保存</Button></div>
      </section>}

      {saveOpen && step2 && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSaveOpen(false)}><Card className="save-project-dialog" float><div onMouseDown={(e) => e.stopPropagation()}><div className="dialog-title"><div><p className="eyebrow">ADD TO BOOKSHELF</p><h2>本棚へ保存</h2></div><button aria-label="閉じる" onClick={() => setSaveOpen(false)}>×</button></div>
        <label className="question-project-target">保存先<select value={targetProjectId} onChange={(e)=>setTargetProjectId(e.target.value)}><option value="">新しい本として本棚へ追加</option>{existingProjects.map((project)=><option key={project.id} value={project.id}>既存の本「{project.displayTitle}」に紐づける</option>)}</select><small>{targetProjectId?"既存の表紙とタイトルを残したまま、今回の問い・骨子・素材を紐づけます。":"新しい研究プロジェクトとして表紙とともに保存します。"}</small></label>
        {!targetProjectId&&<div className="save-grid"><div className="save-fields"><label>本のタイトル<input value={title} onChange={(e) => setTitle(e.target.value)}/></label><label>サブタイトル<textarea rows={3} value={subtitle} onChange={(e) => setSubtitle(e.target.value)}/></label><label>状態<select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="draft">作成中</option><option value="consultation">相談用</option><option value="on_hold">保留</option></select></label><fieldset><legend>初期表紙</legend><div className="preset-row">{["electric","lime","silver","charcoal"].map((id) => <button key={id} className={preset === id ? "active" : ""} onClick={() => setPreset(id)} style={{background: coverCss(coverPreset(id))}} aria-label={`${id}表紙`} />)}</div><small>詳しい表紙編集は保存後に行えます</small></fieldset></div><ProjectCover title={title} subtitle={subtitle} preset={preset}/></div>}
        <div className="dialog-actions"><Button variant="ghost" onClick={() => { setPreset("electric"); saveProject(); }}>あとで設定して保存</Button><Button onClick={saveProject} disabled={!title.trim() || busy === "save"}>{busy === "save" && <LoaderCircle className="w-4 h-4 animate-spin"/>}本棚へ追加</Button></div></div></Card></div>}
    </div>
  );
}

function QuestionCandidateCard({ rq, selected, compared, onCompare, onSelect }: { rq: RQCandidate; selected: boolean; compared: boolean; onCompare: () => void; onSelect: () => void }) {
  return <Card className={`rq-card ${selected ? "chosen" : ""}`}>
    <div className="rq-card-top"><Chip tone={rq.is_recommended ? "yellow" : "blue"}>{rq.type_name}</Chip>{rq.is_recommended && <span>推奨</span>}</div>
    <h3>{rq.rq_title}</h3>
    <span className="rq-audience-label">初めて読む人向け</span>
    <p className="rq-public">{rq.public_rq}</p>
    <details><summary>問いの構成・専門向けRQを見る<ChevronDown/></summary><dl>
      {rq.components && <><Info label="対象" value={rq.components.target}/><Info label="着目する現象・概念" value={rq.components.focus}/><Info label="問う関係" value={rq.components.relationship}/><Info label="文脈・範囲" value={rq.components.context}/><Info label="必要な証拠" value={rq.components.evidence}/></>}
      <Info label="専門向けRQ" value={rq.academic_rq}/><Info label="何が分かるか" value={rq.what_we_learn}/><Info label="方法" value={rq.methods}/><Info label="想定成果物" value={rq.expected_output}/><Info label="難易度" value={rq.difficulty}/>{rq.quality_score != null && <Info label="問いの品質チェック" value={`${rq.quality_score} / 100`}/>} {rq.recommendation_reason && <Info label="推奨理由" value={rq.recommendation_reason}/>} 
    </dl></details>
    <div className="rq-actions"><label><input type="checkbox" checked={compared} onChange={onCompare}/> 比較する</label><button onClick={onSelect}>{selected ? <><Check/>採用中</> : "この問いを採用"}</button></div>
  </Card>;
}

const decompositionLabel: Record<string,string> = { target:"対象", phenomenon:"現象", context:"場面・文脈", tension:"違和感・緊張", question:"知りたいこと", utility:"役立てたいこと", motivation:"動機" };

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
function SectionHeading({step,title}:{step:string;title:string}) { return <div className="section-heading"><span>{step}</span><h2>{title}</h2></div>; }
function Info({label,value}:{label:string;value:string}) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function ResultList({title,items}:{title:string;items:string[]}) { return <Card className="result-list"><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></Card>; }
function Decomposition({decomposition}:{decomposition:Step1Response["decomposition"]}) {
  const entries = Object.entries(decomposition);
  const core = entries.filter(([key]) => ["target", "phenomenon", "question"].includes(key));
  const context = entries.filter(([key]) => !["target", "phenomenon", "question"].includes(key));
  const cells = (items: [string, string][]) => items.map(([key, value]) => <Card key={key} className="decomposition-cell"><small>{decompositionLabel[key] || key}</small><p>{value}</p></Card>);
  return <div className="decomposition-block"><div className="decomposition-grid decomposition-grid--core">{cells(core)}</div>{context.length > 0 && <Disclosure summary="場面・動機・活かし方を見る" description="問いをつくる背景を確認できます"><div className="decomposition-grid decomposition-grid--context">{cells(context)}</div></Disclosure>}</div>;
}
function Comparison({candidates}:{candidates:RQCandidate[]}) { return <Card className="rq-comparison"><h3>問い案を比較</h3><div>{candidates.map((rq) => <article key={rq.type_name}><Chip tone="blue">{rq.type_name}</Chip><span className="rq-audience-label">初めて読む人向け</span><strong>{rq.public_rq}</strong><Info label="方法" value={rq.methods}/><Info label="成果物" value={rq.expected_output}/><Info label="難易度" value={rq.difficulty}/></article>)}</div></Card>; }
function PaperIdeas({step2}:{step2:Step2Response}) { return <Card className="paper-ideas"><div className="evidence-card-heading"><span>READING LIST</span><h3>読むべき論文案</h3><p>書誌情報を確認した論文を中心に、内容と研究へのつながりを初心者向けに整理しています。</p></div>{([['参考になる論文',step2.paper_ideas.reference],['競合する研究',step2.paper_ideas.competitor],['隣接領域の論文',step2.paper_ideas.adjacent]] as const).map(([label,items],index) => <details key={label} open={index===0}><summary>{label}<span>{items.length}件</span><ChevronDown/></summary><div className="paper-idea-list">{items.map((paper) => <article key={`${paper.title}-${paper.year || paper.url}`}><div className="paper-link-head"><strong>{paper.title}</strong><span className="paper-status-chips">{paper.sourceLabel&&<Chip tone="teal">{paper.sourceLabel}</Chip>}{paper.openAccess&&<Chip>OA</Chip>}{paper.kind === "search"&&<Chip tone="yellow">検索候補</Chip>}</span></div><small>{[paper.author, paper.journal, paper.year].filter(Boolean).join(" ・ ")}</small>{paper.summary&&<div className="paper-explanation"><span>この論文は何を調べた？</span><p>{paper.summary}</p></div>}<div className="paper-relevance"><span>この研究にどう役立つ？</span><p>{paper.reason}</p></div><a className="paper-destination" href={paper.url} target="_blank" rel="noreferrer">{paper.kind === "search" ? "文献データベースで探す" : "元の論文を見る"}<ExternalLink aria-hidden="true"/></a>{paper.doi&&<code>DOI: {paper.doi}</code>}</article>)}</div></details>)}</Card>; }
function SearchQueries({queries}:{queries:string[]}) { return <Card className="search-query-list"><div className="evidence-card-heading"><span>SEARCH QUERIES</span><h3>検索クエリ候補</h3></div><div>{queries.map((query) => <a key={query} href={`https://cir.nii.ac.jp/all?q=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer"><span>{query}</span><ExternalLink aria-hidden="true"/></a>)}</div></Card>; }
function AcademicFields({items,fallback}:{items:Step2Response['academic_mapping']['recommended_societies'];fallback:string}) { return <Card className="academic-fields"><div className="evidence-card-heading"><span>ACADEMIC MAPPING</span><h3>主要な研究領域</h3></div><div>{items.length ? items.map((item) => <a key={item.name} href={item.url}><strong>{item.name}</strong><span>{item.description || item.reason}</span><ExternalLink aria-hidden="true"/></a>) : <strong>{fallback}</strong>}</div></Card>; }
function AcademicList({title,items}:{title:string;items:Step2Response['academic_mapping']['recommended_societies']}) { return <Card className="academic-list"><h3>{title}</h3><div className="academic-list__items">{items.map((item) => <article key={item.name}><div className="academic-item__head"><a href={item.url} target="_blank" rel="noreferrer"><strong>{item.name}</strong><ExternalLink aria-hidden="true"/></a><span className="academic-item__chips"><Chip tone={item.url_type === '公式' ? 'teal' : 'yellow'}>{item.url_type}</Chip>{item.scope&&<Chip>{item.scope}</Chip>}</span></div>{item.description&&<p>{item.description}</p>}<div className="academic-item__reason"><span>この研究との接点</span><p>{item.reason}</p></div><a className="academic-item__url" href={item.url} target="_blank" rel="noreferrer">公式・参照ページを見る<ExternalLink aria-hidden="true"/></a></article>)}</div></Card>; }
function coverPreset(id:string) { const values:Record<string,[string,string,string]>={electric:['#003fbd','#001f68','#fff'],lime:['#efff78','#dfff24','#06111f'],silver:['#fff','#bac6d8','#06111f'],charcoal:['#161b22','#161b22','#fff']}; const [a,b,text]=values[id]||values.electric; const block=(size:number,y:number,color=text)=>({fontFamily:'Hiragino Mincho ProN',color,fontSize:size,fontWeight:700,lineHeight:1.3,letterSpacing:0,x:9,y,width:82,align:'left' as const}); return {presetId:id,backgroundType:(id==='charcoal'?'solid':'gradient') as 'solid'|'gradient',solidColor:a,gradientStart:a,gradientEnd:b,gradientAngle:145,autoTextContrast:true,metadataText:'RESEARCH PROJECT\nMISHIRU',title:block(30,18),subtitle:block(15,56),metadata:block(11,84,id==='electric'?'#dfff24':text)}; }
function coverCss(cover:ReturnType<typeof coverPreset>) { return cover.backgroundType === 'solid' ? cover.solidColor : `linear-gradient(${cover.gradientAngle}deg,${cover.gradientStart},${cover.gradientEnd})`; }
function ProjectCover({title,subtitle,preset}:{title:string;subtitle:string;preset:string}) { const cover=coverPreset(preset); return <div className="project-cover-preview" style={{background:coverCss(cover),color:cover.title.color}}><span>RESEARCH PROJECT</span><strong>{title || '研究テーマ'}</strong><p>{subtitle}</p><small>MISHIRU</small></div>; }
