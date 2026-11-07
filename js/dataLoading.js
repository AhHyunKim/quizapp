// dataLoading.js
// 문제 데이터 불러오기(Google Sheets/샘플/CSV 파일)와 불러온 뒤 화면 초기 구성.

import { state, storage, dataLoader, menuBuilder } from './state.js';
import QuizEngine from './quizEngine.js';
import StatsManager from './statsManager.js';
import { el, setSyncStatus, toast } from './ui/dom.js';
import { buildRoundMenu, convertExamRow, normalizeQuestions, parseOptionList } from './questionNormalizer.js';
import { renderNavCounts, renderRoundTree, renderSubjectTree } from './ui/sidebarView.js';
import { renderQuizCard, startSession } from './ui/quizView.js';
import { resumeMockIfAny } from './ui/mockView.js';
import { navigate } from './app.js';

export async function applyLoadedQuestions(list, sourceLabel, mode = state.currentMode) {
  const normalized = normalizeQuestions(list);
  state.questions = normalized;
  state.byId = new Map(state.questions.map((q) => [q.id, q]));
  state.menu = menuBuilder.build(state.questions);
  state.examRoundMenu = mode === 'exam' ? buildRoundMenu(state.questions) : [];
  state.quiz = new QuizEngine(state.byId, storage);
  state.stats = new StatsManager(storage, state.byId, mode);

  renderSubjectTree();
  renderRoundTree();
  renderNavCounts();
  setSyncStatus('ok');
  toast(`${sourceLabel} · 문제 ${state.questions.length}개 로딩 완료`, 'ok');
  window.__debug_app_state = { mode, questionCount: state.questions.length, currentMode: state.currentMode, questions: state.questions };

  if (storage.getSyncUrl(mode)) {
    await storage.pullFromCloud(mode);
    renderNavCounts();
  }

  const last = storage.getLastPosition(mode);
  if (last && state.byId.has(last.id)) {
    startSession(state.questions.map((q) => q.id), { scope: '__all__', breadcrumb: '전체' });
    const idx = state.quiz.queue.indexOf(last.id);
    if (idx >= 0) state.quiz.index = idx;
    navigate('quiz');
    renderQuizCard();
  } else {
    startSession(state.questions.map((q) => q.id), { scope: '__all__', breadcrumb: '전체' });
    navigate('quiz');
    renderQuizCard();
  }

  // 모의고사 도중 새로고침했다면 이어서 진행
  if (mode === 'exam') resumeMockIfAny();
}

export async function loadFromSheet(url) {
  state.currentMode = 'basic';
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

export async function loadExamFromSheet(url) {
  state.currentMode = 'exam';
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

export async function loadSample() {
  try {
    const list = await dataLoader.loadFromCSVUrl('data/sample.csv');
    await applyLoadedQuestions(list, '샘플 데이터', state.currentMode);
  } catch (err) {
    console.error(err);
    toast('샘플 데이터를 불러오지 못했습니다 (로컬 서버로 실행 중인지 확인해 주세요).', 'err');
  }
}

export async function loadExamSample() {
  state.currentMode = 'exam';
  state.currentModeLabel = '기출문제';
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

export async function loadCSVFile(file) {
  try {
    const list = await dataLoader.loadFromCSVFile(file);
    await applyLoadedQuestions(list, file.name, state.currentMode);
  } catch (err) {
    console.error(err);
    toast('CSV 파일을 읽지 못했습니다.', 'err');
  }
}
