# Document Insight OS - GitHub Pages Root Build

브라우저 단독 실행용 정적 웹앱입니다. `main / (root)` GitHub Pages 설정으로 실행합니다.

## 주요 기능

- DOCX, PDF, XLSX, TXT, MD, CSV, ZIP, HWPX, HWP, Android 소스 파일 첨부
- 참조파일 1개를 별도로 첨부해 결과물의 목차, 문체, 표 구성, 검토 메모 형식을 맞춤
- 분석 첨부파일 최대 10개 지원
- 파일 칩 클릭 시 추출 텍스트/메타데이터 열어보기 지원
- Android 프로젝트 ZIP 첨부 후 Manifest/Gradle/resources/source 근거 추출
- Regulatory Doc Generator 스킬 기반 인허가 문서 초안 생성
- `문서 아키텍처 생성` 버튼으로 전체 문서의 섹션 설계, 근거 파일 매핑, 작성 흐름, Claim 관리 표를 먼저 생성할 수 있습니다.
- Gemini API Key가 있으면 Gemini 직접 호출, 없으면 로컬 체크리스트 초안 생성
- Word `.docx` 다운로드

## GitHub Pages 설정

- Source: Deploy from a branch
- Branch: main
- Folder: / (root)

## 보안 주의

Gemini API Key는 서버가 아니라 현재 브라우저 localStorage에 저장됩니다. 운영 서비스에서는 백엔드에서 키를 관리하는 구조가 안전합니다.
## Update Notes

- 기본 Gemini 모델을 `gemini-2.5-flash-lite`로 변경했습니다.
- 편집기 `검토 및 저장` 버튼은 오른쪽 하단에 고정되며, Gemini API Key가 있을 때 현재 편집 내용을 검토/보완한 뒤 저장합니다.
- Gemini API Key가 없으면 현재 편집본만 브라우저 localStorage에 저장합니다.
