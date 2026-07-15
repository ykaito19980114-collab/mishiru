#!/usr/bin/env python3
"""Build a STS-MP sidecar pilot package for MISHIRU research resources.

Phase 2.5 constraints:
- do not write tags into normalized master JSON
- do not generate missing descriptions/questions
- do not use sourceKeywords as generated tags by themselves
- do not use AI unless a future caller explicitly wires the existing Gemini wrapper
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEME_VERSION = "mishiru-research-resource@0.1.0-draft"
PROMPT_VERSION = "deterministic-evidence-bound@0.1.0"
DATASET_DEFAULT = "mishiru-sample"

PURPOSE_SPECS = [
    {
        "purpose_id": "purpose:mishiru-search",
        "decision": "ユーザーが、自分の関心や研究したい対象に近い研究室・研究領域・学会・ジャーナルを探す。",
        "actor": "大学院進学検討者、研究初心者、社会人大学院志望者",
        "search_mode": "SUBJECT",
        "error_cost": {"false_positive": "M", "false_negative": "H"},
        "comparison_axis": "扱う対象、問い、方法、スコープ、研究領域",
        "action_vocabulary": ["探す", "比較する", "保存する", "詳しく見る"],
        "time_horizon": "年〜恒久",
        "success_signal": "検索結果の保存、詳細閲覧、研究プロジェクトへの素材利用",
    },
    {
        "purpose_id": "purpose:mishiru-discover",
        "decision": "ユーザーが、自分では検索しなかった研究世界に問いを通じて出会い、反応する。",
        "actor": "研究初心者、大学院進学検討者",
        "search_mode": "SERENDIPITY",
        "error_cost": {"false_positive": "M", "false_negative": "H"},
        "comparison_axis": "問いの近さ、問いの意外性、対象の距離、方法の違い",
        "action_vocabulary": ["出会う", "気になる", "わからない", "違う", "保存する"],
        "time_horizon": "年",
        "success_signal": "気になる反応、保存、後の問い生成への利用",
    },
    {
        "purpose_id": "purpose:mishiru-reflect-question",
        "decision": "ユーザーが、保存・反応・メモから自分の関心を理解し、研究可能なRQ候補へ変換する。",
        "actor": "大学院進学検討者、社会人大学院志望者、研究初心者",
        "search_mode": "EXPLORE",
        "error_cost": {"false_positive": "H", "false_negative": "M"},
        "comparison_axis": "ユーザー関心と研究資源の問い・対象・方法・スコープの接続",
        "action_vocabulary": ["見つめる", "問いにする", "比較する", "研究骨子を作る", "相談する"],
        "time_horizon": "月〜年",
        "success_signal": "RQ候補の採用、ResearchProject保存、相談セット作成",
    },
]

ENTITY_CONFIG = {
    "labs": {
        "source_type": "lab",
        "entity_type": "COLLECTIVE",
        "entity_prefix": "ent:COLLECTIVE:lab",
        "file": "labs.json",
        "required": ["Σ", "IS", "Q"],
        "recommended": ["M", "SC", "ST"],
        "tags_file": "labs.tags.json",
        "ledger_file": "labs.evidence.json",
    },
    "fields": {
        "source_type": "field",
        "entity_type": "RESEARCH_FIELD",
        "entity_prefix": "ent:RESEARCH_FIELD",
        "file": "fields.json",
        "required": ["Σ", "IS", "Q", "M"],
        "recommended": ["SC", "C"],
        "tags_file": "fields.tags.json",
        "ledger_file": "fields.evidence.json",
    },
    "societies": {
        "source_type": "society",
        "entity_type": "COLLECTIVE",
        "entity_prefix": "ent:COLLECTIVE:society",
        "file": "societies.json",
        "required": ["Σ", "IS", "Q"],
        "recommended": ["SC", "M", "A"],
        "tags_file": "societies.tags.json",
        "ledger_file": "societies.evidence.json",
    },
    "journals": {
        "source_type": "journal",
        "entity_type": "COLLECTIVE",
        "entity_prefix": "ent:COLLECTIVE:journal",
        "file": "journals.json",
        "required": ["Σ", "IS", "Q"],
        "recommended": ["M", "SC", "A"],
        "tags_file": "journals.tags.json",
        "ledger_file": "journals.evidence.json",
    },
}

METHOD_PATTERNS = [
    ("理論", "理論的分析"),
    ("数理モデル", "数理モデリング"),
    ("モデル化", "モデリング"),
    ("シミュレーション", "シミュレーション"),
    ("分光", "分光測定"),
    ("計測", "計測"),
    ("測る", "計測"),
    ("実験", "実験"),
    ("解析", "解析"),
    ("分析", "分析"),
    ("最適化", "最適化"),
    ("調査", "調査"),
    ("比較", "比較分析"),
    ("予測", "予測"),
]

TOO_BROAD_TERMS = {"研究", "科学", "社会", "教育", "情報", "システム", "分野", "テーマ", "学術"}
RELATION_STOP_TERMS = {
    "どのように", "どのような", "なぜ", "何を", "何が", "できる", "できるのか",
    "研究", "扱う", "明らか", "必要", "対象", "現実", "現象", "課題",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


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


def quote(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", text(value))
    return cleaned[:30]


def first_sentence(value: str, limit: int = 120) -> str:
    raw = text(value)
    if not raw:
        return ""
    parts = re.split(r"(?<=[。.!?？])", raw)
    sentence = next((part.strip() for part in parts if part.strip()), raw)
    return sentence[:limit]


def stable_uuid(*parts: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "|".join(parts)))


def source_hash(payload: Any) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def entity_id(kind: str, source_id: str) -> str:
    return f"{ENTITY_CONFIG[kind]['entity_prefix']}:{source_id}"


def evidence_record(kind: str, item: dict[str, Any], grade: str, source_field: str, raw: str, layer: str = "EXPR") -> dict[str, Any] | None:
    if not text(raw):
        return None
    ent = entity_id(kind, item["id"])
    ev_id = f"ev:{ENTITY_CONFIG[kind]['source_type']}:{item['id']}:{hashlib.sha1(source_field.encode('utf-8')).hexdigest()[:8]}"
    source_url = text(item.get("official_url") or item.get("url") or item.get("sourceUrl"))
    source_row_id = text(item.get("sourceNo") or item.get("id"))
    source_document_id = f"{DATASET_DEFAULT}:{ENTITY_CONFIG[kind]['file']}"
    # Phase 2 sample data is row-wise normalized from Excel. Multiple fields in one
    # row are useful evidence, but they are not independent chains.
    evidence_chain_id = f"chain:{source_document_id}:{source_row_id or item['id']}"
    return {
        "evidence_id": ev_id,
        "entity_id": ent,
        "grade": grade,
        "source_field": source_field,
        "source_location": f"{ENTITY_CONFIG[kind]['file']}#{item['id']}:{source_field}",
        "source_document_id": source_document_id,
        "source_url": source_url,
        "source_row_id": source_row_id,
        "source_generation_origin": "phase2_sample_excel_normalization",
        "evidence_chain_id": evidence_chain_id,
        "raw_text": raw,
        "quote": quote(raw),
        "independent_chain": False,
        "independence_status": "same_source_row",
        "layer": layer,
        "hash": hashlib.sha256(text(raw).encode("utf-8")).hexdigest(),
        "collected_at": now_iso(),
    }


def evidence_for_item(kind: str, item: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any] | None] = []
    if kind == "labs":
        rows = [
            evidence_record(kind, item, "E1", "sections.research_summary", text(item.get("sections", {}).get("research_summary"))),
            evidence_record(kind, item, "E1", "researchQuestions", " / ".join(as_list(item.get("researchQuestions") or item.get("questions")))),
            evidence_record(kind, item, "E2", "sources", " / ".join(src.get("url", "") for src in item.get("sources", []) if isinstance(src, dict)), "MANIF"),
        ]
    elif kind == "fields":
        rows = [
            evidence_record(kind, item, "E1", "beginnerDescription", text(item.get("beginnerDescription"))),
            evidence_record(kind, item, "E1", "researchPurpose", text(item.get("researchPurpose"))),
            evidence_record(kind, item, "E1", "researchObjects", " / ".join(as_list(item.get("researchObjects")))),
            evidence_record(kind, item, "E1", "representativeThemes", " / ".join(as_list(item.get("representativeThemes")))),
            evidence_record(kind, item, "E1", "methods", " / ".join(as_list(item.get("methods")))),
            evidence_record(kind, item, "E1", "questions", " / ".join(as_list(item.get("questions")))),
        ]
    elif kind == "societies":
        rows = [
            evidence_record(kind, item, "E1", "description", text(item.get("description") or item.get("beginnerDescription"))),
            evidence_record(kind, item, "E1", "questions", " / ".join(as_list(item.get("questions")))),
            evidence_record(kind, item, "E1", "relatedFields", " / ".join(as_list(item.get("relatedFields")))),
            evidence_record(kind, item, "E2", "url", text(item.get("url")), "MANIF"),
            evidence_record(kind, item, "E1", "memberCountEstimate", text(item.get("memberCountEstimate")), "MANIF"),
        ]
    else:
        rows = [
            evidence_record(kind, item, "E1", "description", text(item.get("description") or item.get("beginnerDescription"))),
            evidence_record(kind, item, "E1", "questions", " / ".join(as_list(item.get("questions")))),
            evidence_record(kind, item, "E1", "relatedFields", " / ".join(as_list(item.get("relatedFields")))),
            evidence_record(kind, item, "E1", "articleTypes", text(item.get("articleTypes"))),
            evidence_record(kind, item, "E1", "publisher", text(item.get("publisher")), "MANIF"),
            evidence_record(kind, item, "E2", "url", text(item.get("url")), "MANIF"),
        ]
    return [row for row in rows if row]


def generation_mode(kind: str, item: dict[str, Any], evidence: list[dict[str, Any]]) -> tuple[str, list[str]]:
    missing: list[str] = []
    has_description = any(ev["source_field"] in {"sections.research_summary", "beginnerDescription", "description"} for ev in evidence)
    has_questions = bool(as_list(item.get("researchQuestions") or item.get("questions")))
    has_method = bool(method_terms(item, kind))
    has_object = bool(object_terms(item, kind))
    if not has_description:
        missing.append("description")
    if not has_questions:
        missing.append("questions")
    if not has_method:
        missing.append("method")
    if not has_object:
        missing.append("object")
    if kind == "fields" and has_description and has_questions and has_method and has_object:
        return "FULL", missing
    if kind != "fields" and has_description and has_questions:
        return "RAPID", missing
    if has_description or has_questions:
        return "RAPID", missing
    return "HYPOTHESIS", missing


def confidence_cap(mode: str) -> float:
    return {"FULL": 0.82, "RAPID": 0.60, "HYPOTHESIS": 0.40}[mode]


def evidence_ids(evidence: list[dict[str, Any]], fields: set[str]) -> list[str]:
    return [ev["evidence_id"] for ev in evidence if ev["source_field"] in fields]


def evidence_refs(evidence: list[dict[str, Any]], fields: set[str]) -> list[dict[str, Any]]:
    refs = []
    for ev in evidence:
        if ev["source_field"] not in fields:
            continue
        refs.append({
            "grade": ev["grade"],
            "source": ev["source_location"],
            "quote": ev["quote"],
            "independent_chain": ev["independent_chain"],
            "evidence_id": ev["evidence_id"],
        })
    return refs


def controlled_for(facet: str, surface: str) -> tuple[str | None, str | None, dict[str, list[str]]]:
    s = text(surface)
    links = {"BT": [], "NT": [], "RT": [], "ANT": [], "UF": [], "decomposes_to": []}
    if not s:
        return None, None, links
    if facet == "Q":
        return None, s, {**links, "BT": ["研究上の問い"], "RT": ["研究関心"]}
    if facet == "M":
        controlled = {
            "数理モデリング": "モデリング",
            "理論的分析": "理論研究",
            "分光測定": "計測",
            "シミュレーション": "シミュレーション",
            "最適化": "最適化",
        }.get(s, s)
        return controlled, None, {**links, "BT": ["研究方法"]}
    if facet == "IS":
        return None, s, {**links, "BT": ["研究対象"], "RT": ["研究領域"]}
    if facet == "SC":
        return None, s, {**links, "BT": ["研究スコープ"]}
    if facet == "Σ":
        return None, s, {**links, "BT": ["要約主題"]}
    return None, s, links


def make_tag(kind: str, item: dict[str, Any], facet: str, surface: str, evidence: list[dict[str, Any]], source_fields: set[str], mode: str, *, layer: str = "CORE", confidence: float | None = None) -> dict[str, Any]:
    controlled, candidate, links = controlled_for(facet, surface)
    cap = confidence_cap(mode)
    if confidence is None:
        confidence = min(cap, 0.78 if mode == "FULL" else cap)
    if mode == "HYPOTHESIS":
        modality = "hypothesis"
    elif evidence_refs(evidence, source_fields):
        modality = "asserted"
    else:
        modality = "hypothesis"
        confidence = min(confidence, 0.40)
    tag_uuid = stable_uuid(SCHEME_VERSION, kind, item["id"], facet, surface, ",".join(sorted(source_fields)))
    warnings = []
    if text(surface) in TOO_BROAD_TERMS:
        warnings.append("too_broad_term")
    if modality == "hypothesis":
        warnings.append("insufficient_evidence_for_asserted")
    return {
        "tag_id": f"tag:{tag_uuid}",
        "entity": entity_id(kind, item["id"]),
        "layer": layer,
        "facet": facet,
        "surface": surface,
        "controlled": controlled,
        "candidate_term": candidate,
        "links": links,
        "polarity": "n/a",
        "modality": modality,
        "temporality": {"observed_at": now_iso(), "expected_decay": "durable"},
        "evidence": evidence_refs(evidence, source_fields),
        "confidence": round(confidence, 2),
        "refutation": refutation_for(facet, surface, confidence),
        "purpose_scope": "invariant",
        "derived_from": [],
        "scheme_version": SCHEME_VERSION,
        "provenance": {"generated_by": "stsmp_mishiru_pilot.py", "reviewed_by": None, "feedback": []},
        "sourceType": ENTITY_CONFIG[kind]["source_type"],
        "sourceId": item["id"],
        "sourceHash": source_hash(item),
        "dataset": DATASET_DEFAULT,
        "generationMode": mode,
        "reviewStatus": "pending",
        "warnings": warnings,
        "generatedAt": now_iso(),
        "updatedAt": now_iso(),
    }


def refutation_for(facet: str, surface: str, confidence: float) -> str:
    if confidence < 0.7:
        return ""
    if facet == "Q":
        return "追加の公式説明で、この問いが当該資源の扱う問いではないと確認される。"
    if facet == "M":
        return "公式説明または本文証拠で、この方法を用いていないことが確認される。"
    if facet == "IS":
        return "公式説明または本文証拠で、この対象を扱っていないことが確認される。"
    return "追加証拠で、この要約主題が対象全体を表さないことが確認される。"


def method_terms(item: dict[str, Any], kind: str) -> list[str]:
    if kind == "fields":
        return as_list(item.get("methods"))[:3]
    haystack = " ".join([
        text(item.get("description")),
        text(item.get("beginnerDescription")),
        text(item.get("sections", {}).get("research_summary") if isinstance(item.get("sections"), dict) else ""),
        " ".join(as_list(item.get("questions") or item.get("researchQuestions"))),
        text(item.get("articleTypes")),
    ])
    found = []
    for needle, controlled in METHOD_PATTERNS:
        if needle in haystack and controlled not in found:
            found.append(controlled)
    return found[:3]


def object_terms(item: dict[str, Any], kind: str) -> list[str]:
    if kind == "fields":
        return as_list(item.get("researchObjects"))[:4] or as_list(item.get("representativeThemes"))[:4]
    if isinstance(item.get("sections"), dict):
        description = text(item.get("sections", {}).get("research_summary"))
    else:
        description = text(item.get("description") or item.get("beginnerDescription"))
    source_terms = []
    for term in as_list(item.get("sourceKeywords")) + as_list(item.get("relatedFields")):
        if term and term in description and term not in source_terms:
            source_terms.append(term)
    if source_terms:
        return source_terms[:4]
    # Use only terms already present in descriptive evidence.
    chunks = re.split(r"[、。，,／/ ]+", description)
    candidates = [c.strip() for c in chunks if 3 <= len(c.strip()) <= 18 and not c.endswith(("する", "いる", "ある"))]
    return list(dict.fromkeys(candidates))[:3]


def scope_terms(item: dict[str, Any], kind: str) -> list[str]:
    if kind == "societies":
        kind_value = text(item.get("kind"))
        return [kind_value] if kind_value in {"国内", "国際"} else []
    if kind == "journals":
        values = [text(item.get("frequency")), text(item.get("openAccess")), text(item.get("languages"))]
        return [v for v in values if v][:2]
    if kind == "fields":
        return [text(item.get("level"))] if text(item.get("level")) else []
    return []


def tags_for_item(kind: str, item: dict[str, Any], evidence: list[dict[str, Any]], mode: str) -> list[dict[str, Any]]:
    tags: list[dict[str, Any]] = []
    tag_layer = "CORE" if kind == "fields" else "EXPR"
    description_field = "sections.research_summary" if kind == "labs" else "description"
    if kind == "fields":
        description_field = "beginnerDescription"
    description = ""
    if kind == "labs":
        description = text(item.get("sections", {}).get("research_summary") if isinstance(item.get("sections"), dict) else "")
    else:
        description = text(item.get("beginnerDescription") or item.get("description"))
    if description:
        tags.append(make_tag(kind, item, "Σ", first_sentence(description), evidence, {description_field}, mode, layer=tag_layer, confidence=min(confidence_cap(mode), 0.76)))
    for term in object_terms(item, kind)[:3]:
        if term and term not in TOO_BROAD_TERMS:
            source_fields = {"researchObjects", "representativeThemes"} if kind == "fields" else {description_field, "relatedFields"}
            tags.append(make_tag(kind, item, "IS", term, evidence, source_fields, mode, layer=tag_layer, confidence=min(confidence_cap(mode), 0.72)))
    for question in as_list(item.get("researchQuestions") or item.get("questions"))[:2]:
        tags.append(make_tag(kind, item, "Q", question, evidence, {"researchQuestions", "questions"}, mode, layer=tag_layer, confidence=min(confidence_cap(mode), 0.78)))
    for term in method_terms(item, kind)[:2]:
        source_fields = {"methods"} if kind == "fields" else {description_field, "articleTypes", "questions"}
        tags.append(make_tag(kind, item, "M", term, evidence, source_fields, mode, layer=tag_layer, confidence=min(confidence_cap(mode), 0.70)))
    for term in scope_terms(item, kind):
        tags.append(make_tag(kind, item, "SC", term, evidence, {"level", "kind", "frequency", "openAccess", "languages"}, mode, layer=tag_layer, confidence=min(confidence_cap(mode), 0.62)))
    return tags


def entity_record(kind: str, item: dict[str, Any]) -> dict[str, Any]:
    name = text(item.get("name") or item.get("nameJa"))
    return {
        "entity_id": entity_id(kind, item["id"]),
        "entity_type": ENTITY_CONFIG[kind]["entity_type"],
        "canonical_name": name,
        "existing_id": item["id"],
        "variants": [v for v in [text(item.get("nameEn"))] if v],
        "externalIdentifiers": {
            "url": text(item.get("official_url") or item.get("url")),
            "sourceNo": text(item.get("sourceNo")),
        },
        "identification_basis": "Phase 2 normalized JSON id + sourceNo/name/url when present",
    }


def layer_map(kind: str, item: dict[str, Any]) -> dict[str, list[str]]:
    if kind == "labs":
        return {"CORE": ["researchQuestions"], "EXPR": ["sections.research_summary"], "MANIF": ["sources", "official_url"], "INST": []}
    if kind == "fields":
        return {"CORE": ["beginnerDescription", "researchPurpose", "questions"], "EXPR": ["researchObjects", "methods", "representativeThemes"], "MANIF": [], "INST": []}
    if kind == "societies":
        return {"CORE": ["description", "questions"], "EXPR": ["relatedFields"], "MANIF": ["url", "memberCountEstimate"], "INST": []}
    return {"CORE": ["description", "questions"], "EXPR": ["relatedFields", "articleTypes"], "MANIF": ["url", "publisher"], "INST": []}


def purpose_views(item: dict[str, Any], tags: list[dict[str, Any]]) -> dict[str, Any]:
    by_facet = defaultdict(list)
    for tag in tags:
        by_facet[tag["facet"]].append(tag)
    q_tags = by_facet["Q"]
    is_tags = by_facet["IS"]
    m_tags = by_facet["M"]
    return {
        "search": {
            "terms": [t["controlled"] or t["candidate_term"] for t in tags if t["facet"] in {"Σ", "IS", "Q", "M", "SC"}],
            "synonym_expansion": [],
            "methods": [t["controlled"] or t["candidate_term"] for t in m_tags],
            "scope": [t["controlled"] or t["candidate_term"] for t in by_facet["SC"]],
            "reason_tag_ids": [t["tag_id"] for t in tags if t["facet"] in {"Σ", "IS", "Q", "M", "SC"}],
            "derived_from": [t["tag_id"] for t in tags if t["facet"] in {"Σ", "IS", "Q", "M", "SC"}],
        },
        "discover": {
            "display_question": q_tags[0]["surface"] if q_tags else "",
            "why": "問いタグと対象タグを根拠に、研究世界との接点として提示可能。",
            "near_questions": [t["surface"] for t in q_tags],
            "surprise_basis": "Qが近くISが離れる候補を優先するための根拠候補。",
            "reason_tag_ids": [t["tag_id"] for t in q_tags + is_tags + m_tags],
            "derived_from": [t["tag_id"] for t in q_tags + is_tags + m_tags],
        },
        "research_support": {
            "formalized_interest": q_tags[0]["surface"] if q_tags else "",
            "object_limits": [t["surface"] for t in is_tags],
            "method_candidates": [t["surface"] for t in m_tags],
            "connected_resources": [],
            "feasibility_checks": {
                "observable": "unknown",
                "feasible_in_period": "unknown",
                "prior_research_connection": "unknown",
                "not_trivial": "unknown",
            },
            "rq_candidates": [],
            "limits": "Phase 2.5ではユーザーDEMANDを生成しない。",
            "significance": "研究資源側のQ/IS/Mをユーザー関心整理の素材として保持する。",
            "reason_tag_ids": [t["tag_id"] for t in q_tags + is_tags + m_tags],
            "derived_from": [t["tag_id"] for t in q_tags + is_tags + m_tags],
            "insufficient_materials": [key for key, values in {"Q": q_tags, "IS": is_tags, "M": m_tags}.items() if not values],
        },
    }


def quality_for_item(kind: str, item: dict[str, Any], tags: list[dict[str, Any]], missing_evidence: list[str], reverse_rank: int | None) -> dict[str, Any]:
    asserted = [t for t in tags if t["modality"] == "asserted"]
    hypothesis = [t for t in tags if t["modality"] == "hypothesis"]
    empty_facets = [facet for facet in ENTITY_CONFIG[kind]["required"] if not any(t["facet"] == facet for t in tags)]
    g = {
        "G1": {"pass": True, "notes": []},
        "G2": {"pass": all(t["evidence"] for t in asserted), "notes": []},
        "G3": {"pass": not any(t["surface"] in TOO_BROAD_TERMS for t in tags), "notes": []},
        "G4": {"pass": reverse_rank is not None and reverse_rank <= 3, "reverse_rank": reverse_rank, "notes": []},
        "G5": {"pass": all(t["controlled"] or t["candidate_term"] for t in tags), "notes": []},
        "G6": {"pass": all(t["purpose_scope"] == "invariant" for t in tags), "notes": []},
        "G7": {"pass": all(t["confidence"] < 0.7 or bool(t["refutation"]) for t in tags), "notes": []},
    }
    reject_candidates = [t["tag_id"] for t in tags if "too_broad_term" in t["warnings"]]
    isolated = [t["tag_id"] for t in hypothesis]
    return {
        "entity_id": entity_id(kind, item["id"]),
        "sourceType": ENTITY_CONFIG[kind]["source_type"],
        "sourceId": item["id"],
        "generationMode": tags[0]["generationMode"] if tags else "HYPOTHESIS",
        "tagCount": len(tags),
        "assertedCount": len(asserted),
        "hypothesisCount": len(hypothesis),
        "tensionCount": sum(1 for t in tags if t["modality"] == "tension"),
        "emptyFacets": empty_facets,
        "missingEvidence": missing_evidence,
        "gates": g,
        "isolatedTags": isolated,
        "rejectCandidates": reject_candidates,
        "nearestComparison": [],
        "reverseRank": reverse_rank,
        "identificationPass": reverse_rank is not None and reverse_rank <= 3,
    }


def select_items(kind: str, items: list[dict[str, Any]], limit: int, offset: int, ids: set[str] | None) -> list[dict[str, Any]]:
    if ids:
        return [item for item in items if item["id"] in ids][:limit]
    scored = []
    for index, item in enumerate(items):
        evidence = evidence_for_item(kind, item)
        mode, missing = generation_mode(kind, item, evidence)
        score = 0
        score += 10 if mode == "FULL" else 4 if mode == "RAPID" else 0
        score += len(as_list(item.get("questions") or item.get("researchQuestions"))) * 3
        if isinstance(item.get("sections"), dict):
            has_description = bool(text(item.get("sections", {}).get("research_summary")))
        else:
            has_description = bool(text(item.get("description") or item.get("beginnerDescription")))
        score += 2 if has_description else 0
        score -= len(missing)
        diversity_key = "|".join([
            text(item.get("kingdom")),
            text(item.get("division")),
            text(item.get("className")),
            text(item.get("orderName")),
        ]).strip("|") or "|".join(object_terms(item, kind)[:1] or as_list(item.get("sourceKeywords"))[:1] or as_list(item.get("relatedFields"))[:1])
        scored.append((score, diversity_key, index, item))
    max_score = max((row[0] for row in scored), default=0)
    candidates = [row for row in scored if row[0] >= max_score - 3]
    if len(candidates) < limit:
        candidates = [row for row in scored if row[0] > 0]
    candidates.sort(key=lambda row: row[2])
    if len(candidates) > limit:
        span = len(candidates) - 1
        picked_indexes = [round(i * span / (limit - 1)) for i in range(limit)] if limit > 1 else [0]
        even_candidates = [candidates[i] for i in picked_indexes]
    else:
        even_candidates = candidates
    even_candidates.sort(key=lambda row: (-row[0], row[2]))
    selected = []
    seen_diversity: set[str] = set()
    for _, key, _, item in even_candidates[offset:]:
        if len(selected) >= limit:
            break
        if key and key in seen_diversity and len(selected) < limit // 2:
            continue
        selected.append(item)
        if key:
            seen_diversity.add(key)
    for _, _, _, item in even_candidates[offset:] + sorted(scored, key=lambda row: (-row[0], row[2])):
        if len(selected) >= limit:
            break
        if item not in selected:
            selected.append(item)
    return selected


def reverse_ranks(all_tags_by_kind: dict[str, list[dict[str, Any]]]) -> dict[str, int | None]:
    ranks: dict[str, int | None] = {}
    by_kind_entity: dict[str, dict[str, list[str]]] = defaultdict(dict)
    for kind, tags in all_tags_by_kind.items():
        for tag in tags:
            by_kind_entity[kind].setdefault(tag["entity"], []).append(text(tag["controlled"] or tag["candidate_term"] or tag["surface"]))
    for kind, entities in by_kind_entity.items():
        for entity, terms in entities.items():
            source_set = set(terms)
            scores = []
            for candidate, candidate_terms in entities.items():
                other = set(candidate_terms)
                overlap = len(source_set & other)
                scores.append((candidate, overlap))
            scores.sort(key=lambda row: (-row[1], row[0]))
            rank = next((i + 1 for i, (candidate, _) in enumerate(scores) if candidate == entity), None)
            ranks[entity] = rank
    return ranks


def relation_graph(all_tags_by_kind: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    tags = [tag for values in all_tags_by_kind.values() for tag in values]
    by_facet_term: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for tag in tags:
        for term in relation_terms(tag):
            by_facet_term[(tag["facet"], term)].append(tag)
    edges = []
    for (facet, term), group in by_facet_term.items():
        if len(group) < 2:
            continue
        relation = "shares_question" if facet == "Q" else "same_object_different_method" if facet == "IS" else "shares_value" if facet == "V" else ""
        if not relation:
            continue
        for i, left in enumerate(group):
            for right in group[i + 1:]:
                if left["entity"] == right["entity"]:
                    continue
                edges.append({
                    "from": left["entity"],
                    "relation": relation,
                    "to": right["entity"],
                    "term": term,
                    "facet": facet,
                    "source_tag_ids": [left["tag_id"], right["tag_id"]],
                    "evidence_tag_ids": [left["tag_id"], right["tag_id"]],
                    "relation_reason": f"{facet}ファセットの共通語「{term}」を共有。ただしPhase 2.6監査では意味的近接の人間確認が必要。",
                    "confidence": 0.45,
                    "reviewStatus": "pending",
                    "scheme_version": SCHEME_VERSION,
                })
    # Complements: same object with different methods in pilot scope.
    by_entity = defaultdict(list)
    for tag in tags:
        by_entity[tag["entity"]].append(tag)
    object_to_entities = defaultdict(set)
    method_by_entity = defaultdict(set)
    for tag in tags:
        terms = relation_terms(tag)
        if tag["facet"] == "IS":
            for term in terms:
                object_to_entities[term].add(tag["entity"])
        if tag["facet"] == "M":
            term = text(tag.get("controlled") or tag.get("candidate_term"))
            method_by_entity[tag["entity"]].add(term)
    for term, entities in object_to_entities.items():
        entity_list = sorted(entities)
        for i, left in enumerate(entity_list):
            for right in entity_list[i + 1:]:
                if method_by_entity[left] and method_by_entity[right] and method_by_entity[left] != method_by_entity[right]:
                    edges.append({
                        "from": left,
                        "relation": "same_object_different_method",
                        "to": right,
                        "term": term,
                        "facet": "IS/M",
                        "source_tag_ids": [t["tag_id"] for t in by_entity[left] + by_entity[right] if t["facet"] in {"IS", "M"}][:6],
                        "evidence_tag_ids": [t["tag_id"] for t in by_entity[left] + by_entity[right] if t["facet"] in {"IS", "M"}][:6],
                        "relation_reason": f"IS共通語「{term}」があり、Mファセットが異なる可能性がある。",
                        "confidence": 0.50,
                        "reviewStatus": "pending",
                        "scheme_version": SCHEME_VERSION,
                    })
    return edges[:200]


def relation_terms(tag: dict[str, Any]) -> list[str]:
    raw = text(tag.get("controlled") or tag.get("candidate_term") or tag.get("surface"))
    if not raw:
        return []
    chunks = re.split(r"[、。，,.／/・\s（）()「」『』:：]+", raw)
    terms: list[str] = []
    for chunk in chunks:
        value = chunk.strip()
        value = re.sub(r"(する|した|している|として|について|に関する|を扱う|を対象とする)$", "", value)
        if len(value) < 3 or len(value) > 18:
            continue
        if value in RELATION_STOP_TERMS or value in TOO_BROAD_TERMS:
            continue
        if re.fullmatch(r"[0-9A-Za-z_-]+", value):
            continue
        terms.append(value)
    if tag["facet"] in {"M", "SC"} and raw not in terms and raw not in RELATION_STOP_TERMS:
        terms.append(raw)
    return list(dict.fromkeys(terms))[:6]


def vocabulary_candidates(tags: list[dict[str, Any]]) -> list[dict[str, Any]]:
    candidates = []
    seen = set()
    for tag in tags:
        term = tag.get("candidate_term")
        if not term or term in seen:
            continue
        seen.add(term)
        candidates.append({
            "candidate_term": term,
            "facet": tag["facet"],
            "definitionProposal": f"{tag['facet']}ファセットにおける「{term}」。",
            "synonymCandidates": tag["links"].get("UF", []),
            "qualifierCandidates": [],
            "BT": tag["links"].get("BT", []),
            "NT": tag["links"].get("NT", []),
            "RT": tag["links"].get("RT", []),
            "ANT": tag["links"].get("ANT", []),
            "adoption": "hold_for_human_review",
            "evidence": tag["evidence"][:1],
            "scheme_version": SCHEME_VERSION,
        })
    return candidates


def scheme_json() -> dict[str, Any]:
    return {
        "scheme_version": SCHEME_VERSION,
        "base_protocol": "STS-MP v1.0",
        "status": "draft",
        "entity_config": ENTITY_CONFIG,
        "purpose_specs": PURPOSE_SPECS,
        "facet_policy": {
            "required": {kind: cfg["required"] for kind, cfg in ENTITY_CONFIG.items()},
            "recommended": {kind: cfg["recommended"] for kind, cfg in ENTITY_CONFIG.items()},
        },
        "review_policy": {
            "actions": ["approve", "fix", "reject", "useful"],
            "reviewStatus": ["pending", "approved", "rejected", "needs_revision"],
            "production_use": "approved_only",
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", default=DATASET_DEFAULT)
    parser.add_argument("--sourceType", choices=["all", "lab", "field", "society", "journal", "labs", "fields", "societies", "journals"], default="all")
    parser.add_argument("--ids", default="")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--mode", choices=["pilot", "dry-run"], default="pilot")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--retry", type=int, default=0)
    parser.add_argument("--concurrency", type=int, default=1)
    parser.add_argument("--rate-limit", type=float, default=0.0)
    parser.add_argument("--changed-only", action="store_true")
    parser.add_argument("--scheme-version", default=SCHEME_VERSION)
    parser.add_argument("--prompt-version", default=PROMPT_VERSION)
    parser.add_argument("--output-dir", type=Path, default=Path("data/mishiru-sample-derived/stsmp"))
    parser.add_argument("--input-dir", type=Path, default=Path("data/mishiru-sample-normalized"))
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    source_type_aliases = {"lab": "labs", "field": "fields", "society": "societies", "journal": "journals"}
    kinds = ["labs", "fields", "societies", "journals"] if args.sourceType == "all" else [source_type_aliases.get(args.sourceType, args.sourceType)]
    id_filter = {part.strip() for part in args.ids.split(",") if part.strip()} or None
    all_tags_by_kind: dict[str, list[dict[str, Any]]] = {}
    all_ledgers_by_kind: dict[str, list[dict[str, Any]]] = {}
    pipeline_records: list[dict[str, Any]] = []
    pilot_targets: list[dict[str, Any]] = []

    for kind in kinds:
        cfg = ENTITY_CONFIG[kind]
        items = read_json(args.input_dir / cfg["file"])
        selected = select_items(kind, items, args.limit, args.offset, id_filter)
        tags_for_kind: list[dict[str, Any]] = []
        ledger_for_kind: list[dict[str, Any]] = []
        for item in selected:
            ev = evidence_for_item(kind, item)
            mode, missing = generation_mode(kind, item, ev)
            tags = tags_for_item(kind, item, ev, mode)
            tags_for_kind.extend(tags)
            ledger_for_kind.extend(ev)
            entity = entity_record(kind, item)
            pipeline_records.append({
                "P0_PurposeSpec": PURPOSE_SPECS,
                "P1_EntityRecord": entity,
                "P2_LayerMap": layer_map(kind, item),
                "P3_EvidenceLedger": [row["evidence_id"] for row in ev],
                "P4_InvariantTags": [tag["tag_id"] for tag in tags],
                "P5_ControlledTags": [tag["tag_id"] for tag in tags],
                "P6_RelationGraph": "deferred_until_batch",
                "P7_PurposeViews": purpose_views(item, tags),
                "P8_QualityReport": "deferred_until_reverse_rank",
                "P9_OutputPackage": {
                    "scheme_version": args.scheme_version,
                    "prompt_version": args.prompt_version,
                    "sourceHash": source_hash(item),
                },
                "missingEvidence": missing,
            })
            pilot_targets.append({
                "sourceType": cfg["source_type"],
                "sourceId": item["id"],
                "entity_id": entity["entity_id"],
                "canonical_name": entity["canonical_name"],
                "generationMode": mode,
                "missingEvidence": missing,
            })
        all_tags_by_kind[kind] = tags_for_kind
        all_ledgers_by_kind[kind] = ledger_for_kind

    ranks = reverse_ranks(all_tags_by_kind)
    quality_items = []
    for kind, tags in all_tags_by_kind.items():
        by_entity = defaultdict(list)
        for tag in tags:
            by_entity[tag["entity"]].append(tag)
        items = {item["id"]: item for item in read_json(args.input_dir / ENTITY_CONFIG[kind]["file"])}
        for ent, ent_tags in by_entity.items():
            source_id = ent_tags[0]["sourceId"]
            _, missing = generation_mode(kind, items[source_id], evidence_for_item(kind, items[source_id]))
            quality_items.append(quality_for_item(kind, items[source_id], ent_tags, missing, ranks.get(ent)))

    all_tags = [tag for tags in all_tags_by_kind.values() for tag in tags]
    relations = relation_graph(all_tags_by_kind)
    by_mode = Counter(target["generationMode"] for target in pilot_targets)
    gate_totals = {}
    for gate in [f"G{i}" for i in range(1, 8)]:
        total = len(quality_items)
        passed = sum(1 for item in quality_items if item["gates"][gate]["pass"])
        gate_totals[gate] = {"passed": passed, "total": total, "rate": round(passed / total, 3) if total else 0}
    g4_total = gate_totals["G4"]["total"]
    g4_rate = gate_totals["G4"]["passed"] / g4_total if g4_total else 0
    pilot_report = {
        "scheme_version": args.scheme_version,
        "prompt_version": args.prompt_version,
        "dataset": args.dataset,
        "generatedAt": now_iso(),
        "apiUsage": {"provider": "none", "calls": 0, "estimatedCostUsd": 0},
        "pilotTargets": pilot_targets,
        "modeBreakdown": dict(by_mode),
        "tagCounts": {
            "total": len(all_tags),
            "asserted": sum(1 for tag in all_tags if tag["modality"] == "asserted"),
            "hypothesis": sum(1 for tag in all_tags if tag["modality"] == "hypothesis"),
            "tension": sum(1 for tag in all_tags if tag["modality"] == "tension"),
            "bySourceType": {kind: len(tags) for kind, tags in all_tags_by_kind.items()},
        },
        "gates": gate_totals,
        "g4": {
            "passed": gate_totals["G4"]["passed"],
            "total": g4_total,
            "rate": round(g4_rate, 3),
            "v1Candidate": g4_total >= 10 and g4_rate >= 0.8,
            "note": "v1.0候補はG4 80%以上が必要。未達の場合はv0.1のままS4/S5へ戻す。",
        },
        "isolatedTags": [tag["tag_id"] for tag in all_tags if tag["modality"] == "hypothesis"],
        "rejectCandidates": [tag["tag_id"] for tag in all_tags if "too_broad_term" in tag["warnings"]],
        "missingEvidence": {target["entity_id"]: target["missingEvidence"] for target in pilot_targets},
    }
    quality_report = {"scheme_version": args.scheme_version, "items": quality_items, "gateTotals": gate_totals}

    if args.dry_run or args.mode == "dry-run":
        print(json.dumps({"pilotTargets": pilot_targets, "tagCount": len(all_tags), "g4": pilot_report["g4"]}, ensure_ascii=False, indent=2))
        return

    out = args.output_dir
    write_json(out / "scheme" / "mishiru-research-resource-scheme.v0.1.json", scheme_json())
    for kind, tags in all_tags_by_kind.items():
        write_json(out / "tags" / ENTITY_CONFIG[kind]["tags_file"], tags)
        write_json(out / "ledgers" / ENTITY_CONFIG[kind]["ledger_file"], all_ledgers_by_kind[kind])
    write_json(out / "reports" / "pilot-report.json", pilot_report)
    write_json(out / "reports" / "quality-gates.json", quality_report)
    write_json(out / "reports" / "vocabulary-candidates.json", vocabulary_candidates(all_tags))
    write_json(out / "reports" / "relation-graph.json", {"scheme_version": args.scheme_version, "edges": relations})
    write_json(out / "pipeline" / "pilot-pipeline-trace.json", pipeline_records)
    print(json.dumps({"written": str(out), "targets": len(pilot_targets), "tagCount": len(all_tags), "g4": pilot_report["g4"], "apiUsage": pilot_report["apiUsage"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
