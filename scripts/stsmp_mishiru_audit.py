#!/usr/bin/env python3
"""Independent Phase 2.6 audit for the MISHIRU STS-MP pilot sidecar."""

from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

TAG_FILES = {
    "labs": "labs.tags.json",
    "fields": "fields.tags.json",
    "societies": "societies.tags.json",
    "journals": "journals.tags.json",
}
LEDGER_FILES = {
    "labs": "labs.evidence.json",
    "fields": "fields.evidence.json",
    "societies": "societies.evidence.json",
    "journals": "journals.evidence.json",
}
SOURCE_FILES = {
    "labs": "labs.json",
    "fields": "fields.json",
    "societies": "societies.json",
    "journals": "journals.json",
}
PURPOSE_WORDS = {"検索", "推薦", "相談", "初心者向け", "使える", "出会う", "保存", "研究支援"}
BROAD_TERMS = {"研究", "科学", "社会", "教育", "人間", "情報", "システム", "分野", "テーマ", "学術"}
METHOD_HINTS = {"分析", "解析", "実験", "調査", "計測", "測定", "モデリング", "モデル", "理論", "シミュレーション", "最適化", "比較"}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fields})


def text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        return " ".join(text(v) for v in value if text(v))
    if isinstance(value, dict):
        return " ".join(text(v) for v in value.values() if text(v))
    return str(value).strip()


def as_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [text(v) for v in value if text(v)]
    raw = text(value)
    if not raw:
        return []
    return [part.strip() for part in re.split(r"\s*(?:／|/|、|，|,|;|；|\n)\s*", raw) if part.strip()]


def entity_kind(entity: str) -> str:
    if ":lab:" in entity:
        return "labs"
    if "RESEARCH_FIELD" in entity:
        return "fields"
    if ":society:" in entity:
        return "societies"
    if ":journal:" in entity:
        return "journals"
    return ""


def source_id_from_entity(entity: str) -> str:
    return entity.split(":")[-1]


def item_name(item: dict[str, Any]) -> str:
    return text(item.get("name") or item.get("nameJa"))


def name_tokens(item: dict[str, Any]) -> set[str]:
    raw = " ".join([
        item_name(item),
        text(item.get("nameEn")),
        text(item.get("university", {}).get("name") if isinstance(item.get("university"), dict) else ""),
        text(item.get("pi", {}).get("name") if isinstance(item.get("pi"), dict) else ""),
        text(item.get("url") or item.get("official_url")),
        text(item.get("id")),
    ])
    return {token for token in split_terms(raw) if len(token) >= 2}


def split_terms(raw: str) -> list[str]:
    chunks = re.split(r"[、。，,.／/・\s（）()「」『』:：?？!！]+", text(raw))
    terms = []
    for chunk in chunks:
        value = chunk.strip()
        value = re.sub(r"(する|した|している|として|について|に関する|を扱う|を対象とする|では|から|まで)$", "", value)
        if 2 <= len(value) <= 24 and not re.fullmatch(r"[0-9A-Za-z_-]+", value):
            terms.append(value)
    return list(dict.fromkeys(terms))


def allowed_tag_terms(tag: dict[str, Any], exclude: set[str]) -> list[str]:
    if tag.get("facet") not in {"IS", "Q", "M", "ST", "SC", "C", "V"}:
        return []
    raw = text(tag.get("controlled") or tag.get("candidate_term") or tag.get("surface"))
    terms = []
    for term in split_terms(raw):
        if term in exclude or term in BROAD_TERMS:
            continue
        if any(term in name or name in term for name in exclude):
            continue
        terms.append(term)
    return terms[:8]


def candidate_text(item: dict[str, Any]) -> str:
    sections = item.get("sections", {}) if isinstance(item.get("sections"), dict) else {}
    return " ".join([
        item_name(item),
        text(item.get("description")),
        text(item.get("beginnerDescription")),
        text(sections.get("research_summary")),
        text(item.get("researchPurpose")),
        " ".join(as_list(item.get("questions") or item.get("researchQuestions"))),
        " ".join(as_list(item.get("researchObjects"))),
        " ".join(as_list(item.get("representativeThemes"))),
        " ".join(as_list(item.get("methods"))),
        " ".join(as_list(item.get("relatedFields"))),
        " ".join(as_list(item.get("sourceKeywords"))),
        text(item.get("articleTypes")),
        text(item.get("frequency")),
        text(item.get("openAccess")),
    ])


