// app.js
// UI 컨트롤러. 데이터 로딩(dataLoader) / 저장(storageManager) / 메뉴 생성(menuBuilder) /
// 문제풀이 진행(quizEngine) / 통계 집계(statsManager) 모듈을 화면에 연결하는 역할만 한다.

import DataLoader from './dataLoader.js';
import StorageManager from './storageManager.js';
import MenuBuilder from './menuBuilder.js';
import QuizEngine from './quizEngine.js';
import StatsManager from './statsManager.js';

const storage = new StorageManager();
const dataLoader = new DataLoader();
const menuBuilder = new MenuBuilder();

let questions = [];
let byId = new Map();
let menu = [];
let quiz = null;
let stats = null;
let revealed = false;
let graded = false;

const $ = (sel) => document.querySelector(sel);
const el = {
  sidebar: $('#sidebar'),
  sidebarScrim: $('#sidebarScrim'),
  menuToggle: $('#menuToggle'),
  darkToggle: $('#darkToggle'),
  darkToggleSettings: $('#darkToggleSettings'),
  syncStatus: $('#syncStatus'),
  subjectTree: $('#subjectTree'),
  countWrong: $('#countWrong'),
  countBookmark: $('#countBookmark'),
  countFavorite: $('#countFavorite'),

  quizBreadcrumb: $('#quizBreadcrumb'),
  shuffleToggle: $('#shuffleToggle'),
  finishRoundBtn: $('#finishRoundBtn'),
  quizProgressBar: $('#quizProgressBar'),
  quizProgressLabel: $('#quizProgressLabel'),
  quizCardWrap: $('#quizCardWrap'),
  prevBtn: $('#prevBtn'),
  nextBtn: $('#nextBtn'),

  overviewGrid: $('#overviewGrid'),
  subjectStatsTable: $('#subjectStatsTable'),
  roundScopeSelect: $('#roundScopeSelect'),
  roundTable: $('#roundTable'),

  sheetUrlInput: $('#sheetUrlInput'),
  sheetUrlSave: $('#sheetUrlSave'),
  sheetUrlStatus: $('#sheetUrlStatus'),
  csvFileInput: $('#csvFileInput'),
  csvFileLoadSample: $('#csvFileLoadSample'),
  resetDataBtn: $('#resetDataBtn'),

  emptyGoSettings: $('#emptyGoSettings'),
  emptyLoadSample: $('#emptyLoadSample'),

  toast: $('#toast'),
};

