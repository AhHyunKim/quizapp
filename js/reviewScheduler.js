// reviewScheduler.js
// 간이 간격 반복(Leitner) 규칙으로 "오늘 복습할 문제"를 계산하는 순수 함수 모듈. DOM/저장소 접근 없음.

const DAY_MS = 24 * 60 * 60 * 1000;

// 연속 정답 수(streak) 1/2/3/4/5+ 에 따른 복습 간격(일)
const CORRECT_INTERVAL_DAYS = [1, 3, 7, 14, 30];
// 마지막 결과가 오답이면 1일 후
const WRONG_INTERVAL_DAYS = 1;

/** 문제 하나의 다음 복습 시각(epoch ms). 풀이 기록(lastAt)이 없으면 null. */
export function getDueAt(stat) {
  if (!stat || !stat.lastAt) return null;
  const days = stat.lastResult
    ? CORRECT_INTERVAL_DAYS[Math.min(Math.max(stat.streak || 1, 1), CORRECT_INTERVAL_DAYS.length) - 1]
    : WRONG_INTERVAL_DAYS;
  return stat.lastAt + days * DAY_MS;
}

/**
 * 복습 기한이 지난 문제 ID 목록 (기한이 오래된 순).
 * @param {Object<string, {lastAt?: number, lastResult?: boolean, streak?: number}>} questionStats 문제 ID → 통계
 * @param {number} now 현재 시각 (epoch ms)
 */
export function getDueIds(questionStats, now = Date.now()) {
  return Object.entries(questionStats || {})
    .map(([id, stat]) => ({ id, dueAt: getDueAt(stat) }))
    .filter((item) => item.dueAt !== null && item.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt)
    .map((item) => item.id);
}
