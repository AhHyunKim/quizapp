// ui/sidebarView.js
// 사이드바: 과목/회차/오답 범위 트리, 메뉴 카운트, 메뉴 클릭 이벤트.

import { state, storage } from '../state.js';
import { getDueIds } from '../reviewScheduler.js';
import { icon } from './icons.js';
import { el, escapeHtml } from './dom.js';
import { beginLearning, renderQuizCard } from './quizView.js';
import { startMock } from './mockView.js';
import { navigate } from '../app.js';

// ---------------------------------------------------------------------------
// 사이드바 (메뉴 트리는 Google Sheets 의 과목/소과목 컬럼으로부터 매번 재생성)
// ---------------------------------------------------------------------------
/** 접었다 펼 수 있는 토글 버튼 (쉐브론 아이콘, aria-expanded로 상태 전달) */
function makeToggle(label, list) {
  const toggle = document.createElement('button');
  toggle.className = 'subject-toggle';
  toggle.type = 'button';
  toggle.innerHTML = icon('chevron', 18);
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    list.style.display = open ? 'block' : 'none';
  });
  return toggle;
}

export function renderSubjectTree() {
  el.subjectTree.innerHTML = '';

  // 전체 풀기: 토글 없이 한 줄
  const allLi = document.createElement('li');
  const allBtn = document.createElement('button');
  allBtn.className = 'nav-item nav-all';
  allBtn.innerHTML = `${icon('book')}전체 <span class="nav-count">${state.questions.length}</span>`;
  allBtn.addEventListener('click', () => {
    beginLearning(state.questions.map((q) => q.id), { scope: '__all__', breadcrumb: '전체' });
  });
  allLi.appendChild(allBtn);
  el.subjectTree.appendChild(allLi);

  // 과목은 항상 보이고, 소과목만 눌러서 펼친다.
  state.menu.forEach((subjectNode) => {
    const li = document.createElement('li');
    li.className = 'subject-node';

    const row = document.createElement('div');
    row.className = 'subject-row';

    const header = document.createElement('button');
    header.className = 'nav-item';
    header.innerHTML = `<span class="nav-text">${escapeHtml(subjectNode.name)}</span><span class="nav-count">${subjectNode.count}</span>`;
    header.addEventListener('click', () => {
      beginLearning(subjectNode.ids, { scope: subjectNode.name, breadcrumb: subjectNode.name });
    });

    const subList = document.createElement('ul');
    subList.className = 'subsubject-list';
    subList.style.display = 'none';

    subjectNode.children.forEach((subNode) => {
      const subLi = document.createElement('li');
      const subBtn = document.createElement('button');
      subBtn.className = 'nav-item';
      subBtn.innerHTML = `<span class="nav-text">${escapeHtml(subNode.name)}</span><span class="nav-count">${subNode.count}</span>`;
      subBtn.addEventListener('click', () => {
        beginLearning(subNode.ids, { scope: subjectNode.name, breadcrumb: `${subjectNode.name} › ${subNode.name}` });
      });
      subLi.appendChild(subBtn);
      subList.appendChild(subLi);
    });

    row.appendChild(header);
    if (subjectNode.children.length) row.appendChild(makeToggle(`${subjectNode.name} 소과목 펼치기`, subList));
    li.appendChild(row);
    li.appendChild(subList);
    el.subjectTree.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// 회차별 목록 (기출문제 모드 전용 — "회차" 컬럼 기준)
// ---------------------------------------------------------------------------
export function renderRoundTree() {
  if (!el.roundNavSection || !el.roundTree) return;

  const showRoundNav = state.currentMode === 'exam' && state.examRoundMenu.length > 0;
  el.roundNavSection.style.display = showRoundNav ? '' : 'none';
  if (!showRoundNav) {
    el.roundTree.innerHTML = '';
    return;
  }

  el.roundTree.innerHTML = '';
  state.examRoundMenu.forEach((roundNode) => {
    const li = document.createElement('li');
    li.className = 'round-row';
    const btn = document.createElement('button');
    btn.className = 'nav-item';
    btn.innerHTML = `<span class="nav-text">${escapeHtml(roundNode.name)}</span><span class="nav-count">${roundNode.count}</span>`;
    btn.addEventListener('click', () => {
      beginLearning(roundNode.ids, { scope: `round:${roundNode.name}`, breadcrumb: roundNode.name });
    });
    const mockBtn = document.createElement('button');
    mockBtn.className = 'icon-btn round-mock-btn';
    mockBtn.type = 'button';
    mockBtn.title = '모의고사로 풀기';
    mockBtn.setAttribute('aria-label', `${roundNode.name} 모의고사로 풀기`);
    mockBtn.innerHTML = icon('pencil', 18);
    mockBtn.addEventListener('click', () => startMock(roundNode));
    li.appendChild(btn);
    li.appendChild(mockBtn);
    el.roundTree.appendChild(li);
  });
}

export function getWrongIds() {
  return storage.getWrongList(state.currentMode).filter((id) => state.byId.has(id));
}

export function renderWrongScopeMenu() {
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

  state.menu.forEach((subjectNode) => {
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
export function getReviewIds() {
  return getDueIds(storage.getAllQuestionStats(state.currentMode), Date.now()).filter((id) => state.byId.has(id));
}

export function renderNavCounts() {
  const reviewCount = getReviewIds().length;
  const wrongCount = storage.getWrongList(state.currentMode).length;
  el.countReview.textContent = reviewCount;
  el.countWrong.textContent = wrongCount;
  // 오늘 할 것이 남아 있으면 배지를 강조한다.
  el.countReview.classList.toggle('has', reviewCount > 0);
  el.countWrong.classList.toggle('has', wrongCount > 0);
  el.countBookmark.textContent = storage.getBookmarks(state.currentMode).length;
  el.countFavorite.textContent = storage.getFavorites(state.currentMode).length;
  renderWrongScopeMenu();
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
      beginLearning(storage.getBookmarks(state.currentMode), { scope: '__bookmark__', breadcrumb: '북마크' });
    } else if (view === 'favorite') {
      beginLearning(storage.getFavorites(state.currentMode), { scope: '__favorite__', breadcrumb: '즐겨찾기' });
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