// ---------------------------------------------------------------------------
// 공통 유틸
// ---------------------------------------------------------------------------
function toast(msg, kind = 'info') {
  el.toast.textContent = msg;
  el.toast.className = `toast show ${kind}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.toast.className = 'toast'; }, 2600);
}

function setSyncStatus(state) {
  el.syncStatus.className = `sync-status ${state}`;
  el.syncStatus.title = state === 'ok' ? '데이터 연결됨' : state === 'err' ? '데이터 로딩 실패' : '데이터 없음';
}

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  el.darkToggle.textContent = dark ? '☀️' : '🌙';
  el.darkToggleSettings.checked = dark;
}

// ---------------------------------------------------------------------------
// 화면 전환
// ---------------------------------------------------------------------------
function navigate(view) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-nav]').forEach((b) => b.classList.remove('active'));

  if (view === 'stats') { $('#view-stats').classList.add('active'); renderStats(); }
  else if (view === 'settings') { $('#view-settings').classList.add('active'); }
  else if (view === 'empty') { $('#view-empty').classList.add('active'); }
  else { $('#view-quiz').classList.add('active'); }

  const navBtn = document.querySelector(`.nav-item[data-nav="${view}"]`);
  if (navBtn) navBtn.classList.add('active');

  el.sidebar.classList.remove('open');
  el.sidebarScrim.classList.remove('open');
}

// ---------------------------------------------------------------------------
// 데이터 로딩
// ---------------------------------------------------------------------------
async function applyLoadedQuestions(list, sourceLabel) {
  questions = list;
  byId = new Map(questions.map((q) => [q.id, q]));
  menu = menuBuilder.build(questions);
  quiz = new QuizEngine(byId, storage);
  stats = new StatsManager(storage, byId);

  renderSubjectTree();
  renderNavCounts();
  setSyncStatus('ok');
  toast(`${sourceLabel} · 문제 ${questions.length}개 로딩 완료`, 'ok');

  const last = storage.getLastPosition();
  if (last && byId.has(last.id)) {
    startSession(questions.map((q) => q.id), { scope: '__all__', breadcrumb: '전체' });
    const idx = quiz.queue.indexOf(last.id);
    if (idx >= 0) quiz.index = idx;
    navigate('quiz');
    renderQuizCard();
  } else {
    startSession(questions.map((q) => q.id), { scope: '__all__', breadcrumb: '전체' });
    navigate('quiz');
    renderQuizCard();
  }
}

async function loadFromSheet(url) {
  el.sheetUrlStatus.textContent = '불러오는 중…';
  el.sheetUrlStatus.className = 'settings-status';
  try {
    const list = await dataLoader.loadFromGoogleSheets(url);
    if (list.length === 0) throw new Error('시트에서 문제를 찾지 못했습니다. 헤더(ID/과목/소과목/문제/정답)를 확인해 주세요.');
    storage.setSettings({ sheetUrl: url });
    await applyLoadedQuestions(list, 'Google Sheets');
    el.sheetUrlStatus.textContent = `연결 완료 · 문제 ${list.length}개`;
    el.sheetUrlStatus.className = 'settings-status ok';
  } catch (err) {
    console.error(err);
    setSyncStatus('err');
    el.sheetUrlStatus.textContent = err.message || '연결에 실패했습니다.';
    el.sheetUrlStatus.className = 'settings-status err';
    toast('Google Sheets 연결 실패', 'err');
  }
}

async function loadSample() {
  try {
    const list = await dataLoader.loadFromCSVUrl('data/sample.csv');
    await applyLoadedQuestions(list, '샘플 데이터');
  } catch (err) {
    console.error(err);
    toast('샘플 데이터를 불러오지 못했습니다 (로컬 서버로 실행 중인지 확인해 주세요).', 'err');
  }
}

async function loadCSVFile(file) {
  try {
    const list = await dataLoader.loadFromCSVFile(file);
    await applyLoadedQuestions(list, file.name);
  } catch (err) {
    console.error(err);
    toast('CSV 파일을 읽지 못했습니다.', 'err');
  }
}

// ---------------------------------------------------------------------------
// 사이드바 (메뉴 트리는 Google Sheets 의 과목/소과목 컬럼으로부터 매번 재생성)
// ---------------------------------------------------------------------------
function renderSubjectTree() {
  el.subjectTree.innerHTML = '';

  const allLi = document.createElement('li');
  const allBtn = document.createElement('button');
  allBtn.className = 'nav-item';
  allBtn.textContent = `전체 학습 (${questions.length})`;
  allBtn.addEventListener('click', () => {
    startSession(questions.map((q) => q.id), { scope: '__all__', breadcrumb: '전체' });
    navigate('quiz');
    renderQuizCard();
  });
  allLi.appendChild(allBtn);
  el.subjectTree.appendChild(allLi);

  menu.forEach((subjectNode) => {
    const li = document.createElement('li');
    li.className = 'subject-node';

    const header = document.createElement('button');
    header.className = 'nav-item';
    header.textContent = `${subjectNode.name} (${subjectNode.count})`;
    const subList = document.createElement('ul');
    subList.className = 'subsubject-list';
    subList.style.display = 'none';

    header.addEventListener('click', () => {
      const isOpen = subList.style.display !== 'none';
      subList.style.display = isOpen ? 'none' : 'block';
    });

    subjectNode.children.forEach((subNode) => {
      const subLi = document.createElement('li');
      const subBtn = document.createElement('button');
      subBtn.className = 'nav-item';
      subBtn.textContent = `${subNode.name} (${subNode.count})`;
      subBtn.addEventListener('click', () => {
        startSession(subNode.ids, { scope: subjectNode.name, breadcrumb: `${subjectNode.name} › ${subNode.name}` });
        navigate('quiz');
        renderQuizCard();
      });
      subLi.appendChild(subBtn);
      subList.appendChild(subLi);
    });

    li.appendChild(header);
    li.appendChild(subList);
    el.subjectTree.appendChild(li);
  });
}

function renderNavCounts() {
  el.countWrong.textContent = storage.getWrongList().length;
  el.countBookmark.textContent = storage.getBookmarks().length;
  el.countFavorite.textContent = storage.getFavorites().length;
}

// ---------------------------------------------------------------------------
// 퀴즈(문제풀이)
// ---------------------------------------------------------------------------
function startSession(ids, { scope, breadcrumb }) {
  if (!quiz) return;
  quiz.start(ids, { shuffle: el.shuffleToggle.checked, scope });
  el.quizBreadcrumb.textContent = `${breadcrumb} (${ids.length}문제)`;
  revealed = false;
  graded = false;
}

function updateProgress() {
  const p = quiz.progress();
  const pct = p.total ? Math.round((p.index / p.total) * 100) : 0;
  el.quizProgressBar.style.width = `${pct}%`;
  el.quizProgressLabel.textContent = `${p.total ? p.index : 0} / ${p.total}`;
  el.prevBtn.disabled = !quiz.hasPrev();
  el.nextBtn.disabled = !quiz.hasNext();
}

function renderQuizCard() {
  if (!quiz) return;
  updateProgress();
  const q = quiz.current();

  if (!q) {
    el.quizCardWrap.innerHTML = `<div class="qcard qcard-empty">이 목록에는 표시할 문제가 없습니다.<br/>다른 메뉴를 선택해 보세요.</div>`;
    return;
  }

  const isBookmarked = storage.isBookmarked(q.id);
  const isFavorite = storage.isFavorite(q.id);
  const qs = storage.getQuestionStats(q.id);
  const accuracy = qs.attempts ? Math.round((qs.correct / qs.attempts) * 100) : null;

  el.quizCardWrap.innerHTML = `
    <div class="qcard">
      <div class="qcard-eyebrow">
        <span class="qcard-path">${escapeHtml(q.subject || '')} › ${escapeHtml(q.subSubject || '')}${accuracy !== null ? ` · 누적 정답률 ${accuracy}%` : ''}</span>
        <span class="qcard-tools">
          <button class="qcard-icon-btn bookmark ${isBookmarked ? 'on' : ''}" id="bookmarkBtn" title="북마크">🔖</button>
          <button class="qcard-icon-btn favorite ${isFavorite ? 'on' : ''}" id="favoriteBtn" title="즐겨찾기">★</button>
        </span>
      </div>
      <div class="qcard-question">${escapeHtml(q.question || '')}</div>

      ${revealed ? `
        <div class="qcard-answer-wrap">
          <div class="qcard-answer-label">정답</div>
          <div class="qcard-answer-text">${escapeHtml(q.answer || '')}</div>
        </div>
        ${!graded ? `
          <div class="grade-actions">
            <button class="grade-btn correct" id="gradeCorrect">맞았어요</button>
            <button class="grade-btn wrong" id="gradeWrong">틀렸어요</button>
          </div>
        ` : `
          <div class="qcard-actions">
            <span class="qcard-graded-tag ${qs.lastResult ? 'correct' : 'wrong'}">${qs.lastResult ? '✓ 맞음으로 기록됨' : '✕ 오답으로 기록됨'}</span>
          </div>
        `}
      ` : `
        <div class="qcard-actions">
          <button class="btn btn-primary" id="revealBtn">정답 보기</button>
        </div>
      `}
      <div class="qcard-id-stamp">${escapeHtml(q.id)}</div>
    </div>
  `;

  $('#bookmarkBtn').addEventListener('click', () => {
    storage.toggleBookmark(q.id);
    renderNavCounts();
    renderQuizCard();
  });
  $('#favoriteBtn').addEventListener('click', () => {
    storage.toggleFavorite(q.id);
    renderNavCounts();
    renderQuizCard();
  });

  const revealBtn = $('#revealBtn');
  if (revealBtn) revealBtn.addEventListener('click', () => { revealed = true; renderQuizCard(); });

  const gradeCorrect = $('#gradeCorrect');
  const gradeWrong = $('#gradeWrong');
  if (gradeCorrect) gradeCorrect.addEventListener('click', () => { quiz.submitResult(true); graded = true; renderNavCounts(); renderQuizCard(); });
  if (gradeWrong) gradeWrong.addEventListener('click', () => { quiz.submitResult(false); graded = true; renderNavCounts(); renderQuizCard(); });
}

function goNext() {
  if (quiz.hasNext()) { quiz.next(); revealed = false; graded = false; renderQuizCard(); }
}
function goPrev() {
  if (quiz.hasPrev()) { quiz.prev(); revealed = false; graded = false; renderQuizCard(); }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// 통계
// ---------------------------------------------------------------------------
function renderStats() {
  if (!stats) return;
  const o = stats.overview();
  el.overviewGrid.innerHTML = `
    ${statTile(o.attempts, '총 풀이 횟수')}
    ${statTile(`${o.accuracy}%`, '전체 정답률')}
    ${statTile(`${o.studiedQuestions} / ${o.totalQuestions}`, '학습한 문제 수')}
    ${statTile(o.wrongCount, '오답노트')}
    ${statTile(o.bookmarkCount, '북마크')}
    ${statTile(o.favoriteCount, '즐겨찾기')}
  `;

  const bySubject = stats.bySubject();
  el.subjectStatsTable.innerHTML = bySubject.length ? bySubject.map((s) => `
    <div class="subject-stat-row">
      <div class="subject-stat-top">
        <span class="subject-stat-name">${escapeHtml(s.subject)}</span>
        <span class="subject-stat-meta">${s.correct}/${s.attempts} · ${s.accuracy}%</span>
      </div>
      <div class="subject-stat-bar-track"><div class="subject-stat-bar-fill" style="width:${s.accuracy}%"></div></div>
    </div>
  `).join('') : `<p class="empty-note">아직 풀이 기록이 없습니다.</p>`;

  const scopes = ['__all__', ...menu.map((m) => m.name)];
  el.roundScopeSelect.innerHTML = scopes.map((s) => `<option value="${escapeHtml(s)}">${s === '__all__' ? '전체' : escapeHtml(s)}</option>`).join('');
  renderRoundTable(el.roundScopeSelect.value || '__all__');
}

function renderRoundTable(scope) {
  const rounds = stats.rounds(scope);
  if (!rounds.length) {
    el.roundTable.innerHTML = `<p class="empty-note">이 구간에서 "회독 마감"을 하면 기록이 쌓입니다.</p>`;
    return;
  }
  el.roundTable.innerHTML = `
    <table>
      <thead><tr><th>회독</th><th>점수</th><th>정답률</th><th>날짜</th></tr></thead>
      <tbody>
        ${rounds.map((r) => `
          <tr>
            <td>${r.round}회독</td>
            <td>${r.correct} / ${r.total}</td>
            <td>${r.total ? Math.round((r.correct / r.total) * 100) : 0}%</td>
            <td>${new Date(r.at).toLocaleDateString('ko-KR')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ---------------------------------------------------------------------------
// 이벤트 바인딩
// ---------------------------------------------------------------------------
document.querySelectorAll('.nav-item[data-nav]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const view = btn.dataset.nav;
    if (view === 'wrong') {
      startSession(storage.getWrongList(), { scope: '__wrong__', breadcrumb: '오답노트' });
      navigate('quiz'); renderQuizCard();
    } else if (view === 'bookmark') {
      startSession(storage.getBookmarks(), { scope: '__bookmark__', breadcrumb: '북마크' });
      navigate('quiz'); renderQuizCard();
    } else if (view === 'favorite') {
      startSession(storage.getFavorites(), { scope: '__favorite__', breadcrumb: '즐겨찾기' });
      navigate('quiz'); renderQuizCard();
    } else {
      navigate(view);
    }
  });
});

el.menuToggle.addEventListener('click', () => {
  el.sidebar.classList.add('open');
  el.sidebarScrim.classList.add('open');
});
el.sidebarScrim.addEventListener('click', () => {
  el.sidebar.classList.remove('open');
  el.sidebarScrim.classList.remove('open');
});

el.darkToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme !== 'dark';
  storage.setSettings({ darkMode: next });
  applyTheme(next);
});
el.darkToggleSettings.addEventListener('change', (e) => {
  storage.setSettings({ darkMode: e.target.checked });
  applyTheme(e.target.checked);
});

el.prevBtn.addEventListener('click', goPrev);
el.nextBtn.addEventListener('click', goNext);
el.shuffleToggle.addEventListener('change', () => {
  if (quiz && quiz.queue.length) {
    const currentId = quiz.current() ? quiz.current().id : null;
    quiz.start(quiz.queue, { shuffle: el.shuffleToggle.checked, scope: quiz.scope });
    if (currentId) {
      const idx = quiz.queue.indexOf(currentId);
      if (idx >= 0) quiz.index = idx;
    }
    revealed = false; graded = false;
    renderQuizCard();
  }
});
el.finishRoundBtn.addEventListener('click', () => {
  const result = quiz ? quiz.finishRound() : null;
  if (!result) { toast('이번 회독에서 풀이한 문제가 없습니다.'); return; }
  toast(`회독 마감 · ${result.correct} / ${result.total} 정답`, 'ok');
  renderStats();
});

el.roundScopeSelect.addEventListener('change', (e) => renderRoundTable(e.target.value));

el.sheetUrlSave.addEventListener('click', () => {
  const url = el.sheetUrlInput.value.trim();
  if (!url) { toast('Google Sheets 링크를 입력해 주세요.', 'err'); return; }
  loadFromSheet(url);
});
el.csvFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadCSVFile(file);
});
el.csvFileLoadSample.addEventListener('click', loadSample);
el.emptyGoSettings.addEventListener('click', () => navigate('settings'));
el.emptyLoadSample.addEventListener('click', loadSample);

el.resetDataBtn.addEventListener('click', () => {
  if (!confirm('오답노트/북마크/즐겨찾기/통계/회독 기록을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.')) return;
  storage.clearAllUserData();
  renderNavCounts();
  toast('학습기록을 초기화했습니다.', 'ok');
  if (quiz) { revealed = false; graded = false; renderQuizCard(); }
  renderStats();
});

// ---------------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------------
(async function init() {
  const settings = storage.getSettings();
  applyTheme(!!settings.darkMode);
  el.sheetUrlInput.value = settings.sheetUrl || '';
  renderNavCounts();

  if (settings.sheetUrl) {
    setSyncStatus('loading');
    await loadFromSheet(settings.sheetUrl);
  } else {
    navigate('empty');
  }
})();
