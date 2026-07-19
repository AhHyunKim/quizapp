// storageManager.js
// 사용자 학습 데이터 전담 모듈. 문제 데이터(Google Sheets)는 절대 이곳에 저장하지 않는다.
// 오답목록/북마크/즐겨찾기/문제별 통계/회독별 점수/과목별 통계/마지막 위치/설정을 LocalStorage에 보관.

const KEYS = {
  SETTINGS: 'qa_settings_v1',
  BOOKMARKS: 'qa_bookmarks_v1',
  FAVORITES: 'qa_favorites_v1',
  WRONG: 'qa_wrong_v1',
  QUESTION_STATS: 'qa_question_stats_v1',
  ROUND_SCORES: 'qa_round_scores_v1',
  SUBJECT_STATS: 'qa_subject_stats_v1',
  LAST_POSITION: 'qa_last_position_v1',
};

export default class StorageManager {
  _read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.warn('[storage] read failed for', key, e);
      return fallback;
    }
  }

  _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('[storage] write failed for', key, e);
      return false;
    }
  }

  // ---- 설정 (다크모드, 시트 URL 등) ----
  getSettings() {
    return this._read(KEYS.SETTINGS, { darkMode: false, sheetUrl: '' });
  }
  setSettings(patch) {
    const merged = { ...this.getSettings(), ...patch };
    this._write(KEYS.SETTINGS, merged);
    return merged;
  }

  // ---- ID 목록 공통 헬퍼 (북마크/즐겨찾기) ----
  _getList(key) {
    return this._read(key, []);
  }
  _toggleInList(key, id) {
    const list = this._getList(key);
    const idx = list.indexOf(id);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(id);
    this._write(key, list);
    return list;
  }

  getBookmarks() { return this._getList(KEYS.BOOKMARKS); }
  isBookmarked(id) { return this.getBookmarks().includes(id); }
  toggleBookmark(id) { return this._toggleInList(KEYS.BOOKMARKS, id); }

  getFavorites() { return this._getList(KEYS.FAVORITES); }
  isFavorite(id) { return this.getFavorites().includes(id); }
  toggleFavorite(id) { return this._toggleInList(KEYS.FAVORITES, id); }

  getWrongList() { return this._getList(KEYS.WRONG); }

  // ---- 문제별 풀이 기록 ----
  recordAnswer(id, subject, correct) {
    const stats = this._read(KEYS.QUESTION_STATS, {});
    const s = stats[id] || { attempts: 0, correct: 0 };
    s.attempts += 1;
    if (correct) s.correct += 1;
    s.lastResult = correct;
    s.lastAt = Date.now();
    stats[id] = s;
    this._write(KEYS.QUESTION_STATS, stats);

    // 오답노트는 "마지막 결과가 오답인 문제" 목록으로 자동 유지
    let wrong = this._getList(KEYS.WRONG);
    if (correct) {
      wrong = wrong.filter((x) => x !== id);
    } else if (!wrong.includes(id)) {
      wrong.push(id);
    }
    this._write(KEYS.WRONG, wrong);

    if (subject) {
      const subStats = this._read(KEYS.SUBJECT_STATS, {});
      const ss = subStats[subject] || { attempts: 0, correct: 0 };
      ss.attempts += 1;
      if (correct) ss.correct += 1;
      subStats[subject] = ss;
      this._write(KEYS.SUBJECT_STATS, subStats);
    }
    return s;
  }

  getQuestionStats(id) {
    const stats = this._read(KEYS.QUESTION_STATS, {});
    return stats[id] || { attempts: 0, correct: 0 };
  }
  getAllQuestionStats() { return this._read(KEYS.QUESTION_STATS, {}); }
  getSubjectStats() { return this._read(KEYS.SUBJECT_STATS, {}); }

  // ---- 회독별 점수 (scope: 과목명 또는 '__all__' 등 임의 구간 키) ----
  saveRoundScore(scope, correct, total) {
    const rounds = this._read(KEYS.ROUND_SCORES, {});
    const arr = rounds[scope] || [];
    arr.push({ round: arr.length + 1, correct, total, at: Date.now() });
    rounds[scope] = arr;
    this._write(KEYS.ROUND_SCORES, rounds);
    return arr;
  }
  getRoundScores(scope) {
    const rounds = this._read(KEYS.ROUND_SCORES, {});
    return rounds[scope] || [];
  }
  getAllRoundScopes() {
    return Object.keys(this._read(KEYS.ROUND_SCORES, {}));
  }

  // ---- 마지막 학습 위치 ----
  getLastPosition() { return this._read(KEYS.LAST_POSITION, null); }
  setLastPosition(pos) { this._write(KEYS.LAST_POSITION, pos); }

  // ---- 전체 초기화 (설정 화면의 "학습기록 초기화" 용) ----
  clearAllUserData() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  }
}
