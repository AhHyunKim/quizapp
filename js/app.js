// app.js
// UI 컨트롤러. 데이터 로딩(dataLoader) / 저장(storageManager) / 메뉴 생성(menuBuilder) /
// 문제풀이 진행(quizEngine) / 통계 집계(statsManager) 모듈을 화면에 연결하는 역할만 한다.

import DataLoader from './dataLoader.js';
import StorageManager from './storageManager.js';
import MenuBuilder, { naturalCompare } from './menuBuilder.js';
import QuizEngine from './quizEngine.js';
import StatsManager from './statsManager.js';
import { getDueIds } from './reviewScheduler.js';

const storage = new StorageManager();
const dataLoader = new DataLoader();
const menuBuilder = new MenuBuilder();

let questions = [];
let byId = new Map();
let menu = [];
let examRoundMenu = [];
let quiz = null;
let stats = null;
let revealed = false;
let graded = false;
let myAnswerDraft = '';
let selectedOption = 0; // 객관식에서 고른 보기 번호 (1부터, 0=선택 없음)
let currentMode = 'basic';
let currentModeLabel = '빈출문제';

const $ = (sel) => document.querySelector(sel);
const el = {
  sidebar: $('#sidebar'),
  sidebarScrim: $('#sidebarScrim'),
  menuToggle: $('#menuToggle'),
  darkToggle: $('#darkToggle'),
  darkToggleSettings: $('#darkToggleSettings'),
  fontSelect: $('#fontSelect'),
  graduateStreakInput: $('#graduateStreakInput'),
  syncStatus: $('#syncStatus'),
  subjectTree: $('#subjectTree'),
  roundNavSection: $('#roundNavSection'),
  roundLabel: $('#roundLabel'),
  roundTree: $('#roundTree'),
  allLearningNavItem: $('#allLearningNavItem'),
  countWrong: $('#countWrong'),
  countBookmark: $('#countBookmark'),
  countReview: $('#countReview'),
  countFavorite: $('#countFavorite'),
  wrongScopeTree: $('#wrongScopeTree'),

  quizBreadcrumb: $('#quizBreadcrumb'),
  studyModeToggle: $('#studyModeToggle'),
  shuffleToggle: $('#shuffleToggle'),
  gotoIdInput: $('#gotoIdInput'),
  gotoIdBtn: $('#gotoIdBtn'),
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
  examSheetUrlInput: $('#examSheetUrlInput'),
  examSheetUrlSave: $('#examSheetUrlSave'),
  examSheetUrlStatus: $('#examSheetUrlStatus'),
  syncUrlInput: $('#syncUrlInput'),
  syncUrlSave: $('#syncUrlSave'),
  syncUrlStatus: $('#syncUrlStatus'),
  syncSheetUrlInput: $('#syncSheetUrlInput'),
  csvFileInput: $('#csvFileInput'),
  csvFileLoadSample: $('#csvFileLoadSample'),
  resetDataBtn: $('#resetDataBtn'),

  emptyGoSettings: $('#emptyGoSettings'),
  emptyLoadSample: $('#emptyLoadSample'),
  modeBasicBtn: $('#modeBasicBtn'),
  modeExamBtn: $('#modeExamBtn'),

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

/** 채점 결과 후처리: 오답노트 졸업 시 토스트 */
function notifyGraduation(result) {
  if (result && result.graduated) toast('🎓 오답노트 졸업!', 'ok');
}

function applyFont(font) {
  const value = font || 'default';
  document.documentElement.dataset.font = value;
  el.fontSelect.value = value;
}

// ---------------------------------------------------------------------------
// 화면 전환
// ---------------------------------------------------------------------------
function navigate(view) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.nav-item[data-nav]').forEach((b) => b.classList.remove('active'));

  if (view === 'stats') { $('#view-stats').classList.add('active'); renderStats(); }
  else if (view === 'settings') { $('#view-settings').classList.add('active'); }
  else if (view === 'mock') { $('#view-mock').classList.add('active'); }
  else if (view === 'empty') { $('#view-empty').classList.add('active'); }
  else { $('#view-quiz').classList.add('active'); }

  const navBtn = document.querySelector(`.nav-item[data-nav="${view}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (view !== 'mock') stopMockTimer();

  el.sidebar.classList.remove('open');
  el.sidebarScrim.classList.remove('open');
}

// ---------------------------------------------------------------------------
// 데이터 로딩
// ---------------------------------------------------------------------------
function parseOptionList(value) {
  if (value === undefined || value === null || value === '') return [];
  const text = String(value).trim();
  if (!text) return [];
  const splitters = /\r?\n|\s*\|\s*|\s*；\s*|\s*;\s*|\s*\/\s*|\s*／\s*/;
  const parts = text.split(splitters).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [text];
}

function normalizeQuestions(list) {
  return list.map((q) => {
    const next = { ...q };
    const raw = next.raw || {};
    const optionEntries = [];

    const registerOption = (key, value) => {
      if (value === undefined || value === null || value === '') return;
      const text = String(value).trim();
      if (!text) return;
      const match = String(key).match(/^(?:((?:보기|선택지|option|choice)(\d+)?)|(\d+))$/i);
      if (match) {
        const index = match[2] ? Number(match[2]) : Number(match[3] || 0);
        if (index > 0) optionEntries.push([index, text]);
      }
    };

    Object.entries(next).forEach(([key, value]) => {
      if (key === 'options' || key === 'raw') return;
      registerOption(key, value);
    });
    Object.entries(raw).forEach(([key, value]) => {
      registerOption(key, value);
    });

    if (Array.isArray(next.options) && next.options.length) {
      next.options = next.options.filter((opt) => opt !== undefined && opt !== null).map((opt) => String(opt));
    } else if (typeof next.options === 'string' && next.options.trim()) {
      next.options = parseOptionList(next.options);
    } else if (optionEntries.length) {
      next.options = optionEntries.sort((a, b) => a[0] - b[0]).map(([, value]) => value);
    } else {
      const fallbackKeys = ['options', 'choices', 'selects', 'optionList'];
      fallbackKeys.forEach((key) => {
        if (raw[key] !== undefined) {
          next.options = parseOptionList(raw[key]);
        }
      });
    }

    if (next.answer !== undefined && next.answer !== null && next.answer !== '') {
      const answerText = String(next.answer).trim();
      const numeric = Number(answerText.replace(/[^0-9]/g, ''));
      if (!Number.isNaN(numeric) && numeric > 0) {
        next.answer = numeric;
      } else {
        const alias = { a: 1, b: 2, c: 3, d: 4, e: 5, '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
        next.answer = alias[answerText.toLowerCase()] || next.answer;
      }
    }

    return next;
  });
}

/** 기출문제의 "회차" 컬럼 기준으로 문제를 묶는다. 회차가 없는 문제는 별도 그룹으로 모은다. */
function buildRoundMenu(list) {
  const map = new Map();
  list.forEach((q) => {
    const round = (q.round || '').toString().trim() || '(회차 미지정)';
    if (!map.has(round)) map.set(round, []);
    map.get(round).push(q.id);
  });
  const names = Array.from(map.keys()).sort(naturalCompare);
  return names.map((name) => ({ name, ids: map.get(name), count: map.get(name).length }));
}

async function applyLoadedQuestions(list, sourceLabel, mode = currentMode) {
  const normalized = normalizeQuestions(list);
  questions = normalized;
  byId = new Map(questions.map((q) => [q.id, q]));
  menu = menuBuilder.build(questions);
  examRoundMenu = mode === 'exam' ? buildRoundMenu(questions) : [];
  quiz = new QuizEngine(byId, storage);
  stats = new StatsManager(storage, byId, mode);

  renderSubjectTree();
  renderRoundTree();
  renderNavCounts();
  setSyncStatus('ok');
  toast(`${sourceLabel} · 문제 ${questions.length}개 로딩 완료`, 'ok');
  window.__debug_app_state = { mode, questionCount: questions.length, currentMode, questions };

  if (storage.getSyncUrl(mode)) {
    await storage.pullFromCloud(mode);
    renderNavCounts();
  }

  const last = storage.getLastPosition(mode);
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

  // 모의고사 도중 새로고침했다면 이어서 진행
  if (mode === 'exam') resumeMockIfAny();
}

async function loadFromSheet(url) {
  currentMode = 'basic';
  el.modeBasicBtn.classList.add('active');
  el.modeExamBtn.classList.remove('active');
  el.sheetUrlStatus.textContent = '불러오는 중…';
  el.sheetUrlStatus.className = 'settings-status';
  try {
    const list = await dataLoader.loadFromGoogleSheets(url);
    if (list.length === 0) throw new Error('시트에서 문제를 찾지 못했습니다. 헤더(ID/과목/소과목/문제/정답)를 확인해 주세요.');
    storage.setSettings({ sheetUrl: url }, 'basic');
    await applyLoadedQuestions(list, 'Google Sheets', 'basic');
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

function convertExamRow(row) {
  const raw = row.raw || row;
  const optionEntries = [];
  Object.entries(raw).forEach(([key, value]) => {
    const match = String(key).match(/^(?:((?:보기|선택지|option|choice)(\d+)?)|(\d+))$/i);
    if (match && value !== undefined && value !== null && value !== '') {
      const index = match[2] ? Number(match[2]) : Number(match[3] || 0);
      if (index > 0) optionEntries.push([index, String(value)]);
    }
  });

  const answerValue = row.answer ?? row.답 ?? row.정답 ?? row.정답번호 ?? row.correct ?? row.correctAnswer ?? 0;
  const answerText = String(answerValue ?? '').trim();
  const numeric = Number(answerText.replace(/[^0-9]/g, ''));
  const normalizedAnswer = !Number.isNaN(numeric) && numeric > 0
    ? numeric
    : (({ a: 1, b: 2, c: 3, d: 4, e: 5, '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 })[answerText.toLowerCase()] || 0);

  let options = [];
  if (Array.isArray(row.options) && row.options.length) {
    options = row.options.filter((v) => v !== undefined && v !== null && v !== '').map((v) => String(v));
  } else if (typeof row.options === 'string' && row.options.trim()) {
    options = parseOptionList(row.options);
  } else if (optionEntries.length) {
    options = optionEntries.sort((a, b) => a[0] - b[0]).map(([, value]) => value);
  } else {
    Object.entries(raw).forEach(([key, value]) => {
      if (['options', 'choices', 'selects', 'optionlist'].includes(String(key).toLowerCase()) && value) {
        options = parseOptionList(value);
      }
    });
  }

  const normalizedOptions = options
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map((v) => String(v).trim())
    .slice(0, 4);

  const roundValue = row.round || row.회차 || raw.회차 || raw.Round || raw.round || '';

  return {
    id: row.id || row.ID || '',
    subject: row.subject || row.과목 || '',
    subSubject: row.subSubject || row.소과목 || '',
    question: row.question || row.문제 || '',
    options: normalizedOptions,
    answer: normalizedAnswer,
    explanation: row.explanation || row.해설 || '',
    difficulty: row.difficulty || row.난이도 || '',
    round: String(roundValue || '').trim(),
  };
}

async function loadExamFromSheet(url) {
  currentMode = 'exam';
  el.modeExamBtn.classList.add('active');
  el.modeBasicBtn.classList.remove('active');
  el.examSheetUrlStatus.textContent = '불러오는 중…';
  el.examSheetUrlStatus.className = 'settings-status';
  try {
    const list = await (url.includes('data/exam-sample.csv') ? dataLoader.loadFromCSVUrl(url) : dataLoader.loadFromGoogleSheets(url));
    if (list.length === 0) throw new Error('기출문제 시트에서 문제를 찾지 못했습니다.');
    const converted = list.map(convertExamRow).filter((q) => q.id && q.question);
    storage.setSettings({ examSheetUrl: url }, 'exam');
    await applyLoadedQuestions(converted, '기출문제 Google Sheets', 'exam');
    el.examSheetUrlStatus.textContent = `연결 완료 · 문제 ${converted.length}개`;
    el.examSheetUrlStatus.className = 'settings-status ok';
  } catch (err) {
    console.error(err);
    setSyncStatus('err');
    el.examSheetUrlStatus.textContent = err.message || '기출문제 연결에 실패했습니다.';
    el.examSheetUrlStatus.className = 'settings-status err';
    toast('기출문제 연결 실패', 'err');
  }
}

async function loadSample() {
  try {
    const list = await dataLoader.loadFromCSVUrl('data/sample.csv');
    await applyLoadedQuestions(list, '샘플 데이터', currentMode);
  } catch (err) {
    console.error(err);
    toast('샘플 데이터를 불러오지 못했습니다 (로컬 서버로 실행 중인지 확인해 주세요).', 'err');
  }
}

async function loadExamSample() {
  currentMode = 'exam';
  currentModeLabel = '기출문제';
  el.modeExamBtn.classList.add('active');
  el.modeBasicBtn.classList.remove('active');
  try {
    const list = await dataLoader.loadFromCSVUrl('data/exam-sample.csv');
    const converted = list.map((row) => {
      const raw = row.raw || row;
      const optionEntries = [];
      Object.entries(raw).forEach(([key, value]) => {
        const match = key.match(/^(보기|선택지|option|choice)(\d+)?$/i);
        if (match && value !== undefined && value !== null && value !== '') {
          optionEntries.push([Number(match[2] || 1), String(value)]);
        }
      });
      const answerValue = row.answer ?? row.정답 ?? row.정답번호 ?? row.correct ?? row.correctAnswer ?? 0;
      const answerText = String(answerValue ?? '').trim();
      const numeric = Number(answerText.replace(/[^0-9]/g, ''));
      const normalizedAnswer = !Number.isNaN(numeric) && numeric > 0 ? numeric : (({ a: 1, b: 2, c: 3, d: 4, e: 5, '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 })[answerText.toLowerCase()] || 0);
      let options = [];
      if (Array.isArray(row.options) && row.options.length) {
        options = row.options.filter((v) => v !== undefined && v !== null && v !== '').map((v) => String(v));
      } else if (typeof row.options === 'string' && row.options.trim()) {
        options = parseOptionList(row.options);
      } else if (optionEntries.length) {
        options = optionEntries.sort((a, b) => a[0] - b[0]).map(([, value]) => value);
      } else {
        Object.entries(raw).forEach(([key, value]) => {
          if (['options', 'choices', 'selects', 'optionlist'].includes(String(key).toLowerCase()) && value) {
            options = parseOptionList(value);
          }
        });
      }
      const normalizedOptions = options.filter((v) => v !== undefined && v !== null && v !== '').map((v) => String(v).trim()).slice(0, 4);
      const roundValue = row.round || row.회차 || raw.회차 || raw.Round || raw.round || '';
      return {
        id: row.id || row.ID || '',
        subject: row.subject || row.과목 || '',
        subSubject: row.subSubject || row.소과목 || '',
        question: row.question || row.문제 || '',
        options: normalizedOptions,
        answer: normalizedAnswer,
        explanation: row.explanation || row.해설 || '',
        difficulty: row.difficulty || row.난이도 || '',
        round: String(roundValue || '').trim(),
      };
    }).filter((q) => q.id && q.question);
    await applyLoadedQuestions(converted, '기출문제 샘플 데이터', 'exam');
  } catch (err) {
    console.error(err);
    toast('기출문제 샘플 데이터를 불러오지 못했습니다.', 'err');
  }
}

async function loadCSVFile(file) {
  try {
    const list = await dataLoader.loadFromCSVFile(file);
    await applyLoadedQuestions(list, file.name, currentMode);
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
  if (el.allLearningNavItem) el.allLearningNavItem.innerHTML = '';

  const rootLi = document.createElement('li');
  rootLi.className = 'subject-node root-node';

  const rootRow = document.createElement('div');
  rootRow.className = 'subject-row';

  const rootToggle = document.createElement('button');
  rootToggle.className = 'subject-toggle';
  rootToggle.type = 'button';
  rootToggle.textContent = '▸';
  rootToggle.setAttribute('aria-label', '과목 목록 열기');

  const rootBtn = document.createElement('button');
  rootBtn.className = 'nav-item';
  rootBtn.textContent = `🐣 전체 학습 (${questions.length})`;

  const rootSubList = document.createElement('ul');
  rootSubList.className = 'subsubject-list';
  rootSubList.style.display = 'none';

  rootToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = rootSubList.style.display !== 'none';
    rootSubList.style.display = isOpen ? 'none' : 'block';
    rootToggle.textContent = isOpen ? '▸' : '▾';
  });

  rootBtn.addEventListener('click', () => {
    beginLearning(questions.map((q) => q.id), { scope: '__all__', breadcrumb: '전체' });
  });

  rootRow.appendChild(rootToggle);
  rootRow.appendChild(rootBtn);
  rootLi.appendChild(rootRow);
  rootLi.appendChild(rootSubList);
  if (el.allLearningNavItem) {
    el.allLearningNavItem.appendChild(rootLi);
  } else {
    el.subjectTree.appendChild(rootLi);
  }

  menu.forEach((subjectNode) => {
    const li = document.createElement('li');
    li.className = 'subject-node';

    const row = document.createElement('div');
    row.className = 'subject-row';

    const toggle = document.createElement('button');
    toggle.className = 'subject-toggle';
    toggle.type = 'button';
    toggle.textContent = '▸';
    toggle.setAttribute('aria-label', '소과목 목록 열기');

    const header = document.createElement('button');
    header.className = 'nav-item';
    header.textContent = `${subjectNode.name} (${subjectNode.count})`;

    const subList = document.createElement('ul');
    subList.className = 'subsubject-list';
    subList.style.display = 'none';

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = subList.style.display !== 'none';
      subList.style.display = isOpen ? 'none' : 'block';
      toggle.textContent = isOpen ? '▸' : '▾';
    });

    header.addEventListener('click', () => {
      beginLearning(subjectNode.ids, { scope: subjectNode.name, breadcrumb: subjectNode.name });
    });

    subjectNode.children.forEach((subNode) => {
      const subLi = document.createElement('li');
      const subBtn = document.createElement('button');
      subBtn.className = 'nav-item';
      subBtn.textContent = `${subNode.name} (${subNode.count})`;
      subBtn.addEventListener('click', () => {
        beginLearning(subNode.ids, { scope: subjectNode.name, breadcrumb: `${subjectNode.name} › ${subNode.name}` });
      });
      subLi.appendChild(subBtn);
      subList.appendChild(subLi);
    });

    row.appendChild(toggle);
    row.appendChild(header);
    li.appendChild(row);
    li.appendChild(subList);
    rootSubList.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// 회차별 목록 (기출문제 모드 전용 — "회차" 컬럼 기준)
// ---------------------------------------------------------------------------
function renderRoundTree() {
  if (!el.roundNavSection || !el.roundTree) return;

  const showRoundNav = currentMode === 'exam' && examRoundMenu.length > 0;
  el.roundNavSection.style.display = showRoundNav ? '' : 'none';
  if (!showRoundNav) {
    el.roundTree.innerHTML = '';
    return;
  }

  el.roundTree.innerHTML = '';
  examRoundMenu.forEach((roundNode) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.textContent = `${roundNode.name} (${roundNode.count})`;
    btn.addEventListener('click', () => {
      beginLearning(roundNode.ids, { scope: `round:${roundNode.name}`, breadcrumb: roundNode.name });
    });
    li.appendChild(btn);
    const mockBtn = document.createElement('button');
    mockBtn.className = 'nav-item mock-start-btn';
    mockBtn.textContent = '📝 모의고사로 풀기';
    mockBtn.addEventListener('click', () => startMock(roundNode));
    li.appendChild(mockBtn);
    el.roundTree.appendChild(li);
  });
}

function getWrongIds() {
  return storage.getWrongList(currentMode).filter((id) => byId.has(id));
}

function renderWrongScopeMenu() {
  if (!el.wrongScopeTree) return;
  el.wrongScopeTree.innerHTML = '';

  const wrongIds = getWrongIds();
  if (!wrongIds.length) {
    const li = document.createElement('li');
    const emptyBtn = document.createElement('button');
    emptyBtn.className = 'nav-item';
    emptyBtn.textContent = '오답 문제가 없습니다';
    emptyBtn.disabled = true;
    li.appendChild(emptyBtn);
    el.wrongScopeTree.appendChild(li);
    return;
  }

  const allLi = document.createElement('li');
  const allBtn = document.createElement('button');
  allBtn.className = 'nav-item';
  allBtn.textContent = `전체 (${wrongIds.length})`;
  allBtn.addEventListener('click', () => {
    beginLearning(wrongIds, { scope: '__wrong__', breadcrumb: '오답노트' });
  });
  allLi.appendChild(allBtn);
  el.wrongScopeTree.appendChild(allLi);

  menu.forEach((subjectNode) => {
    const subjectWrongIds = wrongIds.filter((id) => subjectNode.ids.includes(id));
    if (!subjectWrongIds.length) return;

    const subjectLi = document.createElement('li');
    const subjectBtn = document.createElement('button');
    subjectBtn.className = 'nav-item';
    subjectBtn.textContent = `${subjectNode.name} (${subjectWrongIds.length})`;
    subjectBtn.addEventListener('click', () => {
      beginLearning(subjectWrongIds, { scope: subjectNode.name, breadcrumb: `오답노트 › ${subjectNode.name}` });
    });
    subjectLi.appendChild(subjectBtn);
    el.wrongScopeTree.appendChild(subjectLi);

    const subList = document.createElement('ul');
    subList.className = 'subsubject-list';
    subList.style.display = 'none';

    subjectNode.children.forEach((subNode) => {
      const subWrongIds = subjectWrongIds.filter((id) => subNode.ids.includes(id));
      if (!subWrongIds.length) return;

      const subLi = document.createElement('li');
      const subBtn = document.createElement('button');
      subBtn.className = 'nav-item';
      subBtn.textContent = `${subNode.name} (${subWrongIds.length})`;
      subBtn.addEventListener('click', () => {
        beginLearning(subWrongIds, { scope: `${subjectNode.name} › ${subNode.name}`, breadcrumb: `오답노트 › ${subjectNode.name} › ${subNode.name}` });
      });
      subLi.appendChild(subBtn);
      subList.appendChild(subLi);
    });

    if (subList.children.length) {
      subjectLi.appendChild(subList);
    }
  });
}

/** 복습 기한이 지난 문제 ID (현재 로딩된 문제에 있는 것만) */
function getReviewIds() {
  return getDueIds(storage.getAllQuestionStats(currentMode), Date.now()).filter((id) => byId.has(id));
}

function renderNavCounts() {
  el.countReview.textContent = getReviewIds().length;
  el.countWrong.textContent = storage.getWrongList(currentMode).length;
  el.countBookmark.textContent = storage.getBookmarks(currentMode).length;
  el.countFavorite.textContent = storage.getFavorites(currentMode).length;
  renderWrongScopeMenu();
}

// ---------------------------------------------------------------------------
// 퀴즈(문제풀이)
// ---------------------------------------------------------------------------
/** 카드 화면 상태(정답 공개/채점/입력/선택)를 초기화한다. */
function resetCardState() {
  revealed = false;
  graded = false;
  myAnswerDraft = '';
  selectedOption = 0;
}

function startSession(ids, { scope, breadcrumb }) {
  if (!quiz) return;
  quiz.start(ids, { shuffle: el.shuffleToggle.checked, scope });
  el.quizBreadcrumb.textContent = `${breadcrumb} (${ids.length}문제)`;
  resetCardState();
}

function beginLearning(ids, { scope, breadcrumb }) {
  startSession(ids, { scope, breadcrumb });
  navigate('quiz');
  renderQuizCard();
}

/** 사이드바 필터와 무관하게, 입력한 문제 ID로 바로 이동한다. */
function goToQuestionId(rawId) {
  const id = String(rawId || '').trim();
  if (!id) { toast('문제 ID를 입력해 주세요.', 'err'); return; }
  if (!byId.has(id)) { toast(`ID "${id}" 문제를 찾을 수 없습니다.`, 'err'); return; }
  if (!quiz) return;

  let idx = quiz.queue.indexOf(id);
  if (idx < 0) {
    // 현재 필터(과목/오답노트 등)에 없는 문제면 전체 목록으로 전환해서 찾는다.
    startSession(questions.map((q) => q.id), { scope: '__all__', breadcrumb: '전체' });
    idx = quiz.queue.indexOf(id);
  }
  if (idx < 0) return;

  quiz.index = idx;
  resetCardState();
  navigate('quiz');
  renderQuizCard();
}

function updateProgress() {
  const p = quiz.progress();
  const pct = p.total ? Math.round((p.index / p.total) * 100) : 0;
  el.quizProgressBar.style.width = `${pct}%`;
  el.quizProgressLabel.textContent = `${p.total ? p.index : 0} / ${p.total}`;
  el.prevBtn.disabled = !quiz.hasPrev();
  el.nextBtn.disabled = !quiz.hasNext();
}

/** 내 답과 정답이 일치하는지 (공백 제거 후 비교, 정답이 HTML이면 태그 제거) */
function isAnswerMatch(draft, answer) {
  const norm = (v) => String(v || '').replace(/<[^>]*>/g, '').replace(/\s+/g, '');
  const d = norm(draft);
  return d.length > 0 && d === norm(answer);
}

/** 해설 블록 (해설 컬럼이 없거나 비어 있으면 표시하지 않는다) */
function explanationBlock(q) {
  if (!q.explanation) return '';
  return `
        <div class="qcard-answer-wrap qcard-explain-wrap">
          <div class="qcard-answer-label">해설</div>
          <div class="qcard-answer-text">${sanitizeHtml(q.explanation)}</div>
        </div>`;
}

/** 난이도 배지 (난이도 컬럼이 없거나 비어 있으면 표시하지 않는다) */
function difficultyBadge(q) {
  if (!q.difficulty) return '';
  return `<span class="qcard-difficulty">${escapeHtml(q.difficulty)}</span>`;
}

function renderShortAnswerQuiz(q, qs, accuracy, isBookmarked, isFavorite) {
  const studyMode = el.studyModeToggle.checked;
  const effectiveRevealed = revealed || studyMode;
  const showAnswerInput = !studyMode;
  const isMatch = isAnswerMatch(myAnswerDraft, q.answer);

  el.quizCardWrap.innerHTML = `
    <div class="qcard">
      <div class="qcard-eyebrow">
        <span class="qcard-path">${qcardPathLabel(q)}${accuracy !== null ? ` · 누적 정답률 ${accuracy}%` : ''}</span>
        ${difficultyBadge(q)}
        <span class="qcard-tools">
          <button class="qcard-icon-btn bookmark ${isBookmarked ? 'on' : ''}" id="bookmarkBtn" title="북마크">${isBookmarked ? '🏷️' : '🔖'}</button>
          <button class="qcard-icon-btn favorite ${isFavorite ? 'on' : ''}" id="favoriteBtn" title="즐겨찾기">${isFavorite ? '🌟' : '⭐'}</button>
        </span>
      </div>
      <div class="qcard-question">${escapeHtml(q.question || '')}</div>

      ${showAnswerInput ? `
        <div class="qcard-input-wrap">
          <div class="qcard-answer-label">내 답 적어보기</div>
          <textarea id="myAnswerInput" class="qcard-input ${isMatch ? 'match' : ''}" rows="2" ${effectiveRevealed ? 'readonly' : ''} placeholder="정답을 보기 전에 먼저 답을 적어보세요">${escapeHtml(myAnswerDraft)}</textarea>
        </div>
      ` : ''}

      ${effectiveRevealed ? `
        <div class="qcard-answer-wrap">
          <div class="qcard-answer-label">정답${isMatch ? ' <span class="qcard-match-tag">✓ 내 답과 일치</span>' : ''}</div>
          <div class="qcard-answer-text">${sanitizeHtml(q.answer || '')}</div>
        </div>
        ${explanationBlock(q)}
        ${!graded ? `
          <div class="grade-actions">
            <button class="grade-btn correct" id="gradeCorrect">맞았어요</button>
            <button class="grade-btn wrong" id="gradeWrong">틀렸어요</button>
          </div>
        ` : `
          <div class="qcard-actions">
            <span class="qcard-graded-tag ${qs.lastResult ? 'correct' : 'wrong'}">${qs.lastResult ? '✓ 맞음으로 기록됨' : '🐸 오답으로 기록됨'}</span>
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
    storage.toggleBookmark(q.id, currentMode);
    renderNavCounts();
    renderQuizCard();
  });
  $('#favoriteBtn').addEventListener('click', () => {
    storage.toggleFavorite(q.id, currentMode);
    renderNavCounts();
    renderQuizCard();
  });

  const myAnswerInput = $('#myAnswerInput');
  if (myAnswerInput) {
    myAnswerInput.addEventListener('input', (e) => {
      myAnswerDraft = e.target.value;
      myAnswerInput.classList.toggle('match', isAnswerMatch(myAnswerDraft, q.answer));
    });
  }

  const revealBtn = $('#revealBtn');
  if (revealBtn) revealBtn.addEventListener('click', () => { revealed = true; renderQuizCard(); });

  const gradeCorrect = $('#gradeCorrect');
  const gradeWrong = $('#gradeWrong');
  if (gradeCorrect) gradeCorrect.addEventListener('click', () => {
    notifyGraduation(quiz.submitResult(true, currentMode));
    graded = true;
    renderNavCounts();
    goNext();
  });
  if (gradeWrong) gradeWrong.addEventListener('click', () => {
    notifyGraduation(quiz.submitResult(false, currentMode));
    graded = true;
    renderNavCounts();
    goNext();
  });
}

