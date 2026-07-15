import assert from "node:assert/strict";
import { buildQualityFallbackStep1, enrichStep2References, isPlainPublicQuestion, isResearchQuestion } from "../server/question-craft";
import type { NormalizedResearchMaterial, QuestionFreeInput, RQCandidate, Step2Response } from "../shared/research-project";

const input: QuestionFreeInput = { recentInterest: "", discomfort: "", graduateTopic: "", reason: "", referenceInfo: "", notes: "" };
const materials: NormalizedResearchMaterial[] = [
  { sourceType: "lab", sourceId: "lab-13209", title: "山田（伊）研究室", officialDescription: "無機-有機複合界面デザインによる機能性材料の開発と評価を主なテーマとする研究室です（公開情報のキーワードに基づく要約）。詳細は公式サイト・出典をご確認ください。", userReaction: "like" },
  { sourceType: "journal", sourceId: "iscie", title: "システム/制御/情報（システム制御情報学会誌）", officialDescription: "制御理論、データ駆動制御、モデリング、最適化、ロボット、故障予知、情報処理を扱う査読付き学術誌。", userReaction: "like" },
  { sourceType: "field", sourceId: "logic", title: "論理学", officialDescription: "主張どうしの帰結関係と、妥当性、真理、証明、整合性などの概念を研究する分野。", userReaction: "like" },
  { sourceType: "field", sourceId: "symbolic-logic", title: "記号論理学", officialDescription: "形式言語と明示的な推論規則を用いて、論理的な主張と推論を記号的に表現・分析する分野。", userReaction: "like" },
];

const result = buildQualityFallbackStep1(input, materials);
assert.equal(result.generatedBy, "quality_fallback");
assert.equal(result.output_type_proposals.length, 12, "12類型が揃う");
assert.equal(new Set(result.output_type_proposals.map((item) => item.type_name.split(":")[0])).size, 12, "類型が重複しない");
assert.ok(result.output_type_proposals.every((item) => isResearchQuestion(item.public_rq)), "全一般向けRQが品質ゲートを通る");
assert.ok(result.output_type_proposals.every((item) => isPlainPublicQuestion(item.public_rq)), "全一般向けRQが非研究者向けの可読性ゲートを通る");
assert.ok(result.output_type_proposals.every((item) => isResearchQuestion(item.academic_rq)), "全専門向けRQが品質ゲートを通る");
assert.ok(result.output_type_proposals.every((item) => item.components?.target && item.components.evidence), "問いの構成と必要な証拠がある");
assert.ok(result.output_type_proposals.every((item) => !/公開情報のキーワードに基|研究として捉える|視点から何を明らか/.test(item.public_rq)), "免責文・禁止テンプレートを転載しない");
assert.ok(result.source_synthesis?.missing_information.length, "理由がない場合は不足情報を明示する");
assert.match(result.output_type_proposals[2].public_rq, /関係/);
assert.match(result.output_type_proposals[3].public_rq, /これまで|比べて/);
assert.equal(isResearchQuestion("機能性材料の性能を、再現性を保ちながら測定できるか？"), true, "日本語の『〜か？』もRQとして受理する");
assert.equal(isPlainPublicQuestion("記号と基本ルールから、どのような結論を正しく導けるのか？"), true, "DBの一般向け問い文体を受理する");
assert.equal(isPlainPublicQuestion("同一材料系でシラン処理濃度と界面層厚さは接着強度保持率とどの程度関連するか？"), false, "専門語と測定指標の露出を拒否する");
assert.equal(isPlainPublicQuestion("異なる素材のつなぎ方で、強さと湿気に対する強さはどう変わるのか？"), false, "同じ中心語の不自然な反復を拒否する");
assert.ok(result.output_type_proposals.some((item) => /無機|機能性材料|システム|論理/.test(item.academic_rq)), "専門向けRQには研究上の精度を保持する");
const wordingFallback = buildQualityFallbackStep1({ ...input, recentInterest: "異種材料（例：金属と樹脂）を接合した複合部材" }, []);
assert.match(wordingFallback.output_type_proposals[0].public_rq, /異なる素材を組み合わせたもの/, "機械的でない自然な日常語へ言い換える");

const sentoInput: QuestionFreeInput = { recentInterest: "銭湯の利用者は湯上がりをどのような時間と捉え、それは初対面の人との会話にどう結び付くのか？", discomfort: "", graduateTopic: "", reason: "", referenceInfo: "", notes: "" };
const sentoRq: RQCandidate = { type_name: "R6: 意味・解釈研究", rq_title: "湯上がりの会話", public_rq: sentoInput.recentInterest, academic_rq: "銭湯利用者の意味づけと初対面者との会話はどのように結び付くか？", what_we_learn: "湯上がりの意味づけ", methods: "インタビュー", expected_output: "解釈の整理", difficulty: "中", is_recommended: true };
const emptyStep2: Step2Response = { literature_review: { knowns: [], unknowns: [], controversies: [], target_gap_deep: "" }, search_queries: [], paper_ideas: { reference: [], competitor: [], adjacent: [] }, research_outline: {} as Step2Response["research_outline"], academic_mapping: { target_domain: "学際的研究", recommended_societies: [], recommended_journals: [] }, reporting_guideline: { name: "", reason: "" }, one_sentence_summary: "" };
const sentoReferences = enrichStep2References(emptyStep2, sentoInput, sentoRq, { ...result, decomposition: { ...result.decomposition, target: "銭湯利用者", phenomenon: "湯上がりの会話", context: "初対面の人がいる場面" } });
assert.ok(sentoReferences.paper_ideas.reference.length && sentoReferences.paper_ideas.competitor.length && sentoReferences.paper_ideas.adjacent.length, "論文候補が0件にならず、検索入口を示す");
assert.ok(sentoReferences.academic_mapping.recommended_societies.length && sentoReferences.academic_mapping.recommended_journals.length, "学会・ジャーナル候補が0件にならない");
assert.ok(sentoReferences.academic_mapping.recommended_societies.some((item) => /社会心理|コミュニケーション/.test(item.name)), "銭湯と会話の関心に近い学会候補を返す");

console.log("Question craft quality tests: 20 passed");
