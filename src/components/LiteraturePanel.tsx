// 研究プランの「先行研究」タブ（ADR-010 J4）。
// 旧Questions.tsxのstep2プレビューから移植し、プロジェクト画面の常設セクションにした。
// literatureStatus: pending=充填中（親が自動でfillPlanLiteratureを実行） / verified=実在文献 /
// fallback=実在文献が見つからず下書きのまま（「未確認の参考例」を明示＋この行だけの再試行）。
import { ChevronDown, ExternalLink, LoaderCircle, RotateCcw } from "lucide-react";
import type { ResearchProject, Step2Response } from "../../shared/research-project";
import { Button, Card, Chip, Disclosure, TrustNote } from "./ui";

export function LiteraturePanel({ project, filling, onRetry }: { project: ResearchProject; filling: boolean; onRetry: () => void }) {
  const step2 = project.step2Response;
  const status = step2.literatureStatus;
  return (
    <section className="literature-panel">
      {filling && (
        <p className="gen-stage__line" role="status"><LoaderCircle className="w-4 h-4 animate-spin" aria-hidden="true"/>先行研究を確認しています…（30秒ほど）。プランの他の部分は、そのまま編集できます。</p>
      )}
      {!filling && status === "fallback" && (
        <div className="form-error--retry literature-fallback-note" role="status">
          <TrustNote><strong>下書き（未確認の参考例）を表示しています。</strong> この問いに直接ひもづく論文をまだ確認できていません。探し方の手がかりとしてお使いください。</TrustNote>
          <Button variant="ghost" onClick={onRetry}><RotateCcw className="w-4 h-4"/>もう一度確認する</Button>
        </div>
      )}
      {!filling && status === "verified" && (
        <p className="literature-verified-note"><Chip tone="teal">実在を確認した文献</Chip> 文献データベースで実在を確認した論文だけを載せています。</p>
      )}

      <Card className="gap-card"><span>この研究で確かめること</span><p>{step2.literature_review.target_gap_deep}</p><div className="query-row">{step2.search_queries.map((query) => <Chip key={query}>{query}</Chip>)}</div></Card>
      <div className="step2-columns"><ResultList title="すでに分かっていること" items={step2.literature_review.knowns}/><ResultList title="まだ分かっていないこと" items={step2.literature_review.unknowns}/><ResultList title="議論が残っていること" items={step2.literature_review.controversies}/></div>
      <PaperIdeas step2={step2} draftLabeled={status !== "verified"}/>
      <SearchQueries queries={step2.search_queries}/>
      <AcademicFields items={step2.academic_mapping.recommended_fields || []} fallback={step2.academic_mapping.target_domain}/>
      <div className="academic-links"><AcademicList title="発表に適した学会候補" items={step2.academic_mapping.recommended_societies}/><AcademicList title="投稿に適したジャーナル候補" items={step2.academic_mapping.recommended_journals}/></div>
    </section>
  );
}

function ResultList({title,items}:{title:string;items:string[]}) { return <Card className="result-list"><h3>{title}</h3><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></Card>; }

function PaperIdeas({step2, draftLabeled}:{step2:Step2Response; draftLabeled:boolean}) {
  return <Card className="paper-ideas"><div className="evidence-card-heading"><span>読む順番</span><h3>最初に読む論文</h3><p>内容と、この問いにどう役立つかをまとめています。{draftLabeled && "検索リンクの候補は、開いた先でご自身の確認が必要です。"}</p></div>
    {([['まず全体を知る',step2.paper_ideas.reference],['問いに近い研究を知る',step2.paper_ideas.competitor],['別の見方を加える',step2.paper_ideas.adjacent]] as const).map(([label,items],index) => <details key={label} open={index===0}><summary>{label}<span>{items.length}件</span><ChevronDown/></summary><div className="paper-idea-list">{items.map((paper) => <article key={`${paper.title}-${paper.year || paper.url}`}><div className="paper-link-head"><strong>{paper.title}</strong><span className="paper-status-chips">{paper.sourceLabel&&<Chip tone="teal">{paper.sourceLabel}</Chip>}{paper.openAccess&&<Chip>無料で読めます</Chip>}{paper.kind === "search"&&<Chip tone="yellow">候補を検索（未確認）</Chip>}</span></div><small>{[paper.author, paper.journal, paper.year].filter(Boolean).join(" ・ ")}</small>{paper.summary&&<div className="paper-explanation"><span>どんな論文？</span><p>{paper.summary}</p></div>}<div className="paper-relevance"><span>この問いにどう役立つ？</span><p>{paper.reason}</p></div><a className="paper-destination" href={paper.url} target="_blank" rel="noreferrer">{paper.kind === "search" ? "この条件で論文を探す" : "論文のページを開く"}<ExternalLink aria-hidden="true"/></a>{paper.doi&&<code>DOI: {paper.doi}</code>}</article>)}</div></details>)}
  </Card>;
}

function SearchQueries({queries}:{queries:string[]}) { return <Card className="search-query-list"><div className="evidence-card-heading"><span>論文の検索語</span><h3>この言葉で論文を探す</h3><p>選ぶとCiNiiの検索結果が開きます。</p></div><div>{queries.map((query) => <a key={query} href={`https://cir.nii.ac.jp/all?q=${encodeURIComponent(query)}`} target="_blank" rel="noreferrer"><span>{query}</span><ExternalLink aria-hidden="true"/></a>)}</div></Card>; }

function AcademicFields({items,fallback}:{items:Step2Response['academic_mapping']['recommended_societies'];fallback:string}) { return <Card className="academic-fields"><div className="evidence-card-heading"><span>研究分野</span><h3>この問いに近い研究領域</h3></div><div>{items.length ? items.map((item) => <a key={item.name} href={item.url} target="_blank" rel="noreferrer"><strong>{item.name}</strong><span>{item.description || item.reason}</span><ExternalLink aria-hidden="true"/></a>) : <strong>{fallback}</strong>}</div></Card>; }

function AcademicList({title,items}:{title:string;items:Step2Response['academic_mapping']['recommended_societies']}) { return <Card className="academic-list"><h3>{title}</h3><div className="academic-list__items">{items.length ? items.map((item) => <article key={item.name}><div className="academic-item__head"><a href={item.url} target="_blank" rel="noreferrer"><strong>{item.name}</strong><ExternalLink aria-hidden="true"/></a><span className="academic-item__chips"><Chip tone={item.url_type === '公式' ? 'teal' : 'yellow'}>{item.url_type}</Chip>{item.scope&&<Chip>{item.scope}</Chip>}</span></div>{item.description&&<p>{item.description}</p>}<div className="academic-item__reason"><span>この問いとの共通点</span><p>{item.reason}</p></div><a className="academic-item__url" href={item.url} target="_blank" rel="noreferrer">{item.url_type === '公式' ? '公式ページを開く' : 'この名称で探す'}<ExternalLink aria-hidden="true"/></a></article>) : <p className="academic-list__empty">確かな候補を見つけられませんでした。上の検索語で論文を探し、掲載誌や所属学会を確認してください。</p>}</div></Card>; }