function renderMultipleChoiceQuiz(q, qs, accuracy, isBookmarked, isFavorite) {
  const options = Array.isArray(q.options)
    ? q.options.filter((opt) => opt !== undefined && opt !== null && opt !== '').map((opt) => String(opt).trim())
    : [];
  const visibleOptions = options.slice(0, 4);
  const selectedIndex = selectedOption || -1;
  const answerIndex = Number(q.answer || 0);
  const showResult = graded || revealed;
  const hasOptions = visibleOptions.length >= 4;
  window.__debug_render_variant = { hasOptions, optionCount: options.length, visibleOptions, answerIndex, selectedIndex, qOptions: q.options };

  el.quizCardWrap.innerHTML = `
    <div class="qcard">
      <div class="qcard-eyebrow">
        <span class="qcard-path">${qcardPathLabel(q)}${accuracy !== null ? ` · 누적 정답률 ${accuracy}%` : ''}</span>
        ${difficultyBadge(q)}
        <span class="qcard-tools">
          <button class="qcard-icon-btn bookmark ${isBookmarked ? 'on' : ''}" id="bookmarkBtn" title="북마크">${isBookmarked ? '🏷️' : '🔖'}</button>
          <button class="qcard-icon-btn favorite ${isFavorite ? 'on' : ''}" id="favoriteBtn" title="즐겨찾기">${isFavorite ? '🌟' : '⭐'}</button>
        </span>
      </div>
      <div class="qcard-question">${escapeHtml(q.question || '')}</div>

      ${hasOptions ? `
        <div class="option-list">
          ${visibleOptions.map((opt, idx) => {
            const optionNumber = idx + 1;
            const isSelected = selectedIndex === optionNumber;
            const isCorrect = showResult && optionNumber === answerIndex;
            const isWrongSelected = showResult && isSelected && optionNumber !== answerIndex;
            const className = ['option-btn', isSelected ? 'selected' : '', isCorrect ? 'correct' : '', isWrongSelected ? 'wrong' : ''].filter(Boolean).join(' ');
            return `<button class="${className}" data-option="${optionNumber}" type="button">${escapeHtml(opt)}</button>`;
          }).join('')}
        </div>
      ` : ''}

      ${showResult ? explanationBlock(q) : ''}

      ${!showResult ? `
        <div class="qcard-actions">
          <button class="btn btn-primary" id="confirmBtn">정답 확인</button>
        </div>
      ` : ''}
      <div class="qcard-id-stamp">${escapeHtml(q.id)}</div>
    </div>
  `;

  $('#bookmarkBtn').addEventListener('click', () => {
    storage.toggleBookmark(q.id, currentMode);
    renderNavCounts();
    renderQuizCard();
  });
  $('#favoriteBtn').addEventListener('click', () => {
    storage.toggleFavorite(q.id, currentMode);
    renderNavCounts();
    renderQuizCard();
  });

  document.querySelectorAll('.option-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (showResult) return;
      selectedOption = Number(btn.dataset.option || 0);
      renderQuizCard();
    });
  });

  const confirmBtn = $('#confirmBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const selected = selectedOption;
      const answer = Number(q.answer || 0);
      const correct = selected === answer;
      notifyGraduation(quiz.submitResult(correct, currentMode));
      revealed = true;
      graded = true;
      renderNavCounts();
      renderQuizCard();
    });
  }
}