def near_key(item: dict[str, Any]) -> set[str]:
    return set(as_list(item.get("relatedFields")) + as_list(item.get("sourceKeywords")) + [
        text(item.get("kingdom")),
        text(item.get("division")),
        text(item.get("className")),
        text(item.get("orderName")),
        text(item.get("family")),
        text(item.get("field_major")),
    ]) - {""}


def strict_mode(kind: str, tags: list[dict[str, Any]], item: dict[str, Any]) -> str:
    has_desc = any(t["facet"] == "Σ" and t.get("evidence") for t in tags)
    has_q = any(t["facet"] == "Q" and t.get("evidence") for t in tags)
    has_m = any(t["facet"] == "M" and t.get("evidence") for t in tags)
    has_is = any(t["facet"] == "IS" and t.get("evidence") for t in tags)
    if kind == "fields":
        return "FULL" if has_desc and has_q and has_m and has_is else "RAPID" if has_desc or has_q else "HYPOTHESIS"
    return "RAPID" if has_desc and has_q else "RAPID" if has_desc or has_q else "HYPOTHESIS"


def g4_rank(kind: str, item: dict[str, Any], tags: list[dict[str, Any]], all_items: list[dict[str, Any]], mixed: bool) -> tuple[int | None, int, list[dict[str, Any]]]:
    exclude = name_tokens(item)
    terms = set()
    for tag in tags:
        terms.update(allowed_tag_terms(tag, exclude))
    if not terms:
        return None, 0, []
    target_key = near_key(item)
    pool = []
    for cand in all_items:
        if cand["id"] == item["id"]:
            pool.append(cand)
            continue
        if mixed or target_key & near_key(cand):
            pool.append(cand)
    if len(pool) < 10:
        pool = all_items[:300]
    scored = []
    for cand in pool:
        haystack = candidate_text(cand)
        cand_exclude = name_tokens(cand)
        usable_terms = [term for term in terms if term not in cand_exclude]
        score = sum(1 for term in usable_terms if term and term in haystack)
        scored.append({"sourceId": cand["id"], "name": item_name(cand), "score": score})
    target_score = next((row["score"] for row in scored if row["sourceId"] == item["id"]), None)
    if target_score is None:
        return None, len(scored), scored[:10]
    greater = sum(1 for row in scored if row["score"] > target_score)
    ties = sum(1 for row in scored if row["score"] == target_score)
    conservative_rank = greater + ties
    scored.sort(key=lambda row: (-row["score"], row["sourceId"]))
    return conservative_rank, len(scored), scored[:10]


def gate_status_for_item(kind: str, item: dict[str, Any], tags: list[dict[str, Any]], g4_top3: bool) -> dict[str, dict[str, Any]]:
    statuses = {}
    statuses["G1"] = status("pass")
    for tag in tags:
        surface = text(tag.get("surface"))
        if tag["facet"] == "IS" and any(hint in surface for hint in METHOD_HINTS):
            statuses["G1"] = status("warning", "ISに方法語が混入している可能性")
        if tag["facet"] == "M" and not any(hint in surface for hint in METHOD_HINTS):
            statuses["G1"] = status("warning", "Mタグの方法性が弱い可能性")
    statuses["G2"] = status("pass" if all(t["modality"] != "asserted" or t.get("evidence") for t in tags) else "fail")
    broad = [t["surface"] for t in tags if text(t.get("surface")) in BROAD_TERMS]
    statuses["G3"] = status("fail" if broad else "pass", ",".join(broad))
    statuses["G4"] = status("pass" if g4_top3 else "fail")
    long_candidates = [t for t in tags if t.get("candidate_term") and len(text(t.get("candidate_term"))) > 80]
    statuses["G5"] = status("warning" if long_candidates else "pass", f"long_candidate_terms={len(long_candidates)}")
    polluted = [t["surface"] for t in tags if any(word in text(t.get("surface")) for word in PURPOSE_WORDS)]
    statuses["G6"] = status("fail" if polluted else "pass", ",".join(polluted[:3]))
    generic_refutations = [t for t in tags if t.get("confidence", 0) >= 0.7 and ("追加証拠" in text(t.get("refutation")) or len(text(t.get("refutation"))) < 20)]
    statuses["G7"] = status("warning" if generic_refutations else "pass", f"generic_or_weak_refutation={len(generic_refutations)}")
    return statuses


