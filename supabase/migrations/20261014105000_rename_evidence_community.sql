-- 근거 수준 이름 변경: 추정 → 커뮤니티 추정 (공식 / 커뮤니티 추정 / 기타, 2026-10-14)
-- 저장된 값은 함께 바뀐다. DB 함수는 '기타'만 직접 비교하므로 영향 없음.
alter type public.evidence_level rename value '추정' to '커뮤니티 추정';