function renderQuizCard() {
  if (!quiz) return;
  updateProgress();
  const q = quiz.current();

  if (!q) {
    el.quizCardWrap.innerHTML = `<div class="qcard qcard-empty">이 목록에는 표시할 문제가 없습니다.<br/>다른 메뉴를 선택해 보세요.</div>`;
    return;
  }

  const isBookmarked = storage.isBookmarked(q.id, currentMode);
  const isFavorite = storage.isFavorite(q.id, currentMode);
  const qs = storage.getQuestionStats(q.id, currentMode);
  const accuracy = qs.attempts ? Math.round((qs.correct / qs.attempts) * 100) : null;
  const hasMultipleChoiceOptions = Array.isArray(q.options) && q.options.filter((opt) => opt !== undefined && opt !== null && opt !== '').length >= 4;
  const isExamMode = currentMode === 'exam' && hasMultipleChoiceOptions;

  if (isExamMode) {
    renderMultipleChoiceQuiz(q, qs, accuracy, isBookmarked, isFavorite);
  } else {
    renderShortAnswerQuiz(q, qs, accuracy, isBookmarked, isFavorite);
  }
  // 👇 여기부터 추가: 화면에 카드가 그려진 직후 수식을 렌더링
  if (window.renderMathInElement) {
    window.renderMathInElement(el.quizCardWrap, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false}, // 사용자가 작성한 $...$ 인라인 수식 처리
        {left: '\\(', right: '\\)', display: false},
        {left: '\\[', right: '\\]', display: true}
      ],
      throwOnError: false
    });
  }
}

