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
  _modeKey(key, mode = 'default') {
    if (mode === 'default') return key;
    return `${key}_${mode}`;
  }

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
  getSettings(mode = 'default') {
    return this._read(this._modeKey(KEYS.SETTINGS, mode), { darkMode: false, sheetUrl: '', font: 'default' });
  }
  setSettings(patch, mode = 'default') {
    const merged = { ...this.getSettings(mode), ...patch };
    this._write(this._modeKey(KEYS.SETTINGS, mode), merged);
    return merged;
  }

  // ---- ID 목록 공통 헬퍼 (북마크/즐겨찾기) ----
  _getList(key, mode = 'default') {
    return this._read(this._modeKey(key, mode), []);
  }
  _toggleInList(key, id, mode = 'default') {
    const list = this._getList(key, mode);
    const idx = list.indexOf(id);
    if (idx >= 0) list.splice(idx, 1);
    else list.push(id);
    this._write(this._modeKey(key, mode), list);
    return list;
  }

  getBookmarks(mode = 'default') { return this._getList(KEYS.BOOKMARKS, mode); }
  isBookmarked(id, mode = 'default') { return this.getBookmarks(mode).includes(id); }
  toggleBookmark(id, mode = 'default') { return this._toggleInList(KEYS.BOOKMARKS, id, mode); }

  getFavorites(mode = 'default') { return this._getList(KEYS.FAVORITES, mode); }
  isFavorite(id, mode = 'default') { return this.getFavorites(mode).includes(id); }
  toggleFavorite(id, mode = 'default') { return this._toggleInList(KEYS.FAVORITES, id, mode); }

  getWrongList(mode = 'default') { return this._getList(KEYS.WRONG, mode); }

  // ---- 문제별 풀이 기록 ----
  recordAnswer(id, subject, correct, mode = 'default') {
    const stats = this._read(this._modeKey(KEYS.QUESTION_STATS, mode), {});
    const s = stats[id] || { attempts: 0, correct: 0 };
    s.attempts += 1;
    if (correct) s.correct += 1;
    s.lastResult = correct;
    s.lastAt = Date.now();
    stats[id] = s;
    this._write(this._modeKey(KEYS.QUESTION_STATS, mode), stats);

    // 오답노트는 "마지막 결과가 오답인 문제" 목록으로 자동 유지
    let wrong = this._getList(KEYS.WRONG, mode);
    if (correct) {
      wrong = wrong.filter((x) => x !== id);
    } else if (!wrong.includes(id)) {
      wrong.push(id);
    }
    this._write(this._modeKey(KEYS.WRONG, mode), wrong);

    if (subject) {
      const subStats = this._read(this._modeKey(KEYS.SUBJECT_STATS, mode), {});
      const ss = subStats[subject] || { attempts: 0, correct: 0 };
      ss.attempts += 1;
      if (correct) ss.correct += 1;
      subStats[subject] = ss;
      this._write(this._modeKey(KEYS.SUBJECT_STATS, mode), subStats);
    }
    return s;
  }

  getQuestionStats(id, mode = 'default') {
    const stats = this._read(this._modeKey(KEYS.QUESTION_STATS, mode), {});
    return stats[id] || { attempts: 0, correct: 0 };
  }
  getAllQuestionStats(mode = 'default') { return this._read(this._modeKey(KEYS.QUESTION_STATS, mode), {}); }
  getSubjectStats(mode = 'default') { return this._read(this._modeKey(KEYS.SUBJECT_STATS, mode), {}); }

  // ---- 회독별 점수 (scope: 과목명 또는 '__all__' 등 임의 구간 키) ----
  saveRoundScore(scope, correct, total, mode = 'default') {
    const rounds = this._read(this._modeKey(KEYS.ROUND_SCORES, mode), {});
    const arr = rounds[scope] || [];
    arr.push({ round: arr.length + 1, correct, total, at: Date.now() });
    rounds[scope] = arr;
    this._write(this._modeKey(KEYS.ROUND_SCORES, mode), rounds);
    return arr;
  }
  getRoundScores(scope, mode = 'default') {
    const rounds = this._read(this._modeKey(KEYS.ROUND_SCORES, mode), {});
    return rounds[scope] || [];
  }
  getAllRoundScopes(mode = 'default') {
    return Object.keys(this._read(this._modeKey(KEYS.ROUND_SCORES, mode), {}));
  }

  // ---- 마지막 학습 위치 ----
  getLastPosition(mode = 'default') { return this._read(this._modeKey(KEYS.LAST_POSITION, mode), null); }
  setLastPosition(pos, mode = 'default') { this._write(this._modeKey(KEYS.LAST_POSITION, mode), pos); }

  // ---- 전체 초기화 (설정 화면의 "학습기록 초기화" 용) ----
  clearAllUserData() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  }
}
