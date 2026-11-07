// ui/dom.js
// DOM 헬퍼: $ 선택자, 요소 맵(el), 토스트, 테마/글꼴 적용, HTML escape/sanitize.

export const $ = (sel) => document.querySelector(sel);

export const el = {
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
export function toast(msg, kind = 'info') {
  el.toast.textContent = msg;
  el.toast.className = `toast show ${kind}`;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.toast.className = 'toast'; }, 2600);
}

export function setSyncStatus(state) {
  el.syncStatus.className = `sync-status ${state}`;
  el.syncStatus.title = state === 'ok' ? '데이터 연결됨' : state === 'err' ? '데이터 로딩 실패' : '데이터 없음';
}

export function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  el.darkToggle.textContent = dark ? '☀️' : '🌙';
  el.darkToggleSettings.checked = dark;
}

export function applyFont(font) {
  const value = font || 'default';
  document.documentElement.dataset.font = value;
  el.fontSelect.value = value;
}

export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 정답처럼 HTML 그대로 출력하는 값을 정화한다 (표/수식/br 등은 유지, 스크립트는 제거). */
export function sanitizeHtml(html) {
  const value = String(html ?? '');
  if (window.DOMPurify) return window.DOMPurify.sanitize(value);
  return escapeHtml(value);
}