function goNext() {
  if (quiz.hasNext()) { quiz.next(); resetCardState(); renderQuizCard(); }
}
function goPrev() {
  if (quiz.hasPrev()) { quiz.prev(); resetCardState(); renderQuizCard(); }
}

function qcardPathLabel(q) {
  const roundPart = q.round ? `${escapeHtml(q.round)} · ` : '';
  return `${roundPart}${escapeHtml(q.subject || '')} › ${escapeHtml(q.subSubject || '')}`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 정답처럼 HTML 그대로 출력하는 값을 정화한다 (표/수식/br 등은 유지, 스크립트는 제거). */
function sanitizeHtml(html) {
  const value = String(html ?? '');
  if (window.DOMPurify) return window.DOMPurify.sanitize(value);
  return escapeHtml(value);
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
      if (el.wrongScopeTree) {
        el.wrongScopeTree.style.display = 'block';
      }
      beginLearning(getWrongIds(), { scope: '__wrong__', breadcrumb: '오답노트' });
      navigate('quiz');
      renderQuizCard();
    } else if (view === 'review') {
      beginLearning(getReviewIds(), { scope: '__review__', breadcrumb: '오늘의 복습' });
      renderNavCounts();
    } else if (view === 'bookmark') {
      beginLearning(storage.getBookmarks(currentMode), { scope: '__bookmark__', breadcrumb: '북마크' });
    } else if (view === 'favorite') {
      beginLearning(storage.getFavorites(currentMode), { scope: '__favorite__', breadcrumb: '즐겨찾기' });
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
  storage.setSettings({ darkMode: next }, currentMode === 'exam' ? 'exam' : 'basic');
  storage.setSettings({ darkMode: next }, 'exam');
  applyTheme(next);
});
el.darkToggleSettings.addEventListener('change', (e) => {
  storage.setSettings({ darkMode: e.target.checked }, currentMode === 'exam' ? 'exam' : 'basic');
  storage.setSettings({ darkMode: e.target.checked }, 'exam');
  applyTheme(e.target.checked);
});
el.fontSelect.addEventListener('change', (e) => {
  storage.setSettings({ font: e.target.value }, 'basic');
  storage.setSettings({ font: e.target.value }, 'exam');
  applyFont(e.target.value);
});

