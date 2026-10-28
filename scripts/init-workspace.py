"""Create private local reference folders after cloning; never overwrite existing metadata."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for name in ('업로드원본', '에이전트변환데이터', '.sites-runtime'):
    (ROOT / name).mkdir(exist_ok=True)
index = ROOT / '에이전트변환데이터' / 'INDEX.md'
if not index.exists():
    index.write_text('# PYTHONHOME 에이전트 변환 데이터 색인\n\n새 체크아웃의 빈 색인입니다. 다른 PC에서 보존한 원본·분석이 있다면 먼저 함께 복사하고 SHA256을 대조합니다. 보존·분석 완료 자료가 없다고 단정하지 않습니다. AGENTS.md 규칙을 따릅니다.\n\n| 자료명 | 원본 경로 | 원본 SHA256 | 추출내용 해시 | 요약·목차 MD | 분석 상태·완료일 | 이전 버전·변경 요약 |\n| --- | --- | --- | --- | --- | --- | --- |\n', encoding='utf-8')
print('Private workspace folders ready; existing INDEX preserved.')
