// ui/mockView.js
// 기출 모의고사: 회차를 즉시 채점 없이 풀고 일괄 제출.

import { state } from '../state.js';
import { icon } from './icons.js';
import { $, escapeHtml, toast } from './dom.js';
import { renderNavCounts } from './sidebarView.js';
import { beginLearning, explanationBlock, notifyGraduation, qcardPathLabel, startSession } from './quizView.js';
import { navigate } from '../app.js';

// ---------------------------------------------------------------------------
// 모의고사 (기출문제 회차를 즉시 채점 없이 끝까지 풀고 일괄 제출)
// 진행 중 상태는 새로고침 대비로 sessionStorage에만 임시 저장한다 (학습기록 키와 무관).
// ---------------------------------------------------------------------------
const MOCK_KEY = 'qa_mock_session';

let mock = null; // { round, ids, answers: { [id]: 보기번호 }, startedAt, result? }

let mockTimer = null;

export function saveMock() {
  try {
    if (mock && !mock.result) sessionStorage.setItem(MOCK_KEY, JSON.stringify(mock));
    else sessionStorage.removeItem(MOCK_KEY);
  } catch (e) { /* 저장 불가 환경이면 새로고침 복구만 포기 */ }
}

export function stopMockTimer() {
  if (mockTimer) { clearInterval(mockTimer); mockTimer = null; }
}

export function formatElapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/** 객관식 보기 목록 (renderMultipleChoiceQuiz와 같은 기준: 앞 4개) */
export function getMockOptions(q) {
  return Array.isArray(q.options)
    ? q.options.filter((opt) => opt !== undefined && opt !== null && opt !== '').map((opt) => String(opt).trim()).slice(0, 4)
    : [];
}

export function startMock(roundNode) {
  const list = roundNode.ids.filter((id) => state.byId.has(id) && getMockOptions(state.byId.get(id)).length >= 4);
  if (!list.length) { toast('이 회차에는 모의고사로 풀 수 있는 객관식 문제가 없습니다.', 'err'); return; }
  mock = { round: roundNode.name, ids: list, answers: {}, startedAt: Date.now() };
  saveMock();
  renderMock();
}

export function resumeMockIfAny() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(MOCK_KEY) || 'null');
    if (!saved || !Array.isArray(saved.ids)) return;
    const ids = saved.ids.filter((id) => state.byId.has(id));
    if (!ids.length) return;
    mock = { ...saved, ids };
    renderMock();
    toast('진행 중이던 모의고사를 이어서 표시합니다.');
  } catch (e) { /* 손상된 임시 데이터는 무시 */ }
}

export function updateMockHeader() {
  const timerEl = $('#mockTimer');
  const countEl = $('#mockAnswered');
  if (timerEl) timerEl.textContent = formatElapsed(Date.now() - mock.startedAt);
  if (countEl) countEl.textContent = `${Object.keys(mock.answers).length} / ${mock.ids.length}`;
}

export function renderMock() {
  if (!mock) return;
  navigate('mock');
  if (mock.result) { renderMockResult(); return; }

  const body = $('#mockBody');
  body.innerHTML = `
    <div class="mock-header">
      <div>
        <div class="mock-title">${icon('pencil', 20)}모의고사 · ${escapeHtml(mock.round)}</div>
        <div class="mock-meta">경과 <span id="mockTimer" class="mock-timer">00:00:00</span> · 답 <span id="mockAnswered"></span></div>
      </div>
      <div class="mock-header-actions">
        <button id="mockCancelBtn" class="btn btn-ghost btn-sm" type="button">그만두기</button>
        <button id="mockSubmitBtn" class="btn btn-primary" type="button">제출하기</button>
      </div>
    </div>
    ${mock.ids.map((id, i) => {
      const q = state.byId.get(id);
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
    beginLearning(state.questions.map((q) => q.id), { scope: '__all__', breadcrumb: '전체' });
  });

  updateMockHeader();
  stopMockTimer();
  mockTimer = setInterval(updateMockHeader, 1000);
  window.scrollTo(0, 0);
}

export function submitMock() {
  const unanswered = mock.ids.length - Object.keys(mock.answers).length;
  const msg = unanswered
    ? `아직 답하지 않은 문제가 ${unanswered}개 있습니다 (오답 처리됩니다). 제출할까요?`
    : '제출할까요?';
  if (!confirm(msg)) return;

  // 기존 채점 경로(state.quiz.submitResult)로 문제별 기록과 회독 점수를 저장한다.
  startSession(mock.ids, { scope: `round:${mock.round}`, breadcrumb: `${mock.round} 모의고사` });
  const items = mock.ids.map((id, i) => {
    const q = state.byId.get(id);
    const mine = mock.answers[id] || 0;
    const correct = mine === Number(q.answer || 0);
    state.quiz.index = i;
    notifyGraduation(state.quiz.submitResult(correct, state.currentMode));
    return { id, mine, correct };
  });
  state.quiz.finishRound(state.currentMode);

  mock.result = { items, elapsedMs: Date.now() - mock.startedAt };
  saveMock(); // result가 있으므로 임시 저장은 삭제된다
  stopMockTimer();
  renderNavCounts();
  renderMockResult();
}

export function renderMockResult() {
  const { items, elapsedMs } = mock.result;
  const correctCount = items.filter((it) => it.correct).length;
  const pct = items.length ? Math.round((correctCount / items.length) * 100) : 0;

  const bySubject = new Map();
  items.forEach((it) => {
    const subject = state.byId.get(it.id).subject || '(과목 없음)';
    const row = bySubject.get(subject) || { correct: 0, total: 0 };
    row.total += 1;
    if (it.correct) row.correct += 1;
    bySubject.set(subject, row);
  });

  const wrongItems = items.filter((it) => !it.correct);
  $('#mockBody').innerHTML = `
    <div class="mock-header">
      <div>
        <div class="mock-title">${icon('pencil', 20)}모의고사 결과 · ${escapeHtml(mock.round)}</div>
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
      const q = state.byId.get(it.id);
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
    beginLearning(state.questions.map((q) => q.id), { scope: '__all__', breadcrumb: '전체' });
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
