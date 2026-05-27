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

- 문서 아키텍처 생성: 전체 섹션 구조, 근거 파일 매핑, 작성 흐름, Claim 관리 표를 먼저 생성합니다.