el.graduateStreakInput.addEventListener('change', (e) => {
  const n = Math.min(5, Math.max(1, Math.floor(Number(e.target.value)) || 2));
  e.target.value = n;
  storage.setSettings({ graduateStreak: n }, 'basic');
  storage.setSettings({ graduateStreak: n }, 'exam');
});

el.prevBtn.addEventListener('click', goPrev);
el.nextBtn.addEventListener('click', goNext);
el.modeBasicBtn.addEventListener('click', async () => {
  currentMode = 'basic';
  currentModeLabel = '빈출문제';
  el.modeBasicBtn.classList.add('active');
  el.modeExamBtn.classList.remove('active');
  examRoundMenu = [];
  renderRoundTree();
  const settings = storage.getSettings('basic');
  if (settings.sheetUrl) {
    await loadFromSheet(settings.sheetUrl);
  } else {
    await loadSample();
  }
});
el.modeExamBtn.addEventListener('click', async () => {
  currentMode = 'exam';
  currentModeLabel = '기출문제';
  el.modeExamBtn.classList.add('active');
  el.modeBasicBtn.classList.remove('active');
  const settings = storage.getSettings('exam');
  if (settings.examSheetUrl) {
    await loadExamFromSheet(settings.examSheetUrl);
  } else {
    await loadExamSample();
  }
});
el.studyModeToggle.addEventListener('change', () => {
  if (quiz) renderQuizCard();
});
el.shuffleToggle.addEventListener('change', () => {
  if (quiz && quiz.queue.length) {
    const currentId = quiz.current() ? quiz.current().id : null;
    quiz.start(quiz.queue, { shuffle: el.shuffleToggle.checked, scope: quiz.scope });
    if (currentId) {
      const idx = quiz.queue.indexOf(currentId);
      if (idx >= 0) quiz.index = idx;
    }
    resetCardState();
    renderQuizCard();
  }
});
el.gotoIdBtn.addEventListener('click', () => {
  goToQuestionId(el.gotoIdInput.value);
});
el.gotoIdInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') goToQuestionId(el.gotoIdInput.value);
});
el.finishRoundBtn.addEventListener('click', () => {
  const result = quiz ? quiz.finishRound(currentMode) : null;
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
el.examSheetUrlSave.addEventListener('click', () => {
  const url = el.examSheetUrlInput.value.trim();
  if (!url) { toast('기출문제 Google Sheets 링크를 입력해 주세요.', 'err'); return; }
  loadExamFromSheet(url);
});
el.syncUrlSave.addEventListener('click', async () => {
  const url = el.syncUrlInput.value.trim();
  const sheetUrl = el.syncSheetUrlInput.value.trim();
  storage.setSettings({ syncUrl: url, syncSheetUrl: sheetUrl }, 'basic');
  storage.setSettings({ syncUrl: url, syncSheetUrl: sheetUrl }, 'exam');
  if (!url) {
    el.syncUrlStatus.textContent = '동기화를 해제했습니다 (이 브라우저에만 저장됩니다).';
    el.syncUrlStatus.className = 'settings-status';
    return;
  }
  el.syncUrlStatus.textContent = '불러오는 중…';
  el.syncUrlStatus.className = 'settings-status';
  const data = await storage.pullFromCloud(currentMode);
  if (data) {
    renderNavCounts();
    if ($('#view-stats').classList.contains('active')) renderStats();
    el.syncUrlStatus.textContent = '연결 완료 · 이 기기의 학습기록을 시트 기준으로 갱신했습니다.';
    el.syncUrlStatus.className = 'settings-status ok';
    toast('동기화 연결 완료', 'ok');
  } else {
    el.syncUrlStatus.textContent = '연결에 실패했습니다. Apps Script 배포 URL과 접근 권한을 확인해 주세요.';
    el.syncUrlStatus.className = 'settings-status err';
    toast('동기화 연결 실패', 'err');
  }
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
  if (quiz) { resetCardState(); renderQuizCard(); }
  renderStats();
});

// ---------------------------------------------------------------------------
// 모의고사 (기출문제 회차를 즉시 채점 없이 끝까지 풀고 일괄 제출)
// 진행 중 상태는 새로고침 대비로 sessionStorage에만 임시 저장한다 (학습기록 키와 무관).
// ---------------------------------------------------------------------------
const MOCK_KEY = 'qa_mock_session';
let mock = null; // { round, ids, answers: { [id]: 보기번호 }, startedAt, result? }
let mockTimer = null;

function saveMock() {
  try {
    if (mock && !mock.result) sessionStorage.setItem(MOCK_KEY, JSON.stringify(mock));
    else sessionStorage.removeItem(MOCK_KEY);
  } catch (e) { /* 저장 불가 환경이면 새로고침 복구만 포기 */ }
}

function stopMockTimer() {
  if (mockTimer) { clearInterval(mockTimer); mockTimer = null; }
}

function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** 객관식 보기 목록 (renderMultipleChoiceQuiz와 같은 기준: 앞 4개) */
function getMockOptions(q) {
  return Array.isArray(q.options)
    ? q.options.filter((opt) => opt !== undefined && opt !== null && opt !== '').map((opt) => String(opt).trim()).slice(0, 4)
    : [];
}

function startMock(roundNode) {
  const list = roundNode.ids.filter((id) => byId.has(id) && getMockOptions(byId.get(id)).length >= 4);
  if (!list.length) { toast('이 회차에는 모의고사로 풀 수 있는 객관식 문제가 없습니다.', 'err'); return; }
  mock = { round: roundNode.name, ids: list, answers: {}, startedAt: Date.now() };
  saveMock();
  renderMock();
}

function resumeMockIfAny() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(MOCK_KEY) || 'null');
    if (!saved || !Array.isArray(saved.ids)) return;
    const ids = saved.ids.filter((id) => byId.has(id));
    if (!ids.length) return;
    mock = { ...saved, ids };
    renderMock();
    toast('진행 중이던 모의고사를 이어서 표시합니다.');
  } catch (e) { /* 손상된 임시 데이터는 무시 */ }
}

