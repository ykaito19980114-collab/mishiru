# MISHIRU STS-MP Phase 2.6 レビューガイド

## 判定

- approve: そのまま採用可能
- fix: correctedSurface/correctedControlledを入力
- reject: 誤りまたは根拠不足
- needs_more_evidence: 追加証拠が必要

## 注意

- HYPOTHESISは確定情報として扱わない。
- candidate_termは正式統制語ではない。
- relation graphはreviewStatus確認後にのみ利用する。
- 研究室・学会・ジャーナルの単一紹介行は原則EXPR assertedであり、CORE assertedではない。