def status(value: str, note: str = "") -> dict[str, Any]:
    return {"status": value, "note": note}


def aggregate_gate_status(item_statuses: list[dict[str, dict[str, Any]]]) -> dict[str, dict[str, int]]:
    result = {}
    for gate in [f"G{i}" for i in range(1, 8)]:
        counts = Counter(s.get(gate, {}).get("status", "not_applicable") for s in item_statuses)
        result[gate] = {
            "tested": sum(counts.values()) - counts.get("not_applicable", 0),
            "pass": counts.get("pass", 0),
            "fail": counts.get("fail", 0),
            "warning": counts.get("warning", 0),
            "not_applicable": counts.get("not_applicable", 0),
            "insufficient_evidence": counts.get("insufficient_evidence", 0),
        }
    return result


def classify_candidate(term: str, examples: list[dict[str, Any]]) -> tuple[str, str, str, str]:
    raw = text(term)
    ambiguity = "low"
    if "？" in raw or "?" in raw:
        return "redundant_question", "", "reject", "問い文はQタグsurfaceとして保持し、統制語にはしない"
    if len(raw) > 60 or "。" in raw:
        return "sentence_fragment", "", "reject", "文章断片は統制語候補にしない"
    if raw in BROAD_TERMS:
        return "too_broad", "", "reject", "死語タグ"
    if len(examples) == 1:
        return "isolated_term", "", "needs_review", "単発出現のため採否保留"
    if any(mark in raw for mark in ["学会", "研究室", "ジャーナル", "大学"]):
        return "name_derived", "", "reject", "名称由来語の可能性"
    if len(raw) <= 4:
        ambiguity = "medium"
        return "needs_qualifier", f"{raw}〈要限定〉", "add_qualifier", "多義の可能性"
    return "candidate_concept", raw, "keep_candidate", "人間レビュー後に統制語化を判断"


def hypothesis_reason(tag: dict[str, Any]) -> str:
    warnings = set(tag.get("warnings") or [])
    if "insufficient_evidence_for_asserted" in warnings and not tag.get("evidence"):
        return "evidence_missing"
    if tag["facet"] == "M":
        return "inferred_method"
    if tag["facet"] == "SC":
        return "inferred_scope"
    if tag["layer"] == "CORE":
        return "core_repetition_missing"
    if tag.get("candidate_term") and not tag.get("controlled"):
        return "controlled_term_uncertain"
    return "other"