function updateMockHeader() {
  const timerEl = $('#mockTimer');
  const countEl = $('#mockAnswered');
  if (timerEl) timerEl.textContent = formatElapsed(Date.now() - mock.startedAt);
  if (countEl) countEl.textContent = `${Object.keys(mock.answers).length} / ${mock.ids.length}`;
}

function renderMock() {
  if (!mock) return;
  navigate('mock');
  if (mock.result) { renderMockResult(); return; }

  const body = $('#mockBody');
  body.innerHTML = `
    <div class="mock-header">
      <div>
        <div class="mock-title">📝 모의고사 · ${escapeHtml(mock.round)}</div>
        <div class="mock-meta">경과 <span id="mockTimer" class="mock-timer">00:00:00</span> · 답 <span id="mockAnswered"></span></div>
      </div>
      <div class="mock-header-actions">
        <button id="mockCancelBtn" class="btn btn-ghost btn-sm" type="button">그만두기</button>
        <button id="mockSubmitBtn" class="btn btn-primary" type="button">제출하기</button>
      </div>
    </div>
    ${mock.ids.map((id, i) => {
      const q = byId.get(id);
      return `
        <div class="qcard mock-q" data-id="${escapeHtml(id)}">
          <div class="qcard-eyebrow"><span class="qcard-path">${i + 1}번 · ${qcardPathLabel(q)}</span></div>
          <div class="qcard-question">${escapeHtml(q.question || '')}</div>
          <div class="option-list">
            ${getMockOptions(q).map((opt, idx) => `<button class="option-btn ${mock.answers[id] === idx + 1 ? 'selected' : ''}" data-option="${idx + 1}" type="button">${escapeHtml(opt)}</button>`).join('')}
          </div>
        </div>`;
    }).join('')}
    <div class="mock-footer"><button id="mockSubmitBtn2" class="btn btn-primary" type="button">제출하기</button></div>
  `;

  body.querySelectorAll('.mock-q').forEach((card) => {
    card.querySelectorAll('.option-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = card.dataset.id;
        const n = Number(btn.dataset.option);
        if (mock.answers[id] === n) delete mock.answers[id]; // 같은 보기를 다시 누르면 선택 해제
        else mock.answers[id] = n;
        card.querySelectorAll('.option-btn').forEach((b) => b.classList.toggle('selected', mock.answers[id] === Number(b.dataset.option)));
        saveMock();
        updateMockHeader();
      });
    });
  });

  $('#mockSubmitBtn').addEventListener('click', submitMock);
  $('#mockSubmitBtn2').addEventListener('click', submitMock);
  $('#mockCancelBtn').addEventListener('click', () => {
    if (!confirm('모의고사를 그만둘까요? 지금까지 고른 답은 기록되지 않습니다.')) return;
    mock = null;
    saveMock();
    beginLearning(questions.map((q) => q.id), { scope: '__all__', breadcrumb: '전체' });
  });

  updateMockHeader();
  stopMockTimer();
  mockTimer = setInterval(updateMockHeader, 1000);
  window.scrollTo(0, 0);
}

