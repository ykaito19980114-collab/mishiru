// 関心プロフィール：反応とメモから、自分の問い・研究領域・研究室候補へ変換する。
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Compass, ChevronRight, Sparkles, TrendingUp, Search as SearchIcon,
  Pencil, Check, X, Highlighter, Route,
} from "lucide-react";
import { api, Candidate, ProfileExtras, QuestionProjectResponse } from "../lib/api";
import type { InterestProfile, QuestionProject } from "../../shared/types";
import { Button, Card, Chip, Skeleton, ErrorState, TrustNote } from "../components/ui";
import { LabMiniCard } from "../components/LabCard";
import { InterestDraft, readAnnotations, readInterestDraft, summarizeAnnotations, writeInterestDraft } from "../lib/annotations";
import { AccountDataPanel } from "../components/AccountAccess";

export default function Profile() {
  const [state, setState] = useState<"loading" | "error" | "notready" | "ready">("loading");
  const [profile, setProfile] = useState<InterestProfile | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [extras, setExtras] = useState<ProfileExtras | null>(null);
  const [serverProfileQuery, setServerProfileQuery] = useState("");
  const [needed, setNeeded] = useState(10);
  const [threshold, setThreshold] = useState(10);
  const [evaluated, setEvaluated] = useState(0);
  const [draft, setDraft] = useState<InterestDraft>(() => readInterestDraft());
  const [questionProject, setQuestionProject] = useState<QuestionProject | null>(null);
  const [questionProjectData, setQuestionProjectData] = useState<QuestionProjectResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [markSummary, setMarkSummary] = useState(() => summarizeAnnotations(readAnnotations(), readInterestDraft()));

  const recompute = (nextDraft = readInterestDraft()) => setMarkSummary(summarizeAnnotations(readAnnotations(), nextDraft));

  const load = async () => {
    setState("loading");
    try {
      const res = await api.getProfile();
      setExtras(res.extras);
      if (res.ready === true) {
        setProfile(res.profile);
        setCandidates(res.candidates);
        setServerProfileQuery(res.profileQuery || "");
        setState("ready");
      } else {
        setNeeded(res.needed);
        setThreshold(res.threshold);
        setEvaluated(res.evaluatedCount);
        setState("notready");
      }
      api.getQuestionProject().then((projectRes) => {
        setQuestionProject(projectRes.project);
        setQuestionProjectData(projectRes);
      }).catch(() => {});
      recompute(readInterestDraft());
    } catch {
      setState("error");
    }
  };
  useEffect(() => { load(); }, []);

  const effectiveQuery = markSummary.profileQuery || serverProfileQuery;
  const displayQuestions = markSummary.questions.length
    ? markSummary.questions
    : (extras?.questions || []).map((q) => q.text).slice(0, 4);
  const displaySummary = markSummary.summary || profile?.summary || "現時点の反応をもとに、関心の形を整理しています。";

  const sortedCandidates = useMemo(() => {
    const terms = markSummary.searchTerms.map((t) => t.toLowerCase());
    if (terms.length === 0) return candidates;
    return [...candidates].sort((a, b) => scoreCandidate(b, terms) - scoreCandidate(a, terms));
  }, [candidates, markSummary.searchTerms]);

  const saveDraft = () => {
    writeInterestDraft(draft);
    recompute(draft);
    setEditing(false);
  };
  const startEditing = () => {
    setDraft((current) => ({
      summary: current.summary.trim() ? current.summary : displaySummary,
      questions: current.questions.trim() ? current.questions : displayQuestions.join("\n"),
      requirements: current.requirements.trim() ? current.requirements : markSummary.requirements.join("\n"),
      reason: current.reason || "",
    }));
    setEditing(true);
  };
  const cancelEditing = () => {
    setDraft(readInterestDraft());
    setEditing(false);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 pt-4 pb-8">
      <Helmet><title>関心を整理 ｜ MISHIRU</title></Helmet>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-black">関心を整理</h1>
          <p className="text-sm text-[var(--c-ink-2)]">これまでの反応から、近い問い・研究領域・研究室をまとめます。</p>
        </div>
        <Link to="/saved" className="text-xs font-bold text-[var(--c-primary)] min-h-[36px] inline-flex items-center">保存したものを見る<ChevronRight className="w-3 h-3" /></Link>
      </div>

      {state === "loading" && <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>}
      {state === "error" && <ErrorState onRetry={load} />}

      {state === "notready" && (
        <div className="space-y-5">
          <Card className="p-5 bg-[var(--c-surface-blue)] border-transparent">
            <div className="flex items-center gap-2 mb-2">
              <Compass className="w-5 h-5 text-[var(--c-primary)]" />
              <h2 className="font-bold text-[var(--c-primary)]">あと{needed}枚選ぶと、関心に近い研究室を表示できます</h2>
            </div>
            <div className="progress-thin mb-2" role="progressbar" aria-valuenow={evaluated} aria-valuemin={0} aria-valuemax={threshold} aria-label="傾向生成までの進捗">
              <i style={{ width: `${Math.min(100, (evaluated / threshold) * 100)}%` }} />
            </div>
            <p className="text-sm text-[var(--c-ink-2)]">カードを「気になる／わからない／違うかも」で選んでください。反応が{threshold}枚ほど集まると、検索語と研究室の候補を整理します。</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Link to="/discover"><Button>問いのカードを見る</Button></Link>
              <Link to="/saved"><Button variant="secondary"><Highlighter className="w-4 h-4" />メモを追加</Button></Link>
            </div>
          </Card>
          <InterestCore
            displaySummary={displaySummary}
            displayQuestions={displayQuestions}
            requirements={markSummary.requirements}
            editing={editing}
            draft={draft}
            setDraft={setDraft}
            onEdit={startEditing}
            onSave={saveDraft}
            onCancel={cancelEditing}
          />
        </div>
      )}

      {state === "ready" && profile && extras && (
        <div className="space-y-6">
          <InterestCore
            displaySummary={displaySummary}
            displayQuestions={displayQuestions}
            requirements={markSummary.requirements}
            editing={editing}
            draft={draft}
            setDraft={setDraft}
            onEdit={startEditing}
            onSave={saveDraft}
            onCancel={cancelEditing}
            searchLink={effectiveQuery ? `/labs?ai=${encodeURIComponent(effectiveQuery)}` : undefined}
          />
          <section aria-labelledby="ph-kw">
            <h2 id="ph-kw" className="text-sm font-bold text-[var(--c-ink-2)] mb-2">検索に使える言葉</h2>
            <div className="flex flex-wrap gap-2">
              {(markSummary.searchTerms.length ? markSummary.searchTerms : profile.candidateFields).map((k) => (
                <Link key={k} to={`/labs?ai=${encodeURIComponent(k)}`}
                  className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--c-primary)] bg-[var(--c-surface-blue)] rounded-full px-3 py-2 min-h-[40px] hover:brightness-95 transition-all">
                  <SearchIcon className="w-3.5 h-3.5" />{k}
                </Link>
              ))}
            </div>
            <p className="text-[11px] text-[var(--c-ink-3)] mt-1.5">普段の言葉を、研究室や論文を探しやすい言葉に置き換えています。</p>
          </section>

          {questionProjectData && <ProfileResourcePanel data={questionProjectData} />}

          <section aria-labelledby="ph-craft">
            <h2 id="ph-craft" className="flex items-center gap-1.5 text-sm font-bold text-[var(--c-ink-2)] mb-2"><Route className="w-4 h-4 text-[var(--c-primary)]" />自分の問いの持ち込み方</h2>
            <Card className="p-4 space-y-3">
              <p className="text-sm text-[var(--c-ink-2)]">完全一致する研究室は少ない可能性があります。ただし、近い入口は複数あります。</p>
              {markSummary.craftingRoutes.map((text, i) => (
                <p key={text} className="text-[13px] text-[var(--c-ink)] leading-snug"><b>{i + 1}.</b> {text}</p>
              ))}
            </Card>
          </section>

          {questionProject && <QuestionProjectPanel project={questionProject} data={questionProjectData} />}

          <section aria-labelledby="ph-marks">
            <h2 id="ph-marks" className="text-sm font-bold text-[var(--c-ink-2)] mb-2">根拠になった関心条件</h2>
            <Card className="p-4 space-y-3">
              <TermLine title="反応している対象" items={markSummary.themes} empty="保存したものや研究室ページでメモを追加すると、対象が整理されます。" />
              <TermLine title="使いたい研究方法" items={markSummary.methods} empty="測定・分析・観察・設計などの方法が入ります。" />
              <TermLine title="重視したい条件" items={markSummary.conditions} empty="応用先、研究室条件、社会実装先などが入ります。" />
              <TermLine title="まだわからないが気になる" items={markSummary.unclearThemes} empty="「わからない」を付けた箇所が入ります。" />
              <TermLine title="違うかもと感じたもの" items={markSummary.avoidThemes} empty="「違う」を付けた箇所が入ります。" />
            </Card>
          </section>

          <section aria-labelledby="ph-cand">
            <div className="flex items-center justify-between mb-2">
            <h2 id="ph-cand" className="flex items-center gap-1.5 text-sm font-bold text-[var(--c-ink-2)]"><Sparkles className="w-4 h-4 text-[var(--c-primary)]" />気になっている研究室・候補研究室</h2>
              {effectiveQuery && <Link to={`/labs?ai=${encodeURIComponent(effectiveQuery)}`} className="text-xs font-bold text-[var(--c-primary)] flex items-center min-h-[36px]">この条件で探す<ChevronRight className="w-3 h-3" /></Link>}
            </div>
            {sortedCandidates.length ? (
              <div className="space-y-3">
                {sortedCandidates.map((c) => <LabMiniCard key={c.lab.id} lab={c.lab} reasons={c.reasons} />)}
              </div>
            ) : (
              <Card className="p-4"><p className="text-sm text-[var(--c-ink-2)]">カード評価やメモが増えると、ここに候補がまとまります。</p></Card>
            )}
          </section>

          <section aria-labelledby="ph-papers">
            <h2 id="ph-papers" className="text-sm font-bold text-[var(--c-ink-2)] mb-2">近い論文を探す</h2>
            <Card className="p-4">
              <p className="text-sm text-[var(--c-ink-2)] mb-3">論文はタイトルより「何を測ろうとしているか」「どんな対象へ応用しているか」を見ると比較しやすくなります。</p>
              <div className="flex flex-wrap gap-2">
                {(markSummary.academicTerms.length ? markSummary.academicTerms : profile.candidateFields).slice(0, 5).map((term) => (
                  <a key={term} href={`https://cir.nii.ac.jp/all?q=${encodeURIComponent(term)}`} target="_blank" rel="noopener noreferrer"
                    className="text-[12px] font-bold text-[var(--c-primary)] bg-[var(--c-surface-blue)] rounded-full px-3 py-2 min-h-[36px] inline-flex items-center">
                    CiNiiで「{term}」
                  </a>
                ))}
              </div>
            </Card>
          </section>

          <section aria-labelledby="ph-log">
            <h2 id="ph-log" className="text-sm font-bold text-[var(--c-ink-2)] mb-2">探索ログ</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatItem label="評価" value={extras.stats.evaluated} />
                <StatItem label="気になる" value={extras.stats.liked} />
                <StatItem label="保存する" value={extras.stats.saved} />
                <StatItem label="メモ" value={markSummary.count} />
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Link to="/discover"><Button variant="secondary" className="w-full">問いのカードを続ける</Button></Link>
              <Link to="/saved"><Button className="w-full"><Highlighter className="w-4 h-4" />保存したものを整理</Button></Link>
            </div>
          </section>
        </div>
      )}
      {(state === "notready" || state === "ready") && <AccountDataPanel />}
    </div>
  );
}

