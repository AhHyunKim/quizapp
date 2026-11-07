// ui/quizView.js
// 퀴즈 화면: 카드 렌더링(주관식/객관식), 세션 시작, 이동, 키보드 단축키, 스와이프.

import { state, storage } from '../state.js';
import { icon } from './icons.js';
import { $, el, escapeHtml, sanitizeHtml, toast } from './dom.js';
import { renderNavCounts } from './sidebarView.js';
import { renderStats } from './statsView.js';
import { navigate } from '../app.js';

/** 문제를 불러오는 동안 카드 자리에 보여줄 스켈레톤 */
export function showCardSkeleton() {
  el.quizCardWrap.innerHTML = `
    <div class="qcard qcard-skeleton" aria-busy="true" aria-label="문제를 불러오는 중">
      <div class="sk-line sk-short"></div>
      <div class="sk-line sk-tall"></div>
      <div class="sk-line"></div>
      <div class="sk-box"></div>
    </div>`;
}

/** 불러오기에 실패했을 때 카드 자리에 원인과 다음 행동을 보여준다. */
export function showLoadError(message) {
  el.quizCardWrap.innerHTML = `
    <div class="qcard qcard-empty">
      <p class="load-error-title">문제를 불러오지 못했습니다</p>
      <p class="load-error-msg">${escapeHtml(message || '알 수 없는 오류입니다.')}</p>
      <button id="loadErrorSettings" class="btn btn-primary" type="button">설정에서 연결 확인</button>
    </div>`;
  $('#loadErrorSettings').addEventListener('click', () => navigate('settings'));
}

/** 채점 결과 후처리: 오답노트 졸업 시 토스트 */
export function notifyGraduation(result) {
  if (result && result.graduated) toast('🎓 오답노트 졸업!', 'ok');
}

// ---------------------------------------------------------------------------
// 퀴즈(문제풀이)
// ---------------------------------------------------------------------------
/** 카드 화면 상태(정답 공개/채점/입력/선택)를 초기화한다. */
export function resetCardState() {
  state.revealed = false;
  state.graded = false;
  state.myAnswerDraft = '';
  state.selectedOption = 0;
}

export function startSession(ids, { scope, breadcrumb }) {
  if (!state.quiz) return;
  state.quiz.start(ids, { shuffle: el.shuffleToggle.checked, scope });
  el.quizBreadcrumb.textContent = `${breadcrumb} (${ids.length}문제)`;
  resetCardState();
}

export function beginLearning(ids, { scope, breadcrumb }) {
  startSession(ids, { scope, breadcrumb });
  navigate('quiz');
  renderQuizCard();
}

/** 사이드바 필터와 무관하게, 입력한 문제 ID로 바로 이동한다. */
export function goToQuestionId(rawId) {
  const id = String(rawId || '').trim();
  if (!id) { toast('문제 ID를 입력해 주세요.', 'err'); return; }
  if (!state.byId.has(id)) { toast(`ID "${id}" 문제를 찾을 수 없습니다.`, 'err'); return; }
  if (!state.quiz) return;

  let idx = state.quiz.queue.indexOf(id);
  if (idx < 0) {
    // 현재 필터(과목/오답노트 등)에 없는 문제면 전체 목록으로 전환해서 찾는다.
    startSession(state.questions.map((q) => q.id), { scope: '__all__', breadcrumb: '전체' });
    idx = state.quiz.queue.indexOf(id);
  }
  if (idx < 0) return;

  state.quiz.index = idx;
  resetCardState();
  navigate('quiz');
  renderQuizCard();
}

export function updateProgress() {
  const p = state.quiz.progress();
  const pct = p.total ? Math.round((p.index / p.total) * 100) : 0;
  el.quizProgressBar.style.width = `${pct}%`;
  el.quizProgressLabel.textContent = `${p.total ? p.index : 0} / ${p.total}`;
  el.prevBtn.disabled = !state.quiz.hasPrev();
  el.nextBtn.disabled = !state.quiz.hasNext();
}

/** 내 답과 정답이 일치하는지 (공백 제거 후 비교, 정답이 HTML이면 태그 제거) */
export function isAnswerMatch(draft, answer) {
  const norm = (v) => String(v || '').replace(/<[^>]*>/g, '').replace(/\s+/g, '');
  const d = norm(draft);
  return d.length > 0 && d === norm(answer);
}

/** 해설 블록 (해설 컬럼이 없거나 비어 있으면 표시하지 않는다) */
export function explanationBlock(q) {
  if (!q.explanation) return '';
  return `
        <div class="qcard-answer-wrap qcard-explain-wrap">
          <div class="qcard-answer-label">해설</div>
          <div class="qcard-answer-text">${sanitizeHtml(q.explanation)}</div>
        </div>`;
}