def audit_relations(edges: list[dict[str, Any]], tags_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for edge in edges:
        tag_ids = edge.get("source_tag_ids") or edge.get("evidence_tag_ids") or []
        term = text(edge.get("term"))
        warning = ""
        if edge.get("relation") == "shares_question":
            q_tags = [tags_by_id.get(tid, {}) for tid in tag_ids]
            if len(term) < 4 or term in BROAD_TERMS:
                warning = "term_too_broad"
            elif not all(tag.get("facet") == "Q" for tag in q_tags if tag):
                warning = "not_all_q_tags"
            else:
                warning = "needs_semantic_review"
        rows.append({
            "from": edge.get("from"),
            "relation": edge.get("relation"),
            "to": edge.get("to"),
            "term": term,
            "source_tag_ids": "|".join(tag_ids),
            "relation_reason": edge.get("relation_reason", ""),
            "confidence": edge.get("confidence", ""),
            "reviewStatus": "needs_revision" if warning else edge.get("reviewStatus", "pending"),
            "auditWarning": warning,
        })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sidecar-dir", type=Path, default=Path("data/mishiru-sample-derived/stsmp"))
    parser.add_argument("--input-dir", type=Path, default=Path("data/mishiru-sample-normalized"))
    args = parser.parse_args()

    sidecar = args.sidecar_dir
    tags_by_kind = {kind: read_json(sidecar / "tags" / file) for kind, file in TAG_FILES.items()}
    ledgers_by_kind = {kind: read_json(sidecar / "ledgers" / file) for kind, file in LEDGER_FILES.items()}
    source_by_kind = {kind: read_json(args.input_dir / file) for kind, file in SOURCE_FILES.items()}
    source_maps = {kind: {item["id"]: item for item in items} for kind, items in source_by_kind.items()}
    pilot_report = read_json(sidecar / "reports" / "pilot-report.json")
    pipeline = read_json(sidecar / "pipeline" / "pilot-pipeline-trace.json")
    relations = read_json(sidecar / "reports" / "relation-graph.json").get("edges", [])

    all_tags = [tag for tags in tags_by_kind.values() for tag in tags]
    tags_by_id = {tag["tag_id"]: tag for tag in all_tags}
    tags_by_entity = defaultdict(list)
    for tag in all_tags:
        tags_by_entity[tag["entity"]].append(tag)

    mode_rows = []
    gate_item_status = []
    g4_rows = []
    for target in pilot_report["pilotTargets"]:
        kind = {"lab": "labs", "field": "fields", "society": "societies", "journal": "journals"}[target["sourceType"]]
        item = source_maps[kind][target["sourceId"]]
        entity = target["entity_id"]
        tags = tags_by_entity[entity]
        recalculated_mode = strict_mode(kind, tags, item)
        near_rank, near_pool, near_top = g4_rank(kind, item, tags, source_by_kind[kind], mixed=False)
        mixed_rank, mixed_pool, mixed_top = g4_rank(kind, item, tags, source_by_kind[kind], mixed=True)
        gates = gate_status_for_item(kind, item, tags, near_rank is not None and near_rank <= 3)
        gate_item_status.append(gates)
        mode_rows.append({
            "sourceType": target["sourceType"],
            "sourceId": target["sourceId"],
            "entityName": target["canonical_name"],
            "oldExecutionMode": target["generationMode"],
            "recalculatedExecutionMode": recalculated_mode,
            "coreAsserted": sum(1 for t in tags if t["layer"] == "CORE" and t["modality"] == "asserted"),
            "exprAsserted": sum(1 for t in tags if t["layer"] == "EXPR" and t["modality"] == "asserted"),
            "coreHypothesis": sum(1 for t in tags if t["layer"] == "CORE" and t["modality"] == "hypothesis"),
            "nearRank": near_rank or "",
            "mixedRank": mixed_rank or "",
            "nearPoolSize": near_pool,
            "mixedPoolSize": mixed_pool,
        })
        g4_rows.append({
            "sourceType": target["sourceType"],
            "sourceId": target["sourceId"],
            "entityName": target["canonical_name"],
            "nearRank": near_rank,
            "mixedRank": mixed_rank,
            "nearPoolSize": near_pool,
            "mixedPoolSize": mixed_pool,
            "nearTop": near_top,
            "mixedTop": mixed_top[:5],
        })

    mode_counts = Counter(row["recalculatedExecutionMode"] for row in mode_rows)
    layer_counts = {
        "CORE_asserted": sum(1 for tag in all_tags if tag["layer"] == "CORE" and tag["modality"] == "asserted"),
        "EXPR_asserted": sum(1 for tag in all_tags if tag["layer"] == "EXPR" and tag["modality"] == "asserted"),
        "CORE_hypothesis": sum(1 for tag in all_tags if tag["layer"] == "CORE" and tag["modality"] == "hypothesis"),
    }

    def metric(rows: list[dict[str, Any]], key: str) -> dict[str, float]:
        ranks = [row[key] for row in rows if isinstance(row[key], int)]
        return {
            "top1": round(sum(1 for r in ranks if r == 1) / len(ranks), 3) if ranks else 0,
            "top3": round(sum(1 for r in ranks if r <= 3) / len(ranks), 3) if ranks else 0,
            "mrr": round(sum(1 / r for r in ranks if r) / len(ranks), 3) if ranks else 0,
        }

    evidence_rows = [row for rows in ledgers_by_kind.values() for row in rows]
    evidence_audit = {
        "total": len(evidence_rows),
        "independentTrue": sum(1 for row in evidence_rows if row.get("independent_chain") is True),
        "independentFalse": sum(1 for row in evidence_rows if row.get("independent_chain") is False),
        "unknown": sum(1 for row in evidence_rows if row.get("independence_status") == "unknown"),
        "byChain": dict(Counter(row.get("evidence_chain_id", "") for row in evidence_rows)),
        "missingMetadata": sum(1 for row in evidence_rows if not row.get("source_document_id") or not row.get("source_row_id")),
    }

    candidate_groups = defaultdict(list)
    for tag in all_tags:
        term = text(tag.get("candidate_term"))
        if term:
            candidate_groups[term].append(tag)
    vocab_rows = []
    for term, examples in sorted(candidate_groups.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        category, proposed, recommendation, note = classify_candidate(term, examples)
        vocab_rows.append({
            "candidate_term": term,
            "surface例": examples[0].get("surface", ""),
            "entity_count": len({tag["entity"] for tag in examples}),
            "sourceType": "|".join(sorted({tag["sourceType"] for tag in examples})),
            "proposed_controlled": proposed,
            "proposed_relation": category,
            "ambiguity": "medium" if category in {"needs_qualifier", "candidate_concept"} else "low",
            "recommendation": recommendation,
            "evidence_examples": " | ".join((examples[0].get("evidence") or [{}])[0].get("quote", "").splitlines()),
            "reviewStatus": "pending",
            "note": note,
        })

    hypothesis_rows = []
    for tag in all_tags:
        if tag["modality"] != "hypothesis":
            continue
        hypothesis_rows.append({
            "tag_id": tag["tag_id"],
            "sourceType": tag["sourceType"],
            "sourceId": tag["sourceId"],
            "facet": tag["facet"],
            "layer": tag["layer"],
            "surface": tag["surface"],
            "reasonCode": hypothesis_reason(tag),
            "searchEligible": "false",
            "canApproveDirectly": "false",
            "reevaluateAfterEvidence": "true",
            "evidenceGrade": ",".join(ev.get("grade", "") for ev in tag.get("evidence", [])) or "E5_or_missing",
        })

    relation_rows = audit_relations(relations, tags_by_id)

    purpose_view_rows = []
    for record in pipeline:
        entity = record["P1_EntityRecord"]["entity_id"]
        for view_name, view in record["P7_PurposeViews"].items():
            derived = view.get("derived_from") or view.get("reason_tag_ids") or []
            warnings = []
            if not derived:
                warnings.append("derived_from_missing")
            if view_name == "research_support":
                checks = view.get("feasibility_checks", {})
                if any(value != "unknown" for value in checks.values()):
                    warnings.append("feasibility_assertion_without_evidence")
                if view.get("rq_candidates"):
                    warnings.append("rq_generated_in_resource_view")
            purpose_view_rows.append({
                "entity_id": entity,
                "view": view_name,
                "derived_from_count": len(derived),
                "auditStatus": "warning" if warnings else "pass",
                "warnings": "|".join(warnings),
            })

    pilot_review_rows = []
    entity_names = {row["entity_id"]: row["canonical_name"] for row in pilot_report["pilotTargets"]}
    gate_by_entity = {}
    for row, gates in zip(mode_rows, gate_item_status):
        ent = {"lab": "ent:COLLECTIVE:lab", "field": "ent:RESEARCH_FIELD", "society": "ent:COLLECTIVE:society", "journal": "ent:COLLECTIVE:journal"}[row["sourceType"]]
        gate_by_entity[f"{ent}:{row['sourceId']}"] = gates
    for tag in all_tags:
        evidence = tag.get("evidence") or [{}]
        gates = gate_by_entity.get(tag["entity"], {})
        gate_warnings = [gate for gate, info in gates.items() if info["status"] in {"warning", "fail", "insufficient_evidence"}]
        pilot_review_rows.append({
            "sourceType": tag["sourceType"],
            "sourceId": tag["sourceId"],
            "entityName": entity_names.get(tag["entity"], ""),
            "executionMode": next((row["recalculatedExecutionMode"] for row in mode_rows if row["sourceId"] == tag["sourceId"]), ""),
            "layer": tag["layer"],
            "facet": tag["facet"],
            "surface": tag["surface"],
            "controlled": tag.get("controlled") or "",
            "modality": tag["modality"],
            "evidenceSource": evidence[0].get("source", ""),
            "evidenceQuote": evidence[0].get("quote", ""),
            "confidence": tag["confidence"],
            "refutation": tag.get("refutation", ""),
            "gateWarnings": "|".join(gate_warnings),
            "reviewerDecision": "",
            "correctedSurface": "",
            "correctedControlled": "",
            "reviewerNote": "",
        })

    gate_totals = aggregate_gate_status(gate_item_status)
    audit_report = {
        "scheme_version": pilot_report["scheme_version"],
        "phase": "2.6",
        "modeRecalculation": dict(mode_counts),
        "layerModalityCounts": layer_counts,
        "evidenceAudit": evidence_audit,
        "g4": {
            "near": metric(g4_rows, "nearRank"),
            "mixed": metric(g4_rows, "mixedRank"),
            "note": "固有名称・ID・URL・大学名・教授名等を除外し、IS/Q/M/ST/SC中心で比較。",
        },
        "gateTotals": gate_totals,
        "candidateTermSummary": dict(Counter(row["proposed_relation"] for row in vocab_rows)),
        "candidateRecommendationSummary": dict(Counter(row["recommendation"] for row in vocab_rows)),
        "hypothesisReasonSummary": dict(Counter(row["reasonCode"] for row in hypothesis_rows)),
        "relationAuditSummary": dict(Counter(row["auditWarning"] or "pass" for row in relation_rows)),
        "purposeViewAuditSummary": dict(Counter(row["auditStatus"] for row in purpose_view_rows)),
        "phase3Allowed": ["normalized_descriptions", "questions", "sourceKeywords", "approved_tags", "pending_tags_as_reference", "evidence_ledger", "executionMode"],
        "phase3Forbidden": ["rejected_tags", "unresolved_candidate_term_as_fact", "HYPOTHESIS_as_asserted", "unreviewed_relation_graph_as_fact", "purpose_view_inference_as_fact"],
    }

    review_dir = sidecar / "review"
    write_json(sidecar / "reports" / "phase2_6-audit-report.json", audit_report)
    write_json(review_dir / "pilot-review.json", pilot_review_rows)
    write_csv(review_dir / "pilot-review.csv", pilot_review_rows, [
        "sourceType", "sourceId", "entityName", "executionMode", "layer", "facet", "surface", "controlled",
        "modality", "evidenceSource", "evidenceQuote", "confidence", "refutation", "gateWarnings",
        "reviewerDecision", "correctedSurface", "correctedControlled", "reviewerNote",
    ])
    write_json(review_dir / "vocabulary-review.json", vocab_rows)
    write_csv(review_dir / "vocabulary-review.csv", vocab_rows, [
        "candidate_term", "surface例", "entity_count", "sourceType", "proposed_controlled", "proposed_relation",
        "ambiguity", "recommendation", "evidence_examples", "reviewStatus", "note",
    ])
    write_csv(review_dir / "relation-review.csv", relation_rows, [
        "from", "relation", "to", "term", "source_tag_ids", "relation_reason", "confidence", "reviewStatus", "auditWarning",
    ])
    write_csv(review_dir / "mode-review.csv", mode_rows, [
        "sourceType", "sourceId", "entityName", "oldExecutionMode", "recalculatedExecutionMode",
        "coreAsserted", "exprAsserted", "coreHypothesis", "nearRank", "mixedRank", "nearPoolSize", "mixedPoolSize",
    ])
    write_json(review_dir / "g4-audit.json", g4_rows)
    write_json(review_dir / "hypothesis-audit.json", hypothesis_rows)
    write_json(review_dir / "purpose-view-audit.json", purpose_view_rows)
    (review_dir / "review-guide.md").write_text(
        "# MISHIRU STS-MP Phase 2.6 レビューガイド\n\n"
        "## 判定\n\n"
        "- approve: そのまま採用可能\n"
        "- fix: correctedSurface/correctedControlledを入力\n"
        "- reject: 誤りまたは根拠不足\n"
        "- needs_more_evidence: 追加証拠が必要\n\n"
        "## 注意\n\n"
        "- HYPOTHESISは確定情報として扱わない。\n"
        "- candidate_termは正式統制語ではない。\n"
        "- relation graphはreviewStatus確認後にのみ利用する。\n"
        "- 研究室・学会・ジャーナルの単一紹介行は原則EXPR assertedであり、CORE assertedではない。\n",
        encoding="utf-8",
    )
    print(json.dumps(audit_report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