function QuestionProjectPanel({ project, data }: { project: QuestionProject; data: QuestionProjectResponse | null }) {
  const candidateById = new Map((data?.candidates || []).map((c) => [c.lab.id, c]));
  return (
    <section aria-labelledby="question-project" className="space-y-3">
      <h2 id="question-project" className="flex items-center gap-1.5 text-sm font-bold text-[var(--c-ink-2)]">
        <Route className="w-4 h-4 text-[var(--c-primary)]" />検討の進め方
      </h2>

      <div className="grid lg:grid-cols-3 gap-3">
        {project.routes.map((route) => {
          const routeText = routeCopy(route.id, route.fields);
          return (
          <Card key={route.id} className="p-4 flex flex-col">
            <h3 className="text-[18px] font-black text-[var(--c-primary)] mb-2 leading-snug">{route.title}</h3>
            <p className="text-[14px] font-bold text-[var(--c-ink)] leading-snug mb-3">{routeText.question}</p>
            <div className="rounded-[var(--radius-panel)] bg-[var(--c-primary-soft)] p-3 mb-3">
              <p className="text-[12px] font-black text-[var(--c-primary)] mb-1">問いと視点</p>
              <p className="text-[12.5px] text-[var(--c-ink-2)] leading-snug">{routeText.viewpoint}</p>
            </div>
            <MiniTerms title="研究領域" items={route.fields} />
            <MiniTerms title="研究方法" items={route.methods} />
            <MiniTerms title="関連学会・関連ジャーナル" items={[...route.societies, ...route.journals]} />
            <div className="mt-3">
              <p className="text-[12px] font-black text-[var(--c-primary)] mb-1">候補研究室</p>
              <div className="space-y-1">
                {route.candidateLabIds.slice(0, 3).map((id) => {
                  const c = candidateById.get(id);
                  return c ? (
                    <Link key={id} to={`/labs/${id}?returnTo=${encodeURIComponent("/reflect")}`} className="block text-[12px] font-bold text-[var(--c-primary)] underline">{c.lab.name}</Link>
                  ) : null;
                })}
              </div>
            </div>
            <p className="mt-auto pt-3 text-[12px] text-[var(--c-ink-3)] leading-snug">次にすること: {route.nextCheck}</p>
          </Card>
        );
        })}
      </div>
      {project.hypothesis && <p className="text-[11px] text-[var(--c-ink-3)]">整理メモ: {project.hypothesis}</p>}
    </section>
  );
}