function submitMock() {
  const unanswered = mock.ids.length - Object.keys(mock.answers).length;
  const msg = unanswered
    ? `아직 답하지 않은 문제가 ${unanswered}개 있습니다 (오답 처리됩니다). 제출할까요?`
    : '제출할까요?';
  if (!confirm(msg)) return;

  // 기존 채점 경로(quiz.submitResult)로 문제별 기록과 회독 점수를 저장한다.
  startSession(mock.ids, { scope: `round:${mock.round}`, breadcrumb: `${mock.round} 모의고사` });
  const items = mock.ids.map((id, i) => {
    const q = byId.get(id);
    const mine = mock.answers[id] || 0;
    const correct = mine === Number(q.answer || 0);
    quiz.index = i;
    notifyGraduation(quiz.submitResult(correct, currentMode));
    return { id, mine, correct };
  });
  quiz.finishRound(currentMode);

  mock.result = { items, elapsedMs: Date.now() - mock.startedAt };
  saveMock(); // result가 있으므로 임시 저장은 삭제된다
  stopMockTimer();
  renderNavCounts();
  renderMockResult();
}

function renderMockResult() {
  const { items, elapsedMs } = mock.result;
  const correctCount = items.filter((it) => it.correct).length;
  const pct = items.length ? Math.round((correctCount / items.length) * 100) : 0;

  const bySubject = new Map();
  items.forEach((it) => {
    const subject = byId.get(it.id).subject || '(과목 없음)';
    const row = bySubject.get(subject) || { correct: 0, total: 0 };
    row.total += 1;
    if (it.correct) row.correct += 1;
    bySubject.set(subject, row);
  });

  const wrongItems = items.filter((it) => !it.correct);
  $('#mockBody').innerHTML = `
    <div class="mock-header">
      <div>
        <div class="mock-title">📝 모의고사 결과 · ${escapeHtml(mock.round)}</div>
        <div class="mock-meta">소요 시간 ${formatElapsed(elapsedMs)}</div>
      </div>
    </div>
    <div class="qcard mock-result">
      <div class="mock-score"><span class="mock-score-num">${correctCount}</span> / ${items.length} <span class="mock-score-pct">(${pct}%)</span></div>
      <div class="mock-subjects">
        ${Array.from(bySubject.entries()).map(([name, r]) => `<div class="mock-subject-row"><span>${escapeHtml(name)}</span><span>${r.correct} / ${r.total}</span></div>`).join('')}
      </div>
    </div>
    <h3 class="mock-wrong-title">틀린 문제 (${wrongItems.length})</h3>
    ${wrongItems.length ? wrongItems.map((it) => {
      const q = byId.get(it.id);
      const opts = getMockOptions(q);
      return `
        <div class="qcard mock-wrong">
          <div class="qcard-path-line">${qcardPathLabel(q)} · ${escapeHtml(q.id)}</div>
          <div class="qcard-question">${escapeHtml(q.question || '')}</div>
          <div class="mock-wrong-line bad">내 답: ${it.mine ? escapeHtml(opts[it.mine - 1] || String(it.mine)) : '(미응답)'}</div>
          <div class="mock-wrong-line good">정답: ${escapeHtml(opts[Number(q.answer) - 1] || String(q.answer))}</div>
          ${explanationBlock(q)}
        </div>`;
    }).join('') : '<div class="qcard qcard-empty">모두 맞혔습니다! 🎉</div>'}
    <div class="mock-footer">
      ${wrongItems.length ? '<button id="mockRetryBtn" class="btn btn-primary" type="button">틀린 문제만 다시 풀기</button>' : ''}
      <button id="mockDoneBtn" class="btn btn-ghost" type="button">닫기</button>
    </div>
  `;

  const retry = $('#mockRetryBtn');
  if (retry) retry.addEventListener('click', () => {
    const ids = wrongItems.map((it) => it.id);
    mock = null;
    saveMock();
    beginLearning(ids, { scope: '__mock_wrong__', breadcrumb: '모의고사 틀린 문제' });
  });
  $('#mockDoneBtn').addEventListener('click', () => {
    mock = null;
    saveMock();
    beginLearning(questions.map((q) => q.id), { scope: '__all__', breadcrumb: '전체' });
  });

  if (window.renderMathInElement) {
    window.renderMathInElement($('#mockBody'), {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true },
      ],
      throwOnError: false,
    });
  }
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// 키보드 단축키 (해당 버튼의 click()을 호출해 로직을 중복하지 않는다)
// ---------------------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$('#view-quiz').classList.contains('active') || !quiz) return;

  const active = document.activeElement;
  const tag = active ? active.tagName : '';
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (active && active.isContentEditable);
  if (typing) {
    if (e.key === 'Escape') active.blur();
    return;
  }

  const clickIf = (selector) => {
    const btn = $(selector);
    if (!btn || btn.disabled) return false;
    btn.click();
    return true;
  };
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  let handled = false;
  // 버튼에 포커스가 남아 있으면 Space/Enter가 브라우저 기본 클릭을 한 번 더 일으키므로 먼저 해제한다.
  if ((key === ' ' || key === 'Enter') && tag === 'BUTTON') active.blur();

  if (key === 'ArrowRight') handled = clickIf('#nextBtn');
  else if (key === 'ArrowLeft') handled = clickIf('#prevBtn');
  else if (key === ' ' || key === 'Enter') {
    handled = clickIf('#revealBtn') || (selectedOption > 0 && clickIf('#confirmBtn'));
  }
  else if (key === 'b') handled = clickIf('#bookmarkBtn');
  else if (key === 'f') handled = clickIf('#favoriteBtn');
  else if (/^[1-5]$/.test(key)) {
    if ($('#gradeCorrect')) {
      if (key === '1') handled = clickIf('#gradeCorrect');
      else if (key === '2') handled = clickIf('#gradeWrong');
    } else handled = clickIf(`.option-btn[data-option="${key}"]`);
  }

  if (handled) e.preventDefault();
});