/** 난이도 배지 (난이도 컬럼이 없거나 비어 있으면 표시하지 않는다) */
export function difficultyBadge(q) {
  if (!q.difficulty) return '';
  return `<span class="qcard-difficulty">${escapeHtml(q.difficulty)}</span>`;
}

export function renderShortAnswerQuiz(q, qs, accuracy, isBookmarked, isFavorite) {
  const studyMode = el.studyModeToggle.checked;
  const effectiveRevealed = state.revealed || studyMode;
  const showAnswerInput = !studyMode;
  const isMatch = isAnswerMatch(state.myAnswerDraft, q.answer);

  el.quizCardWrap.innerHTML = `
    <div class="qcard">
      <div class="qcard-eyebrow">
        <span class="qcard-path">${qcardPathLabel(q)}${accuracy !== null ? ` · 누적 정답률 ${accuracy}%` : ''}</span>
        ${difficultyBadge(q)}
        <span class="qcard-tools">
          <button class="qcard-icon-btn bookmark ${isBookmarked ? 'on' : ''}" id="bookmarkBtn" title="북마크">${icon('bookmark', 22)}</button>
          <button class="qcard-icon-btn favorite ${isFavorite ? 'on' : ''}" id="favoriteBtn" title="즐겨찾기">${icon('star', 22)}</button>
        </span>
      </div>
      <div class="qcard-question">${escapeHtml(q.question || '')}</div>

      ${showAnswerInput ? `
        <div class="qcard-input-wrap">
          <div class="qcard-answer-label">내 답 적어보기</div>
          <textarea id="myAnswerInput" class="qcard-input ${isMatch ? 'match' : ''}" rows="2" ${effectiveRevealed ? 'readonly' : ''} placeholder="정답을 보기 전에 먼저 답을 적어보세요">${escapeHtml(state.myAnswerDraft)}</textarea>
        </div>
      ` : ''}

      ${effectiveRevealed ? `
        <div class="qcard-answer-wrap">
          <div class="qcard-answer-label">정답${isMatch ? ` <span class="qcard-match-tag">${icon('check', 14)}내 답과 일치</span>` : ''}</div>
          <div class="qcard-answer-text">${sanitizeHtml(q.answer || '')}</div>
        </div>
        ${explanationBlock(q)}
        ${!state.graded ? `
          <div class="grade-actions">
            <button class="grade-btn correct" id="gradeCorrect">맞았어요</button>
            <button class="grade-btn wrong" id="gradeWrong">틀렸어요</button>
          </div>
        ` : `
          <div class="qcard-actions">
            <span class="qcard-graded-tag ${qs.lastResult ? 'correct' : 'wrong'}">${qs.lastResult ? `${icon('check', 16)}맞음으로 기록됨` : `${icon('x', 16)}오답으로 기록됨`}</span>
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
    storage.toggleBookmark(q.id, state.currentMode);
    renderNavCounts();
    renderQuizCard();
  });
  $('#favoriteBtn').addEventListener('click', () => {
    storage.toggleFavorite(q.id, state.currentMode);
    renderNavCounts();
    renderQuizCard();
  });

  const myAnswerInput = $('#myAnswerInput');
  if (myAnswerInput) {
    myAnswerInput.addEventListener('input', (e) => {
      state.myAnswerDraft = e.target.value;
      myAnswerInput.classList.toggle('match', isAnswerMatch(state.myAnswerDraft, q.answer));
    });
  }

  const revealBtn = $('#revealBtn');
  if (revealBtn) revealBtn.addEventListener('click', () => { state.revealed = true; renderQuizCard(); });

  const gradeCorrect = $('#gradeCorrect');
  const gradeWrong = $('#gradeWrong');
  if (gradeCorrect) gradeCorrect.addEventListener('click', () => {
    notifyGraduation(state.quiz.submitResult(true, state.currentMode));
    state.graded = true;
    renderNavCounts();
    goNext('correct');
  });
  if (gradeWrong) gradeWrong.addEventListener('click', () => {
    notifyGraduation(state.quiz.submitResult(false, state.currentMode));
    state.graded = true;
    renderNavCounts();
    goNext('wrong');
  });
}

export function renderMultipleChoiceQuiz(q, qs, accuracy, isBookmarked, isFavorite) {
  const options = Array.isArray(q.options)
    ? q.options.filter((opt) => opt !== undefined && opt !== null && opt !== '').map((opt) => String(opt).trim())
    : [];
  const visibleOptions = options.slice(0, 4);
  const selectedIndex = state.selectedOption || -1;
  const answerIndex = Number(q.answer || 0);
  const showResult = state.graded || state.revealed;
  const hasOptions = visibleOptions.length >= 4;
  window.__debug_render_variant = { hasOptions, optionCount: options.length, visibleOptions, answerIndex, selectedIndex, qOptions: q.options };

  el.quizCardWrap.innerHTML = `
    <div class="qcard">
      <div class="qcard-eyebrow">
        <span class="qcard-path">${qcardPathLabel(q)}${accuracy !== null ? ` · 누적 정답률 ${accuracy}%` : ''}</span>
        ${difficultyBadge(q)}
        <span class="qcard-tools">
          <button class="qcard-icon-btn bookmark ${isBookmarked ? 'on' : ''}" id="bookmarkBtn" title="북마크">${icon('bookmark', 22)}</button>
          <button class="qcard-icon-btn favorite ${isFavorite ? 'on' : ''}" id="favoriteBtn" title="즐겨찾기">${icon('star', 22)}</button>
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
    storage.toggleBookmark(q.id, state.currentMode);
    renderNavCounts();
    renderQuizCard();
  });
  $('#favoriteBtn').addEventListener('click', () => {
    storage.toggleFavorite(q.id, state.currentMode);
    renderNavCounts();
    renderQuizCard();
  });

  document.querySelectorAll('.option-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (showResult) return;
      state.selectedOption = Number(btn.dataset.option || 0);
      renderQuizCard();
    });
  });

  const confirmBtn = $('#confirmBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
      const selected = state.selectedOption;
      const answer = Number(q.answer || 0);
      const correct = selected === answer;
      notifyGraduation(state.quiz.submitResult(correct, state.currentMode));
      state.revealed = true;
      state.graded = true;
      renderNavCounts();
      renderQuizCard();
    });
  }
}