function routeCopy(routeId: string, fields: string[]) {
  if (routeId === "route-field") {
    return {
      question: `${fields[0] || "近い研究領域"}の言葉で、問いを研究テーマに言い換える`,
      viewpoint: "既存テーマに、自分が気になっている対象・現象を重ねて相談する。",
    };
  }
  if (routeId === "route-method") {
    return {
      question: "知りたいことをどう測る・作る・比較するかから考える",
      viewpoint: "自分の問いを、研究領域や各研究室が得意な方法で扱える形に翻訳する。",
    };
  }
  return {
    question: "研究室が扱っている既存テーマの一部として自分の問いを組み立てる",
    viewpoint: "この研究室のテーマの中で、自分の問いがどの対象・方法に近いかを言語化して持ち込む。",
  };
}

function ProfileResourcePanel({ data }: { data: QuestionProjectResponse }) {
  return (
    <section aria-labelledby="profile-resources">
      <h2 id="profile-resources" className="text-sm font-bold text-[var(--c-ink-2)] mb-2">接続できそうな入口</h2>
      <div className="grid md:grid-cols-3 gap-3">
        <ProfileResourceList title="興味がありそうな研究領域" items={data.related.fields.map((f) => f.nameJa)} />
        <ProfileResourceList title="関連しそうな学会" items={data.related.societies.map((s) => s.name)} />
        <ProfileResourceList title="関連しそうなジャーナル" items={data.related.journals.map((j) => j.name)} />
      </div>
      <TrustNote className="mt-2">ここでの接続は候補であり、公式な所属・掲載関係とは限りません。</TrustNote>
    </section>
  );
}

