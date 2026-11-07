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

// ---------------------------------------------------------------------------
// 학습기록 백업 / 복원
// ---------------------------------------------------------------------------
function setBackupStatus(message, kind = '') {
  el.backupStatus.textContent = message;
  el.backupStatus.className = `settings-status ${kind}`.trim();
}

el.exportBackupBtn.addEventListener('click', () => {
  const backup = storage.exportAll();
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quiz-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  setBackupStatus(`내보냈습니다 · 저장된 항목 ${Object.keys(backup.data).length}개`, 'ok');
});

el.importBackupBtn.addEventListener('click', () => el.importBackupInput.click());

el.importBackupInput.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = ''; // 같은 파일을 다시 선택해도 change가 발생하도록
  if (!file) return;

  let backup;
  try {
    backup = JSON.parse(await file.text());
  } catch (err) {
    setBackupStatus('JSON 파일을 읽지 못했습니다. 내보내기로 저장한 파일인지 확인해 주세요.', 'err');
    return;
  }
  const problem = storage.validateBackup(backup);
  if (problem) { setBackupStatus(problem, 'err'); return; }

  if (!confirm('현재 학습기록을 덮어씁니다. 계속할까요?')) return;
  const count = storage.importAll(backup);

  // 화면 갱신: 설정(테마/글꼴/졸업 기준), 카운트, 통계, 현재 카드
  const settings = storage.getSettings(state.currentMode === 'exam' ? 'exam' : 'basic');
  applyTheme(!!settings.darkMode);
  applyFont(settings.font || 'default');
  el.graduateStreakInput.value = storage.getGraduateStreak(state.currentMode === 'exam' ? 'exam' : 'basic');
  renderNavCounts();
  renderStats();
  if (state.quiz) { resetCardState(); renderQuizCard(); }
  setBackupStatus(`가져왔습니다 · ${count}개 항목 (${backup.exportedAt ? backup.exportedAt.slice(0, 10) : '날짜 없음'} 백업)`, 'ok');
  toast('학습기록을 가져왔습니다.', 'ok');
});