export function renderQuizCard() {
  if (!state.quiz) return;
  updateProgress();
  const q = state.quiz.current();

  if (!q) {
    el.quizCardWrap.innerHTML = `<div class="qcard qcard-empty">이 목록에는 표시할 문제가 없습니다.<br/>다른 메뉴를 선택해 보세요.</div>`;
    return;
  }

  const isBookmarked = storage.isBookmarked(q.id, state.currentMode);
  const isFavorite = storage.isFavorite(q.id, state.currentMode);
  const qs = storage.getQuestionStats(q.id, state.currentMode);
  const accuracy = qs.attempts ? Math.round((qs.correct / qs.attempts) * 100) : null;
  const hasMultipleChoiceOptions = Array.isArray(q.options) && q.options.filter((opt) => opt !== undefined && opt !== null && opt !== '').length >= 4;
  const isExamMode = state.currentMode === 'exam' && hasMultipleChoiceOptions;

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

/** 새 카드가 나타날 때 짧은 전환 효과를 준다 (feedback: 직전 채점 결과 'correct' | 'wrong'). */
function playCardEnter(feedback) {
  const card = $('.qcard');
  if (!card) return;
  card.classList.add('enter');
  if (feedback === 'correct' || feedback === 'wrong') card.classList.add(`feedback-${feedback}`);
}

export function goNext(feedback) {
  if (state.quiz.hasNext()) { state.quiz.next(); resetCardState(); renderQuizCard(); playCardEnter(feedback); }
}

export function goPrev() {
  if (state.quiz.hasPrev()) { state.quiz.prev(); resetCardState(); renderQuizCard(); playCardEnter(); }
}

export function qcardPathLabel(q) {
  const roundPart = q.round ? `${escapeHtml(q.round)} · ` : '';
  return `${roundPart}${escapeHtml(q.subject || '')} › ${escapeHtml(q.subSubject || '')}`;
}

el.prevBtn.addEventListener('click', goPrev);

el.nextBtn.addEventListener('click', goNext);

el.studyModeToggle.addEventListener('change', () => {
  if (state.quiz) renderQuizCard();
});

el.shuffleToggle.addEventListener('change', () => {
  if (state.quiz && state.quiz.queue.length) {
    const currentId = state.quiz.current() ? state.quiz.current().id : null;
    state.quiz.start(state.quiz.queue, { shuffle: el.shuffleToggle.checked, scope: state.quiz.scope });
    if (currentId) {
      const idx = state.quiz.queue.indexOf(currentId);
      if (idx >= 0) state.quiz.index = idx;
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
  const result = state.quiz ? state.quiz.finishRound(state.currentMode) : null;
  if (!result) { toast('이번 회독에서 풀이한 문제가 없습니다.'); return; }
  toast(`회독 마감 · ${result.correct} / ${result.total} 정답`, 'ok');
  renderStats();
});

// ---------------------------------------------------------------------------
// 키보드 단축키 (해당 버튼의 click()을 호출해 로직을 중복하지 않는다)
// ---------------------------------------------------------------------------
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (!$('#view-quiz').classList.contains('active') || !state.quiz) return;

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
    handled = clickIf('#revealBtn') || (state.selectedOption > 0 && clickIf('#confirmBtn'));
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

// 옵션 패널은 바깥을 누르면 닫는다.
document.addEventListener('click', (e) => {
  const panel = $('.quiz-options');
  if (panel && panel.open && !panel.contains(e.target)) panel.open = false;
});
