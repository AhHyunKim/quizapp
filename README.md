# Google Sheets 기반 문제풀이 웹앱

Google Sheets를 문제 데이터의 기준(Source of Truth)으로 쓰고, 사용자의 학습 기록(오답/북마크/즐겨찾기/통계 등)은
브라우저 LocalStorage에만 저장하는 정적 웹앱입니다. 앱을 다시 배포하지 않아도 시트 링크를 추가하거나 시트를 수정하면 
다음 접속부터 바로 반영됩니다.

## 폴더 구조

```
index.html          진입점 (레이아웃, 화면 골격)
css/style.css        스타일
js/dataLoader.js      Google Sheets/CSV → Question[] 변환 (데이터 접근 계층)
js/storageManager.js  LocalStorage 기반 사용자 학습 데이터 (저장 계층)
js/menuBuilder.js     과목/소과목 → 메뉴 트리 생성
js/quizEngine.js      문제풀이 세션(순서/진행/채점) 관리
js/statsManager.js    저장된 데이터를 통계용으로 집계
js/app.js             위 모듈들을 화면(DOM)에 연결하는 컨트롤러
data/sample.csv       테스트용 샘플 문제 (업로드해 주신 파일)
```

기능별로 파일이 분리되어 있어, 예를 들어 "정답 채점 방식"을 바꾸고 싶으면 `quizEngine.js`만,
"저장 위치를 서버 DB로 바꾸고 싶다"면 `storageManager.js`만 손보면 됩니다.

## 실행 방법

```bash
# 이 폴더에서
python3 -m http.server 8000
# 이후 브라우저에서 http://localhost:8000 접속
```

또는 GitHub Pages

## Google Sheets 연결하기

1. 시트를 `ID, 과목, 소과목, 문제, 정답` 순서의 헤더로 준비합니다. (그 외 컬럼은 자유롭게 추가 가능)
2. 시트 메뉴에서 **파일 → 공유 → 웹에 게시(Publish to web)** 로 게시하거나, 최소한 "링크가 있는 모든 사용자
   보기 가능"으로 공유 설정을 바꿉니다.
3. 앱의 **설정 → Google Sheets 연결**에 시트 URL을 붙여넣고 저장합니다. 일반 공유 링크를 붙여넣어도
   앱이 자동으로 CSV 내보내기 URL로 변환합니다.
4. 이후 시트 내용을 수정하면(문제 추가/수정, 과목/소과목 추가) 앱을 껐다 켜거나 새로고침할 때 자동으로
   최신 데이터를 다시 불러옵니다. 메뉴(과목/소과목 트리)도 시트 내용을 기준으로 매번 새로 만들어집니다.

시트가 아직 없다면 **설정 → 로컬 CSV로 대신 불러오기**에서 "번들 샘플 데이터 불러오기"로 먼저
동작을 확인해 볼 수 있습니다.

## 데이터 분리 원칙

- **문제 데이터** (Google Sheets): ID/과목/소과목/문제/정답 등. 앱 내부에 저장하지 않고 매번 원본에서 불러옵니다.
- **학습 데이터** (LocalStorage, 브라우저별로 별도 저장): 오답목록, 북마크, 즐겨찾기, 문제별 풀이횟수/정답률,
  회독별 점수, 과목별 통계, 마지막 학습 위치, 다크모드 설정. 전부 **문제 ID 기준**으로 저장되므로 시트에서
  문제 순서가 바뀌거나 새 문제가 추가돼도 기존 기록이 깨지지 않습니다.

## 향후 컬럼 확장 (난이도/해설/보기1~5/이미지 URL 등)

`dataLoader.js`의 `parseQuestion()`은 시트의 모든 컬럼을 헤더명 그대로 Question 객체에 실어 보냅니다.
즉 시트에 `해설`, `난이도`, `이미지URL` 같은 컬럼을 추가해도 **데이터 로딩 코드는 수정할 필요가 없습니다.**
다만 그 값을 화면에 "표시"하려면 `app.js`의 `renderQuizCard()`에서 원하는 위치에 한 줄 추가해 주면 됩니다.
예:

```js
${q.해설 ? `<div class="qcard-answer-label">해설</div><div>${escapeHtml(q.해설)}</div>` : ''}
```

## 기술 메모

- CSV 파싱은 따옴표로 묶인 필드(콤마/개행 포함)까지 처리하는 자체 파서를 사용합니다 (외부 라이브러리 없음).
- 폰트는 Noto Serif KR / Noto Sans KR / IBM Plex Mono (Google Fonts CDN). 오프라인 환경에서는 시스템
  폰트로 자연스럽게 대체됩니다.
- 다크모드, 마지막 학습 위치 등은 새로고침해도 유지됩니다 (LocalStorage).
