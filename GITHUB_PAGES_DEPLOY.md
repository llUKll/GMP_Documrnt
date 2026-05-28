# GitHub Pages Root 배포 방법

이 패키지는 GitHub Pages를 `main / (root)`로 설정해서 실행하도록 구성되어 있습니다.

## 1. GitHub에 업로드

압축을 푼 뒤 `Document` 폴더 안의 내용을 레포지토리 최상단에 업로드합니다.

최상단 구조가 아래처럼 보여야 합니다.

```text
index.html
.nojekyll
src/
backend/
frontend/
README.md
```

중요한 앱 실행 파일은 다음입니다.

```text
index.html
src/styles.css
src/standalone.js
```

## 2. Pages 설정

GitHub 저장소에서:

```text
Settings → Pages
Source: Deploy from a branch
Branch: main
Folder: / (root)
Save
```

## 3. 접속

```text
https://llukll.github.io/Document/
```

## 4. 캐시 문제

반영 직후 예전 README 화면이 보이면 `Ctrl + Shift + R` 또는 브라우저 캐시 삭제 후 다시 접속합니다.


## 기능 업데이트

- 참조파일과 첨부파일 모두 ZIP 첨부를 지원합니다.
- 참조 ZIP 내부의 HWP/HWPX/DOCX/PDF/TXT는 결과물 형식 기준 후보로 사용합니다.
- 첨부 ZIP 내부의 Android 코드, 설정, 보고서, 로그, 화면/영상 파일명은 현재 구현 근거로 사용합니다.
- 문서 아키텍처 생성 버튼은 제거했고, `분석 및 초안 생성`에서 바로 초안을 생성합니다.