// ---------------------------------------------------------------------------
// 모바일 스와이프 (가로로 60px 넘게, 세로 이동보다 크게 움직이면 이전/다음)
// ---------------------------------------------------------------------------
let swipeStart = null;
el.quizCardWrap.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  // 입력칸에서 시작한 터치(텍스트 선택/커서 이동)는 무시
  swipeStart = e.touches.length === 1 && !e.target.closest('textarea, input')
    ? { x: t.clientX, y: t.clientY }
    : null;
}, { passive: true });
el.quizCardWrap.addEventListener('touchend', (e) => {
  if (!swipeStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - swipeStart.x;
  const dy = t.clientY - swipeStart.y;
  swipeStart = null;
  if (Math.abs(dx) <= 60 || Math.abs(dx) <= Math.abs(dy)) return;
  const btn = dx < 0 ? el.nextBtn : el.prevBtn;
  if (!btn.disabled) btn.click();
}, { passive: true });

// ---------------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------------
(async function init() {
  const basicSettings = storage.getSettings('basic');
  const examSettings = storage.getSettings('exam');
  applyTheme(!!basicSettings.darkMode || !!examSettings.darkMode);
  applyFont(basicSettings.font || examSettings.font || 'default');
  el.graduateStreakInput.value = storage.getGraduateStreak('basic');
  el.sheetUrlInput.value = basicSettings.sheetUrl || '';
  el.examSheetUrlInput.value = examSettings.examSheetUrl || '';
  el.syncUrlInput.value = storage.getSyncUrl('basic') || storage.getSyncUrl('exam') || '';
  el.syncSheetUrlInput.value = basicSettings.syncSheetUrl || examSettings.syncSheetUrl || '';
  renderNavCounts();

  if (basicSettings.sheetUrl) {
    setSyncStatus('loading');
    await loadFromSheet(basicSettings.sheetUrl);
  } else {
    navigate('empty');
  }
})();
