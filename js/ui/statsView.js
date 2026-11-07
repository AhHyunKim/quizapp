// ui/statsView.js
// 통계 화면.

import { state } from '../state.js';
import { el, escapeHtml } from './dom.js';

// ---------------------------------------------------------------------------
// 통계
// ---------------------------------------------------------------------------
export function renderStats() {
  if (!state.stats) return;
  const o = state.stats.overview();
  el.overviewGrid.innerHTML = `
    ${statTile(o.attempts, '총 풀이 횟수')}
    ${statTile(`${o.accuracy}%`, '전체 정답률')}
    ${statTile(`${o.studiedQuestions} / ${o.totalQuestions}`, '학습한 문제 수')}
    ${statTile(o.wrongCount, '오답노트')}
    ${statTile(o.bookmarkCount, '북마크')}
    ${statTile(o.favoriteCount, '즐겨찾기')}
  `;

  const bySubject = state.stats.bySubject();
  el.subjectStatsTable.innerHTML = bySubject.length ? bySubject.map((s) => `
    <div class="subject-stat-row">
      <div class="subject-stat-top">
        <span class="subject-stat-name">${escapeHtml(s.subject)}</span>
        <span class="subject-stat-meta">${s.correct}/${s.attempts} · ${s.accuracy}%</span>
      </div>
      <div class="subject-stat-bar-track"><div class="subject-stat-bar-fill" style="width:${s.accuracy}%"></div></div>
    </div>
  `).join('') : `<p class="empty-note">아직 풀이 기록이 없습니다.</p>`;

  const scopes = ['__all__', ...state.menu.map((m) => m.name)];
  el.roundScopeSelect.innerHTML = scopes.map((s) => `<option value="${escapeHtml(s)}">${s === '__all__' ? '전체' : escapeHtml(s)}</option>`).join('');
  renderRoundTable(el.roundScopeSelect.value || '__all__');
}

export function renderRoundTable(scope) {
  const rounds = state.stats.rounds(scope);
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

el.roundScopeSelect.addEventListener('change', (e) => renderRoundTable(e.target.value));