function ProfileResourceList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card className="p-4">
      <h3 className="text-[13px] font-black text-[var(--c-primary)] mb-2">{title}</h3>
      {items.length ? (
        <div className="flex flex-wrap gap-1.5">{items.slice(0, 5).map((item) => <Chip key={item}>{item}</Chip>)}</div>
      ) : (
        <p className="text-xs text-[var(--c-ink-3)]">まだ候補がありません。</p>
      )}
    </Card>
  );
}

function MiniTerms({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-2">
      <p className="text-[11px] font-black text-[var(--c-ink-3)] mb-1">{title}</p>
      <div className="flex flex-wrap gap-1">{items.slice(0, 4).map((item) => <span key={item} className="text-[11px] font-bold bg-[var(--c-surface-blue)] text-[var(--c-primary)] rounded-full px-2 py-0.5">{item}</span>)}</div>
    </div>
  );
}

function InterestCore({
  displaySummary, displayQuestions, requirements, editing, draft, setDraft, onEdit, onSave, onCancel, searchLink,
}: {
  displaySummary: string;
  displayQuestions: string[];
  requirements: string[];
  editing: boolean;
  draft: InterestDraft;
  setDraft: React.Dispatch<React.SetStateAction<InterestDraft>>;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  searchLink?: string;
}) {
  return (
    <Card className="p-5 bg-[var(--c-surface-blue)] border-transparent">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--c-primary)]">
          <TrendingUp className="w-4 h-4" />いま見えている関心
        </div>
        {!editing && <button onClick={onEdit} className="text-xs font-bold text-[var(--c-primary)] inline-flex items-center gap-1 min-h-[32px]"><Pencil className="w-3.5 h-3.5" />内容を修正する</button>}
      </div>

      {editing ? (
        <div className="space-y-3">
          <LabeledArea label="今見えている問い・概要" value={draft.summary} onChange={(summary) => setDraft((d) => ({ ...d, summary }))} placeholder="例：人の感情や行動を測り、サービス体験や都市体験の設計につなげたい。" />
          <LabeledArea label="特に強そうな問い（1行に1つ）" value={draft.questions} onChange={(questions) => setDraft((d) => ({ ...d, questions }))} placeholder="例：人の感情や判断は、どんな行動データや体験から測れるのか？" />
          <LabeledArea label="関心の傾向・条件（1行に1つ）" value={draft.requirements} onChange={(requirements) => setDraft((d) => ({ ...d, requirements }))} placeholder="例：データ分析は使いたいが、純粋な機械学習研究だけではない。" />
          <LabeledArea label="編集理由（任意）" value={draft.reason} onChange={(reason) => setDraft((d) => ({ ...d, reason }))} placeholder="例：心理学だけでなく、サービス設計にもつなげたい。" rows={2} />
          <div className="flex gap-2">
            <Button onClick={onSave}><Check className="w-4 h-4" />更新する</Button>
            <Button variant="secondary" onClick={onCancel}><X className="w-4 h-4" />キャンセル</Button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[15px] leading-relaxed text-[var(--c-ink)] mb-3">{displaySummary}</p>
          {displayQuestions.length > 0 && (
            <div className="rounded-[18px] bg-white border-2 border-[var(--c-primary)] p-4">
              <div className="text-[12px] font-black text-[var(--c-primary)] mb-2">研究テーマになりそうな問い</div>
              <div className="space-y-2">
                {displayQuestions.slice(0, 3).map((q, i) => (
                  <p key={q} className={`${i === 0 ? "text-[20px] text-[var(--c-primary)] font-black" : "text-[14px] text-[var(--c-ink)] font-bold"} leading-snug`}>
                    {q}
                  </p>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4">
            <div className="text-[12px] font-black text-[var(--c-primary)] mb-2">関心の傾向</div>
            <div className="space-y-2">
              {requirements.length > 0 ? requirements.map((r) => (
                <p key={r} className="text-[13.5px] leading-relaxed text-[var(--c-ink)] bg-white/75 rounded-[12px] px-3 py-2">{r}</p>
              )) : <p className="text-sm text-[var(--c-ink-2)]">メモや修正入力から、関心条件がここにまとまります。</p>}
            </div>
          </div>
          {searchLink && (
            <Link to={searchLink} className="mt-4 inline-flex">
              <Button><SearchIcon className="w-4 h-4" />この傾向で研究室をさがす</Button>
            </Link>
          )}
        </>
      )}
    </Card>
  );
}

function LabeledArea({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; rows?: number }) {
  return (
    <label className="block">
      <span className="block text-xs font-black text-[var(--c-primary)] mb-1">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        className="w-full rounded-[12px] border border-[var(--c-border)] bg-white p-3 text-sm outline-none focus:border-[var(--c-primary)]" />
    </label>
  );
}

function TermLine({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <h3 className="text-xs font-black text-[var(--c-ink-3)] mb-1">{title}</h3>
      {items.length > 0
        ? <div className="flex flex-wrap gap-1.5">{items.map((item) => <Chip key={item}>{item}</Chip>)}</div>
        : <p className="text-[12px] leading-relaxed text-[var(--c-ink-3)]">{empty}</p>}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function scoreCandidate(candidate: Candidate, terms: string[]) {
  const text = `${candidate.lab.name} ${candidate.lab.keywords.join(" ")} ${candidate.lab.department} ${candidate.reasons.join(" ")}`.toLowerCase();
  return terms.reduce((sum, term) => sum + (text.includes(term) ? 2 : 0), 0);
}
