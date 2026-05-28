# Document Insight OS - GitHub Pages Root Build

브라우저 단독 실행용 정적 웹앱입니다. `main / (root)` GitHub Pages 설정으로 실행합니다.

## 주요 기능

- DOCX, PDF, XLSX, TXT, MD, CSV, ZIP, HWPX, HWP, Android 소스 파일 첨부
- 참조파일 1개를 별도로 첨부해 결과물의 목차, 문체, 표 구성, 검토 메모 형식을 맞춤
- 참조파일에도 ZIP 첨부를 지원하며, ZIP 내부 HWP/HWPX/DOCX/PDF/TXT 문서를 형식 참조 후보로 분석
- 분석 첨부파일 최대 10개 지원
- 파일 칩 클릭 시 추출 텍스트/메타데이터 열어보기 지원
- 첨부파일 ZIP 내부의 Android Manifest/Gradle/resources/source, 보고서, 로그, 화면/영상 파일명 근거 추출
- Regulatory Doc Generator 스킬 기반 인허가 문서 초안 생성
- Gemini API Key가 있으면 Gemini 직접 호출, 없으면 로컬 체크리스트 초안 생성
- Word `.docx` 다운로드

## GitHub Pages 설정

- Source: Deploy from a branch
- Branch: main
- Folder: / (root)

## 보안 주의

Gemini API Key는 서버가 아니라 현재 브라우저 localStorage에 저장됩니다. 운영 서비스에서는 백엔드에서 키를 관리하는 구조가 안전합니다.
## Update Notes

- 기본 Gemini 모델을 `gemini-2.5-pro`로 변경하고, 인허가 상세설계 문서용 2단계 분석 파이프라인을 추가했습니다.
- 편집기 `검토 및 저장` 버튼은 오른쪽 하단에 고정되며, Gemini API Key가 있을 때 현재 편집 내용을 검토/보완한 뒤 저장합니다.
- Gemini API Key가 없으면 현재 편집본만 브라우저 localStorage에 저장합니다.

- 문서 아키텍처 생성 버튼은 제거했고, `분석 및 초안 생성`에서 참조파일/첨부 ZIP을 한 번에 반영합니다.
