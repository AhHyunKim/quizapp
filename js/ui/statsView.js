// ui/statsView.js
// 통계 화면.

import { state } from '../state.js';
import { el, escapeHtml } from './dom.js';

// ---------------------------------------------------------------------------
// 통계
// ---------------------------------------------------------------------------
function statTile(value, label) {
  return `<div class="stat-tile"><div class="num">${escapeHtml(value)}</div><div class="label">${escapeHtml(label)}</div></div>`;
}

const pad2 = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** 최근 12주 일별 풀이 수 히트맵 (열 = 주, 행 = 일~토) */
function renderHeatmap() {
  const log = state.stats.dailyLog();
  const days = Object.keys(log);
  const WEEKS = 12;
  const CELL = 14;
  const GAP = 3;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() - (WEEKS - 1) * 7); // 12주 전 일요일

  const level = (n) => (n <= 0 ? 0 : n < 5 ? 1 : n < 10 ? 2 : n < 20 ? 3 : 4);
  let cells = '';
  let total = 0;
  for (let w = 0; w < WEEKS; w += 1) {
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      if (date > today) continue;
      const key = dateKey(date);
      const count = log[key] || 0;
      total += count;
      cells += `<rect class="hm hm-${level(count)}" x="${w * (CELL + GAP)}" y="${d * (CELL + GAP)}" width="${CELL}" height="${CELL}" rx="3"><title>${key} · ${count}문제</title></rect>`;
    }
  }
  const width = WEEKS * (CELL + GAP) - GAP;
  const height = 7 * (CELL + GAP) - GAP;
  const firstDay = days.sort()[0];
  const note = firstDay
    ? `기록은 ${firstDay}부터 있고, 이전 기간은 비어 있습니다. 최근 12주 동안 ${total}문제를 풀었어요.`
    : '아직 기록이 없습니다. 이 기능이 추가된 뒤에 푼 문제부터 칸이 채워집니다.';
  el.heatmap.innerHTML = `
    <svg class="heatmap-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="최근 12주 일별 풀이 수">${cells}</svg>
    <p class="chart-note">${note}</p>
  `;
}

/** 회독별 정답률 꺾은선 (x = 회독 순서, y = 정답률 %) */
function renderRoundChart(scope) {
  const rounds = state.stats.rounds(scope);
  if (!rounds.length) { el.roundChart.innerHTML = ''; el.roundChart.style.display = 'none'; return; }
  el.roundChart.style.display = '';

  const W = 600;
  const H = 220;
  const pad = { l: 40, r: 16, t: 14, b: 30 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const xAt = (i) => pad.l + (rounds.length === 1 ? innerW / 2 : (innerW * i) / (rounds.length - 1));
  const yAt = (pct) => pad.t + innerH * (1 - pct / 100);
  const pts = rounds.map((r, i) => ({ x: xAt(i), y: yAt(r.total ? Math.round((r.correct / r.total) * 100) : 0), r, pct: r.total ? Math.round((r.correct / r.total) * 100) : 0 }));

  const grid = [0, 50, 100].map((v) => `<line class="ch-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${yAt(v)}" y2="${yAt(v)}"/><text class="ch-axis" x="${pad.l - 8}" y="${yAt(v) + 4}" text-anchor="end">${v}%</text>`).join('');
  const line = pts.length > 1 ? `<polyline class="ch-line" points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}"/>` : '';
  const dots = pts.map((p) => `<circle class="ch-dot" cx="${p.x}" cy="${p.y}" r="4.5"><title>${p.r.round}회독 · ${p.r.correct}/${p.r.total} (${p.pct}%)</title></circle>`).join('');
  const labels = pts.map((p) => `<text class="ch-axis" x="${p.x}" y="${H - 8}" text-anchor="middle">${p.r.round}회독</text>`).join('');
  el.roundChart.innerHTML = `<svg class="line-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="회독별 정답률">${grid}${line}${dots}${labels}</svg>`;
}

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
  renderHeatmap();
  renderRoundTable(el.roundScopeSelect.value || '__all__');
}

export function renderRoundTable(scope) {
  renderRoundChart(scope);
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
