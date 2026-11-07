# 퀴즈앱 개선 실행 계획 (Sonnet 5.5 실행용)

> 이 문서는 Claude Code(Sonnet 5.5)가 **한 번에 한 Task씩** 실행하도록 작성됐다.
> 세션을 시작할 때 "IMPROVEMENT_PLAN.md의 Task 1.1을 진행해줘"처럼 요청하면 된다.
> 각 Task는 커밋 1개로 끝나야 하며, 완료 후 아래 [진행 현황](#진행-현황) 체크박스를 갱신한다.

---

## 0. 공통 규칙 (모든 Task에 적용)

### 프로젝트 개요
- 빌드 도구 없는 **순수 정적 웹앱** (HTML + CSS + ES Module JS). npm/번들러/프레임워크 도입 금지.
- 문제 데이터: Google Sheets CSV(또는 `data/*.csv`) → `js/dataLoader.js`가 Question 객체로 변환.
- 학습 데이터: `js/storageManager.js`가 LocalStorage에 저장 (+ 선택적 Apps Script 동기화).
- 두 가지 모드: `default`(빈출문제, 주관식 자가채점) / `exam`(기출문제, 보기 4개 이상 객관식).
- 화면 컨트롤러는 `js/app.js` 한 파일(약 1,100줄)에 몰려 있다.

### 반드시 지킬 것
1. **LocalStorage 키 호환성 유지**: `storageManager.js`의 `KEYS`(`qa_*_v1`)와 모드 접미사(`_exam`) 구조를 바꾸지 않는다.
   새 데이터가 필요하면 **새 키를 추가**한다 (예: `qa_daily_log_v1`). 기존 필드에 값을 추가할 때는 없을 때의 기본값을 처리해 기존 기록이 깨지지 않게 한다.
2. **외부 라이브러리**는 CDN(`cdn.jsdelivr.net`)에서 **버전 고정**으로만 추가한다. 현재 사용 중: KaTeX 0.16.11, Google Fonts.
3. **정답 HTML 렌더링 유지**: 정답(`q.answer`)은 표·수식 표시를 위해 의도적으로 HTML 그대로 출력한다 (커밋 679564d). escape로 바꾸지 말 것. (Task 1.3에서 sanitize만 추가)
4. **KaTeX 렌더링 유지**: `renderQuizCard()` 끝의 `renderMathInElement` 호출이 카드가 다시 그려질 때마다 실행돼야 한다.
5. 기존 코드 스타일을 따른다: 한국어 주석, 2칸 들여쓰기, 세미콜론, `$` 헬퍼와 `el` 맵, 템플릿 리터럴 렌더링.
6. Task 범위 밖의 리팩터링은 하지 않는다. 범위 밖 문제는 이 문서 하단 "발견 사항"에 적어 둔다.

### 작업 흐름 (매 Task)
1. `main` 최신화 후 브랜치 생성: `git checkout -b task/<번호>-<짧은이름>`
2. 구현
3. **검증** (아래 "검증 방법") — 콘솔 에러 0개
4. 한국어 메시지로 커밋 (예: `오답노트 졸업 규칙 추가`) → push/PR/merge 여부는 사용자에게 확인
5. 이 문서의 진행 현황 체크

### 검증 방법
```bash
python -m http.server 8000
```
- 브라우저(내장 브라우저 pane 가능)로 `http://localhost:8000` 접속
- 설정 → "번들 샘플 데이터 불러오기"로 `data/sample.csv` 로드 (빈출 모드)
- 기출 모드로 전환해 기출 샘플(`data/exam-sample.csv`) 로드 확인
- 모바일 폭(375px)과 다크모드에서도 확인
- **회귀 체크리스트**: 정답 보기 / 맞았어요·틀렸어요 / 북마크·즐겨찾기 토글 / 오답노트 목록·범위 / 통계 화면 / 회독 마감 / 문제 ID 이동 / 무작위 순서 / 학습모드 / 수식(`$...$`)·표 표시 / 새로고침 후 마지막 위치·다크모드·글꼴 유지

---

## Phase 1 — 정리와 버그 수정

### Task 1.1 중복 폴더 `quizapp/` 제거
- **배경**: 루트와 `quizapp/`에 앱이 두 벌 있다. `quizapp/`는 2026-07-20 커밋(c6a2d12) 이후 갱신이 없는 **구버전**이고,
  루트에는 그 뒤에 추가된 회차 메뉴·글꼴 선택·문제 ID 이동·동기화·수식 기능이 있다.
- **할 일**: `git rm -r quizapp`. 루트 README의 폴더 구조 설명이 실제와 맞는지 확인하고, 빠진 항목(`data/exam-sample.csv`)을 추가.
- **완료 기준**: 루트 앱 정상 동작, 저장소에 앱 사본이 하나만 존재.

### Task 1.2 주관식 "내 답 일치" 표시 정리
- **현재 동작** (`js/app.js` `renderShortAnswerQuiz()`):
  - 입력 중에는 `input` 이벤트가 `match` 클래스를 토글한다 → 동작함.
  - 렌더 시점의 `isMatch`는 `studyMode && ...` 조건이라, 입력칸이 없는 학습모드에서만 참이 된다 → **사실상 죽은 코드**.
  - 그래서 "정답 보기"를 누르면 카드가 다시 그려지면서 일치 표시가 사라진다.
- **할 일**:
  1. 비교 로직을 함수로 추출: `isAnswerMatch(draft, answer)` — 공백 제거 후 비교. 정답이 HTML일 수 있으므로 비교 전 태그 제거.
  2. 렌더 시점 일치 여부는 `studyMode` 조건 없이 `myAnswerDraft` 기준으로 계산. `input` 핸들러도 같은 함수 사용.
  3. 정답이 공개되면 입력칸을 `readonly`로 두고, 일치하면 정답 라벨 옆에 "✓ 내 답과 일치" 태그 표시.
- **완료 기준**: 답 입력 → 정답 보기 후에도 일치 여부가 보인다. 학습모드 동작은 그대로.

### Task 1.3 보안: escape 보강 + 정답 HTML sanitize
- **할 일**:
  1. `escapeHtml()`에 `"` → `&quot;`, `'` → `&#39;` 추가 (속성값에도 쓰임, 예: `roundScopeSelect`의 `<option value>`).
  2. index.html에 DOMPurify 추가: `<script defer src="https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js" crossorigin="anonymous"></script>` (KaTeX 스크립트 옆).
  3. `sanitizeHtml(html)` 헬퍼 추가 — `window.DOMPurify`가 있으면 `DOMPurify.sanitize`, 없으면 `escapeHtml` 폴백.
  4. HTML로 출력되는 정답(`grep -n "q.answer" js/app.js`로 모두 찾기)을 `sanitizeHtml()`로 감싼다.
- **완료 기준**: 정답 안의 `<table>`, `<br>`, `<b>`, `<sup>` 정상 표시 / `<img src=x onerror=alert(1)>`는 실행되지 않음.
  (임시 CSV를 파일 업로드로 로드해 확인, 테스트 파일은 커밋하지 않음)

### Task 1.4 객관식 선택 상태가 문제 객체를 오염시키는 문제
- **현재**: `renderMultipleChoiceQuiz()`가 `q.selectedIndex = ...`로 **원본 Question 객체에 화면 상태를 저장**한다.
  같은 문제를 다른 메뉴에서 다시 열면 이전 선택이 남아 있다.
- **할 일**: `revealed`, `graded`, `myAnswerDraft`처럼 모듈 변수 `selectedOption`으로 옮기고,
  이 세 변수가 초기화되는 모든 곳(`goNext`, `goPrev`, `startSession`, `goToQuestionId` 등 — `grep -n "revealed = false" js/app.js`)에서 함께 초기화.
- **완료 기준**: 문제를 이동했다 돌아오면 선택이 초기화됨, 채점 기록은 기존과 동일하게 저장됨.

---

## Phase 2 — 학습 기능

### Task 2.1 키보드 단축키
- 퀴즈 화면이 활성이고 포커스가 `input/textarea/select`가 **아닐 때만** 동작 (`Esc`로 textarea 포커스 해제).
- 매핑:

  | 키 | 동작 |
  |---|---|
  | `→` / `←` | 다음 / 이전 문제 |
  | `Space` / `Enter` | 정답 보기 (주관식) · 확인 (객관식, 보기 선택된 경우) |
  | `1` / `2` | 맞았어요 / 틀렸어요 (주관식, 정답 공개 후) |
  | `1`~`5` | 보기 선택 (객관식, 채점 전) |
  | `B` / `F` | 북마크 / 즐겨찾기 토글 |

- 해당 버튼의 `.click()`을 호출하는 방식으로 구현해 로직을 중복하지 않는다. 버튼이 없으면 무시.
- 퀴즈 툴바에 "⌨ 단축키" 도움말(클릭 시 표 표시). 모바일 폭에서는 숨김.
- **완료 기준**: 마우스 없이 한 회독 진행 가능, textarea 입력 중 숫자키가 채점되지 않음, Space가 페이지를 스크롤하지 않음.

### Task 2.2 해설·난이도 컬럼 표시
- `dataLoader.js`가 컬럼을 어떻게 Question 객체/`raw`에 싣는지 먼저 확인.
- 인식할 헤더: 해설 = `해설` | `explanation`, 난이도 = `난이도` | `difficulty`.
- 정답이 공개되면 정답 아래 "해설" 블록 표시 (정답과 같은 `sanitizeHtml` 적용, 수식 렌더링 대상). 객관식도 채점 후 표시.
- 난이도가 있으면 카드 상단 eyebrow에 작은 배지.
- 컬럼이 없으면 아무것도 표시하지 않는다 (기존 시트 호환).
- `data/sample.csv` 몇 문제에 `해설` 컬럼을 **맨 끝에** 추가해 확인 (앞 5개 헤더 순서 규칙 유지).
- README의 "향후 컬럼 확장" 절을 실제 지원 내용으로 갱신.

### Task 2.3 오답노트 졸업 규칙
- 먼저 `storageManager.recordAnswer()`의 현재 오답 추가/제거 규칙을 읽고 그대로 유지할 부분을 파악.
- 새 규칙: 오답노트에 있는 문제를 **연속 N회 맞히면** 자동 제거 (기본 N=2).
  - 문제별 통계에 `streak`(연속 정답 수) 필드 추가. 없으면 0으로 간주.
  - 오답이면 `streak = 0`.
- 졸업 시 토스트: "🎓 오답노트 졸업!"
- 설정 화면 "5. 화면" 아래에 "오답노트 졸업 기준(연속 정답 수)" 입력 (1~5) → 기존 settings 저장 방식 사용.
- 동기화(Apps Script) 페이로드에 새 필드가 자연스럽게 포함되는지 확인.

### Task 2.4 오늘의 복습 (간이 간격 반복)
- **선행**: Task 2.3
- 문제별 통계에 `lastAt`(마지막 풀이 시각, epoch ms) 기록 추가.
- 복습 기한 규칙(간이 Leitner): 마지막 결과가 오답이면 1일 후, 정답이면 `streak` 1/2/3/4/5+ 에 따라 1/3/7/14/30일 후.
  `lastAt`이 없는 문제는 대상 아님.
- 새 모듈 `js/reviewScheduler.js` — 순수 함수 `getDueIds(questionStats, now)`만 export, DOM 접근 없음.
- 사이드바 "통계" 위에 "📅 오늘의 복습 N" 메뉴 → 기한이 지난 문제만으로 세션 시작 (기한 오래된 순).
- **완료 기준**: 개발자도구에서 어떤 문제의 `lastAt`을 과거로 바꾸면 복습 목록과 개수에 나타남.

### Task 2.5 모바일 스와이프 이동
- 카드 영역(`#quizCardWrap`)에서 가로 스와이프(수평 이동 > 60px 이고 수직 이동보다 클 때)로 이전/다음.
- `touchstart`/`touchend`만 사용, `passive: true`, 세로 스크롤 방해 금지, textarea에서 시작한 터치는 무시.

### Task 2.6 기출 모의고사 모드 (선택, 규모 큼)
- **시작 전 사용자에게 화면 흐름을 한 번 확인받을 것.**
- 회차 메뉴에서 "모의고사로 풀기" → 타이머 표시, 즉시 채점 없이 끝까지 선택 → 일괄 제출 → 결과 요약
  (점수, 과목별 정답 수, 틀린 문제 목록 → "틀린 문제만 다시 풀기").
- 제출 시 각 문제를 기존 `submitResult` 경로로 기록하고 회독 점수도 저장.
- 진행 중 새로고침 대비 답안을 sessionStorage에 임시 저장.

---

## Phase 3 — 구조 개선과 UI

### Task 3.1 `app.js` 분리 (동작 변화 없음)
- **선행**: Phase 1 완료. 다른 `app.js` 수정 Task와 동시에 진행 금지.
- 목표 구조:
  ```
  js/app.js                초기화, 화면 전환(navigate)
  js/state.js              공유 상태 단일 객체 (quiz, currentMode, storage, 세션 플래그)
  js/ui/dom.js             $ 헬퍼, el 맵, toast, escapeHtml, sanitizeHtml
  js/ui/quizView.js        renderQuizCard, 주관식/객관식 렌더, 단축키, 스와이프
  js/ui/sidebarView.js     과목/회차/오답 범위 트리, nav 카운트
  js/ui/statsView.js       통계 화면
  js/ui/settingsView.js    설정 화면 이벤트
  js/questionNormalizer.js normalizeQuestions, convertExamRow, parseOptionList
  ```
- **코드 이동만** 한다. 로직 수정 금지. 순환 import가 생기면 콜백 주입으로 해결.
- 회귀 체크리스트 전체 통과 필수. README 폴더 구조 갱신.

### Task 3.2 퀴즈 화면 UI 재디자인
- **frontend-design 스킬을 먼저 로드**하고 진행.
- 기존 콘셉트 유지: `css/style.css` 상단 토큰 주석 — "시험 전날 밤의 책상, 청회색 종이 위 남색 잉크, 형광펜 노랑은 정답/해설에만". 색은 기존 CSS 변수 토큰을 수정·확장하는 방식으로.
- 범위:
  - 퀴즈 툴바: 학습모드/무작위/ID 이동/회독 마감을 "옵션" 접이식 패널로 정리, 진행률은 상단에 얇게.
  - 카드: 문제 타이포 위계 강화, 정답 영역 형광펜 강조, 채점 버튼 터치 영역 44px 이상.
  - 채점 피드백: 짧은 전환 애니메이션, `prefers-reduced-motion` 존중.
  - 이모지 아이콘(🐸🔖⭐🎯⚙) 교체 여부는 **사용자에게 먼저 물어볼 것** (의도된 취향일 수 있음).
- 라이트/다크 × 375px/1280px 전후 스크린샷을 사용자에게 보여줄 것.

### Task 3.3 통계 시각화
- **선행**: Task 2.3, 2.4
- 차트 라이브러리 없이 CSS/인라인 SVG로 구현.
  - 과목별 정답률: 가로 막대.
  - 회독별 점수: 꺾은선 (x = 회독 순서, y = 정답률).
  - 학습 잔디: 최근 12주 일별 풀이 수 히트맵. 새 키 `qa_daily_log_v1` (`{ "YYYY-MM-DD": count }`, 모드 접미사 규칙 동일)를 `recordAnswer`에서 증가. 기록 시작 전 기간은 비어 있음을 안내.
- 다크모드 대비, 375px 폭에서 가로 스크롤 없는지 확인.

---

## Phase 4 — 사용성·운영

### Task 4.1 학습기록 백업/복원
- 설정에 "학습기록 내보내기(JSON)" / "가져오기" 추가.
- 내보내기: `qa_` 로 시작하는 LocalStorage 키 전체를 하나의 JSON(`{ version, exportedAt, data }`)으로, 파일명 `quiz-backup-YYYYMMDD.json`.
- 가져오기: 형식 검증 → `confirm("현재 학습기록을 덮어씁니다")` → 저장 → 화면 갱신. 동기화 URL이 설정돼 있으면 동기화 1회 실행.

### Task 4.2 로딩/에러 상태 개선
- 시트 로딩 중 카드 자리에 스켈레톤 표시.
- 실패 원인별 안내: 네트워크 실패 / CSV 대신 HTML 응답(= 웹 게시·공유 안 됨) / 필수 헤더 누락(누락된 헤더 이름 명시).
- `#syncStatus` 점에 마지막 로딩 시각·출처를 `title`로 표시.

### Task 4.3 PWA (오프라인 학습)
- `manifest.webmanifest`, 아이콘 192/512 PNG(단순 도형), `sw.js` 추가.
- 캐시 전략: 앱 셸(HTML/CSS/JS/KaTeX/DOMPurify/폰트)은 cache-first + `CACHE_VERSION` 상수로 갱신, 시트 CSV는 network-first(실패 시 마지막 응답).
- 서비스워커 등록은 `localhost` 또는 HTTPS에서만.
- **완료 기준**: 한 번 접속 후 개발자도구 Offline 상태로 새로고침해도 마지막 데이터로 학습 가능.

### Task 4.4 GitHub Pages 배포 (사용자 확인 필요)
- `.github/workflows/pages.yml` — `main` push 시 저장소 루트를 Pages로 배포.
- 저장소 Settings → Pages 활성화는 사용자가 직접 해야 함을 안내.
- README에 배포 URL과 절차 추가.

---

## 의존 관계

```
1.1 → 1.2, 1.3, 1.4 → 2.1, 2.2, 2.5   (모두 app.js 수정 → 순차 진행)
2.3 → 2.4 → 3.3
Phase 1 → 3.1 → 3.2
4.1은 2.3 / 2.4 / 3.3 이후가 이상적 (새 키 포함)
```
- `js/app.js`를 수정하는 Task는 **두 세션에서 동시에 진행하지 않는다.**
- 병렬 가능 예: 4.3(PWA, 새 파일 위주) ↔ 2.3(storageManager 위주).

## 진행 현황

- [x] 1.1 중복 폴더 제거
- [x] 1.2 내 답 일치 표시
- [x] 1.3 escape / sanitize
- [x] 1.4 객관식 선택 상태 분리
- [x] 2.1 키보드 단축키
- [x] 2.2 해설·난이도 표시
- [x] 2.3 오답노트 졸업
- [x] 2.4 오늘의 복습
- [x] 2.5 모바일 스와이프
- [x] 2.6 모의고사 모드 (선택)
- [x] 3.1 app.js 분리
- [x] 3.2 퀴즈 UI 재디자인
- [x] 3.3 통계 시각화
- [x] 4.1 백업 / 복원
- [x] 4.2 로딩 / 에러 상태
- [x] 4.3 PWA
- [ ] 4.4 GitHub Pages 배포

## 발견 사항
(작업 중 찾은 범위 밖 문제를 여기에 기록)

- **[버그, 미수정] `normalizeQuestions()`가 숫자가 들어간 주관식 정답을 숫자로 변환** (`js/app.js` 약 183행): 정답 문자열에서 숫자 외 문자를 모두 지워 `Number()`로 바꾸므로, 빈출(주관식) 모드에서도 정답에 숫자가 있으면(예: `<sup>2</sup>` 포함 HTML, `3년`) 숫자만 남은 값(예 `21`)으로 바뀐다. 객관식(기출) 모드에만 적용되도록 보호해야 함. (발견: Task 1.3 검증 중)
- **[버그, 미수정] `clearAllUserData()`가 모드 접미사 키를 지우지 않음** (`js/storageManager.js`): `KEYS` 값(접미사 없는 키)만 `removeItem` 하므로, 실제 저장 키인 `qa_*_v1_basic` / `qa_*_v1_exam`은 "학습기록 전체 삭제"로 지워지지 않는다. (발견: Task 2.3)
- **[주의] Apps Script 쪽 미반영**: Task 2.3에서 동기화 `answer` 페이로드에 `streak`, `graduated`를 추가했다. 사용자가 배포한 Apps Script(저장소에 없음)가 이 필드를 저장·반영하지 않으면, 시트에서 pull 할 때 `streak`가 0으로 돌아가고 시트 쪽 오답 플래그는 "정답이면 즉시 해제" 규칙으로 남을 수 있다. 필요하면 Apps Script에서 `graduated`일 때만 `wrong`을 해제하도록 수정. (발견: Task 2.3)
- **[참고]** `lastAt`(마지막 풀이 시각)은 `recordAnswer()`에 이미 기록되고 있었다. Task 2.4에서는 추가 기록 불필요.
- **[버그, 미수정] 통계 화면이 열리지 않음**: `renderStats()`가 `statTile()`을 호출하지만 이 함수는 저장소 전체 이력에 정의된 적이 없다 → `통계` 클릭 시 `ReferenceError: statTile is not defined`. 최초 업로드 커밋(84aef96)부터 있던 문제로 보임. `.stat-tile` / `.num` / `.label` CSS는 존재하므로 `<div class="stat-tile"><div class="num">값</div><div class="label">라벨</div></div>`를 반환하는 함수 추가가 필요. Task 3.3에서 `statTile()`을 추가해 해결함. (발견: Task 2.4 검증 중, 2.6에서 재확인)
- **[참고] 모의고사(2.6)**: 한 화면 스크롤 방식, 경과 시간은 카운트업(제한 시간 없음), 같은 보기를 다시 누르면 선택 해제, 미응답은 오답 처리. 진행 중 상태는 sessionStorage `qa_mock_session`.
- **[결정] 4.1 가져오기 후 동기화는 실행하지 않음**: 현재 동기화는 풀이 이벤트 단위 push와 시트→기기 pull(덮어쓰기)뿐이라, 가져온 기록 뒤에 pull을 실행하면 방금 복원한 내용이 시트 내용으로 다시 덮인다. 일괄 push API가 생기면 그때 연결.
- **[검증 한계] 4.3 PWA**: 내장 브라우저 pane에서는 서비스워커 등록이 "unknown error when fetching the script"로 실패해(서버 응답 200 정상) 실제 오프라인 동작은 확인하지 못했다. 대신 Node 모의 환경으로 sw.js 로직(앱 셸 cache-first, CSV network-first→오프라인 시 마지막 응답, Apps Script 동기화 요청 우회)을 검증했다. 일반 Chrome에서 `localhost:8000`에 한 번 접속 → 개발자도구 Application ▸ Service Workers 확인 → Network에서 Offline 체크 후 새로고침으로 최종 확인 필요.
- **[주의] 서비스워커 캐시**: 앱 셸은 cache-first라서 `js/*`, `css/*`, `index.html`을 수정해 배포하면 `sw.js`의 `CACHE_VERSION`을 올려야 사용자에게 반영된다. 새 JS 파일을 추가하면 `SHELL_FILES`에도 넣어야 한다. 개발 중 오래된 화면이 보이면 개발자도구에서 Service Worker를 Unregister 하거나 시크릿 창을 쓴다.
- **[참고] `img/`**: 작업 시작 전/중에 사용자가 둔 `img/favicon-32.png`, `img/favicon-180.png`는 untracked 상태로 두었다(index.html이 참조 중이므로 커밋 필요). 4.3에서 `img/icon-192.png`, `img/icon-512.png`만 추가 커밋했다.
