// app.js
// 진입점: 화면 전환(navigate), 모드 전환, 초기화.
// 각 화면 모듈(js/ui/*)은 import 되는 시점에 자신의 이벤트를 바인딩한다.

import { state, storage } from './state.js';
import { $, applyFont, applyTheme, el, setSyncStatus } from './ui/dom.js';
import { loadExamFromSheet, loadExamSample, loadFromSheet, loadSample } from './dataLoading.js';
import { renderNavCounts, renderRoundTree } from './ui/sidebarView.js';
import { renderStats } from './ui/statsView.js';
import { stopMockTimer } from './ui/mockView.js';
import { showCardSkeleton } from './ui/quizView.js';
import './ui/settingsView.js';

// ---------------------------------------------------------------------------
// 화면 전환
// ---------------------------------------------------------------------------
export function navigate(view) {
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

el.modeBasicBtn.addEventListener('click', async () => {
  state.currentMode = 'basic';
  state.currentModeLabel = '빈출문제';
  el.modeBasicBtn.classList.add('active');
  el.modeExamBtn.classList.remove('active');
  state.examRoundMenu = [];
  renderRoundTree();
  const settings = storage.getSettings('basic');
  if (settings.sheetUrl) {
    await loadFromSheet(settings.sheetUrl);
  } else {
    await loadSample();
  }
});

el.modeExamBtn.addEventListener('click', async () => {
  state.currentMode = 'exam';
  state.currentModeLabel = '기출문제';
  el.modeExamBtn.classList.add('active');
  el.modeBasicBtn.classList.remove('active');
  const settings = storage.getSettings('exam');
  if (settings.examSheetUrl) {
    await loadExamFromSheet(settings.examSheetUrl);
  } else {
    await loadExamSample();
  }
});

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
    navigate('quiz');
    showCardSkeleton();
    await loadFromSheet(basicSettings.sheetUrl);
  } else {
    navigate('empty');
  }
})();

// 서비스워커 등록 (localhost 또는 HTTPS에서만) — 한 번 접속하면 오프라인에서도 학습할 수 있다.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('[sw] 등록 실패', err));
  });
}
