// ui/settingsView.js
// 설정 화면 이벤트 (테마/글꼴/시트 연결/동기화/CSV/초기화).

import { state, storage } from '../state.js';
import { $, applyFont, applyTheme, el, toast } from './dom.js';
import { loadCSVFile, loadExamFromSheet, loadFromSheet, loadSample } from '../dataLoading.js';
import { renderNavCounts } from './sidebarView.js';
import { renderQuizCard, resetCardState } from './quizView.js';
import { renderStats } from './statsView.js';
import { navigate } from '../app.js';

el.darkToggle.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme !== 'dark';
  storage.setSettings({ darkMode: next }, state.currentMode === 'exam' ? 'exam' : 'basic');
  storage.setSettings({ darkMode: next }, 'exam');
  applyTheme(next);
});

el.darkToggleSettings.addEventListener('change', (e) => {
  storage.setSettings({ darkMode: e.target.checked }, state.currentMode === 'exam' ? 'exam' : 'basic');
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
  const data = await storage.pullFromCloud(state.currentMode);
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
  if (state.quiz) { resetCardState(); renderQuizCard(); }
  renderStats();
});
