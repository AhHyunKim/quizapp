// app.js
// UI 컨트롤러. 데이터 로딩(dataLoader) / 저장(storageManager) / 메뉴 생성(menuBuilder) /
// 문제풀이 진행(quizEngine) / 통계 집계(statsManager) 모듈을 화면에 연결하는 역할만 한다.

import DataLoader from './dataLoader.js';
import StorageManager from './storageManager.js';
import MenuBuilder, { naturalCompare } from './menuBuilder.js';
import QuizEngine from './quizEngine.js';
import StatsManager from './statsManager.js';

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
  syncStatus: $('#syncStatus'),
  subjectTree: $('#subjectTree'),
  roundNavSection: $('#roundNavSection'),
  roundLabel: $('#roundLabel'),
  roundTree: $('#roundTree'),
  allLearningNavItem: $('#allLearningNavItem'),
  countWrong: $('#countWrong'),
  countBookmark: $('#countBookmark'),
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

function renderNavCounts() {
  el.countWrong.textContent = storage.getWrongList(currentMode).length;
  el.countBookmark.textContent = storage.getBookmarks(currentMode).length;
  el.countFavorite.textContent = storage.getFavorites(currentMode).length;
  renderWrongScopeMenu();
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
  myAnswerDraft = '';
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
  revealed = false;
  graded = false;
  myAnswerDraft = '';
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

function renderShortAnswerQuiz(q, qs, accuracy, isBookmarked, isFavorite) {
  const studyMode = el.studyModeToggle.checked;
  const effectiveRevealed = revealed || studyMode;
  const showAnswerInput = !studyMode;
  const isMatch = studyMode && myAnswerDraft.trim().length > 0
    && myAnswerDraft.trim().replace(/\s+/g, '') === String(q.answer || '').trim().replace(/\s+/g, '');

  el.quizCardWrap.innerHTML = `
    <div class="qcard">
      <div class="qcard-eyebrow">
        <span class="qcard-path">${qcardPathLabel(q)}${accuracy !== null ? ` · 누적 정답률 ${accuracy}%` : ''}</span>
        <span class="qcard-tools">
          <button class="qcard-icon-btn bookmark ${isBookmarked ? 'on' : ''}" id="bookmarkBtn" title="북마크">${isBookmarked ? '🏷️' : '🔖'}</button>
          <button class="qcard-icon-btn favorite ${isFavorite ? 'on' : ''}" id="favoriteBtn" title="즐겨찾기">${isFavorite ? '🌟' : '⭐'}</button>
        </span>
      </div>
      <div class="qcard-question">${escapeHtml(q.question || '')}</div>

      ${showAnswerInput ? `
        <div class="qcard-input-wrap">
          <div class="qcard-answer-label">내 답 적어보기</div>
          <textarea id="myAnswerInput" class="qcard-input ${isMatch ? 'match' : ''}" rows="2" placeholder="정답을 보기 전에 먼저 답을 적어보세요">${escapeHtml(myAnswerDraft)}</textarea>
        </div>
      ` : ''}

      ${effectiveRevealed ? `
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
      const nowMatch = myAnswerDraft.trim().length > 0
        && myAnswerDraft.trim().replace(/\s+/g, '') === String(q.answer || '').trim().replace(/\s+/g, '');
      myAnswerInput.classList.toggle('match', nowMatch);
    });
  }

  const revealBtn = $('#revealBtn');
  if (revealBtn) revealBtn.addEventListener('click', () => { revealed = true; renderQuizCard(); });

  const gradeCorrect = $('#gradeCorrect');
  const gradeWrong = $('#gradeWrong');
  if (gradeCorrect) gradeCorrect.addEventListener('click', () => {
    quiz.submitResult(true, currentMode);
    graded = true;
    renderNavCounts();
    goNext();
  });
  if (gradeWrong) gradeWrong.addEventListener('click', () => {
    quiz.submitResult(false, currentMode);
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
  const selectedIndex = Number(q.selectedIndex ?? -1);
  const answerIndex = Number(q.answer || 0);
  const showResult = graded || revealed;
  const hasOptions = visibleOptions.length >= 4;
  window.__debug_render_variant = { hasOptions, optionCount: options.length, visibleOptions, answerIndex, selectedIndex, qOptions: q.options };

  el.quizCardWrap.innerHTML = `
    <div class="qcard">
      <div class="qcard-eyebrow">
        <span class="qcard-path">${qcardPathLabel(q)}${accuracy !== null ? ` · 누적 정답률 ${accuracy}%` : ''}</span>
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

      ${showResult ? `
        <div class="qcard-answer-wrap">
          <div class="qcard-answer-label">해설</div>
          <div class="qcard-answer-text">${escapeHtml(q.explanation || '')}</div>
        </div>
      ` : ''}

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
      q.selectedIndex = Number(btn.dataset.option || 0);
      renderQuizCard();
    });
  });

  const confirmBtn = $('#confirmBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const selected = Number(q.selectedIndex || 0);
      const answer = Number(q.answer || 0);
      const correct = selected === answer;
      quiz.submitResult(correct, currentMode);
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
  if (quiz.hasNext()) { quiz.next(); revealed = false; graded = false; myAnswerDraft = ''; renderQuizCard(); }
}
function goPrev() {
  if (quiz.hasPrev()) { quiz.prev(); revealed = false; graded = false; myAnswerDraft = ''; renderQuizCard(); }
}

function qcardPathLabel(q) {
  const roundPart = q.round ? `${escapeHtml(q.round)} · ` : '';
  return `${roundPart}${escapeHtml(q.subject || '')} › ${escapeHtml(q.subSubject || '')}`;
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
      if (el.wrongScopeTree) {
        el.wrongScopeTree.style.display = 'block';
      }
      beginLearning(getWrongIds(), { scope: '__wrong__', breadcrumb: '오답노트' });
      navigate('quiz');
      renderQuizCard();
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
    revealed = false; graded = false;
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
  if (quiz) { revealed = false; graded = false; renderQuizCard(); }
  renderStats();
});

// ---------------------------------------------------------------------------
// 초기화
// ---------------------------------------------------------------------------
(async function init() {
  const basicSettings = storage.getSettings('basic');
  const examSettings = storage.getSettings('exam');
  applyTheme(!!basicSettings.darkMode || !!examSettings.darkMode);
  applyFont(basicSettings.font || examSettings.font || 'default');
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
