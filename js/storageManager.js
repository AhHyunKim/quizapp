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

// 여기에 Apps Script 배포 URL(.../exec)을 채워두면, 설정 화면에서 아무것도 입력하지 않아도
// 모든 기기/브라우저에서 자동으로 이 주소로 동기화한다. 설정 화면에 직접 입력한 값이 있으면
// 그 값이 우선한다 (기본값은 "아무 것도 안 넣었을 때만" 적용되는 폴백).
const DEFAULT_SYNC_URL = '';

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
    return this._read(this._modeKey(KEYS.SETTINGS, mode), { darkMode: false, sheetUrl: '', font: 'default', syncUrl: '', syncSheetUrl: '' });
  }
  setSettings(patch, mode = 'default') {
    const merged = { ...this.getSettings(mode), ...patch };
    this._write(this._modeKey(KEYS.SETTINGS, mode), merged);
    return merged;
  }

  // ---- 클라우드 동기화 (Google Apps Script 웹앱) ----
  // syncUrl이 설정돼 있으면, 로컬 저장과 동시에(파이어 앤 포겟) 시트에도 기록을 남긴다.
  // 실패해도 로컬 저장/앱 동작에는 영향이 없다 (오프라인이어도 앱은 그대로 동작).
  getSyncUrl(mode = 'default') {
    return this.getSettings(mode).syncUrl || DEFAULT_SYNC_URL;
  }

  /** 사용자가 붙여넣은 일반 Google Sheets 링크(또는 ID를 그냥 붙여넣은 경우)에서 시트 ID만 뽑아낸다. */
  _extractSheetId(url) {
    if (!url) return '';
    const trimmed = String(url).trim();
    const m = trimmed.match(/\/d\/(?:e\/)?([a-zA-Z0-9-_]+)/);
    return m ? m[1] : trimmed;
  }

  /** 학습기록을 실제로 저장할 시트 ID. 설정에 입력해 두지 않으면 빈 문자열(Apps Script의 기본 시트 사용). */
  getSyncSheetId(mode = 'default') {
    return this._extractSheetId(this.getSettings(mode).syncSheetUrl);
  }

  async _syncPush(mode, payload) {
    const url = this.getSyncUrl(mode);
    if (!url) return;
    const sheetId = this.getSyncSheetId(mode);
    try {
      // no-cors: Apps Script의 302 리다이렉트 응답에 CORS 헤더가 없어 fetch가 막히는 경우가 있어
      // 응답을 아예 읽지 않는(파이어 앤 포겟) 방식으로 우회한다. 응답 내용은 필요 없다.
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ ...payload, mode, sheetId: sheetId || undefined }),
      });
    } catch (e) {
      console.warn('[sync] push 실패', e);
    }
  }

  /**
   * 앱 시작/시트 로딩 시 호출: 시트에 쌓인 학습기록을 이 기기의 LocalStorage로 가져온다.
   * fetch 대신 <script> 태그(JSONP)로 불러온다 — Apps Script 웹앱 URL은 script.google.com이
   * script.googleusercontent.com으로 302 리다이렉트하는데, 그 리다이렉트 응답 자체에 CORS
   * 헤더가 없어 fetch가 "No Access-Control-Allow-Origin" 오류로 막히는 경우가 흔하다.
   * <script> 태그 로딩은 CORS 제약을 받지 않으므로 이 문제를 피할 수 있다.
   */
  pullFromCloud(mode = 'default') {
    const url = this.getSyncUrl(mode);
    if (!url) return Promise.resolve(null);
    const sheetId = this.getSyncSheetId(mode);

    return new Promise((resolve) => {
      const cbName = `__quizSyncCb_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
      const sep = url.includes('?') ? '&' : '?';
      const script = document.createElement('script');
      let done = false;

      const cleanup = () => {
        delete window[cbName];
        script.remove();
        clearTimeout(timer);
      };

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        console.warn('[sync] pull 시간 초과 (10초)');
        cleanup();
        resolve(null);
      }, 10000);

      window[cbName] = (data) => {
        if (done) return;
        done = true;
        this._applyCloudSnapshot(data, mode);
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        if (done) return;
        done = true;
        console.warn('[sync] pull 실패 (스크립트 로드 오류 — URL/배포 상태 확인 필요)');
        cleanup();
        resolve(null);
      };

      const sheetIdParam = sheetId ? `&sheetId=${encodeURIComponent(sheetId)}` : '';
      script.src = `${url}${sep}mode=${encodeURIComponent(mode)}${sheetIdParam}&callback=${cbName}`;
      document.body.appendChild(script);
    });
  }

  /** 시트에서 받아온 스냅샷으로 이 기기의 학습기록을 덮어쓴다 (시트를 기준 데이터로 취급). */
  _applyCloudSnapshot(data, mode) {
    const qStats = {};
    const wrong = [];
    const bookmarks = [];
    const favorites = [];
    const subjectStats = {};

    (data.records || []).forEach((r) => {
      const attempts = Number(r.attempts) || 0;
      const correct = Number(r.correct) || 0;
      qStats[r.id] = {
        attempts,
        correct,
        lastResult: r.lastResult === '정답',
        lastAt: r.lastAt ? new Date(r.lastAt).getTime() : undefined,
      };
      if (r.wrong === 'O') wrong.push(r.id);
      if (r.bookmark === 'O') bookmarks.push(r.id);
      if (r.favorite === 'O') favorites.push(r.id);
      if (r.subject) {
        const s = subjectStats[r.subject] || { attempts: 0, correct: 0 };
        s.attempts += attempts;
        s.correct += correct;
        subjectStats[r.subject] = s;
      }
    });

    this._write(this._modeKey(KEYS.QUESTION_STATS, mode), qStats);
    this._write(this._modeKey(KEYS.WRONG, mode), wrong);
    this._write(this._modeKey(KEYS.BOOKMARKS, mode), bookmarks);
    this._write(this._modeKey(KEYS.FAVORITES, mode), favorites);
    this._write(this._modeKey(KEYS.SUBJECT_STATS, mode), subjectStats);

    const rounds = {};
    (data.rounds || []).forEach((r) => {
      if (!rounds[r.scope]) rounds[r.scope] = [];
      rounds[r.scope].push({
        round: Number(r.round) || rounds[r.scope].length + 1,
        correct: Number(r.correct) || 0,
        total: Number(r.total) || 0,
        at: r.at ? new Date(r.at).getTime() : Date.now(),
      });
    });
    this._write(this._modeKey(KEYS.ROUND_SCORES, mode), rounds);
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
  toggleBookmark(id, mode = 'default') {
    const list = this._toggleInList(KEYS.BOOKMARKS, id, mode);
    this._syncPush(mode, { type: 'toggle', id, field: 'bookmark', on: list.includes(id) });
    return list;
  }

  getFavorites(mode = 'default') { return this._getList(KEYS.FAVORITES, mode); }
  isFavorite(id, mode = 'default') { return this.getFavorites(mode).includes(id); }
  toggleFavorite(id, mode = 'default') {
    const list = this._toggleInList(KEYS.FAVORITES, id, mode);
    this._syncPush(mode, { type: 'toggle', id, field: 'favorite', on: list.includes(id) });
    return list;
  }

  getWrongList(mode = 'default') { return this._getList(KEYS.WRONG, mode); }

  // ---- 문제별 풀이 기록 ----
  recordAnswer(id, subject, subSubject, correct, mode = 'default') {
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

    this._syncPush(mode, { type: 'answer', id, subject, subSubject, correct });
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
    const round = arr.length + 1;
    arr.push({ round, correct, total, at: Date.now() });
    rounds[scope] = arr;
    this._write(this._modeKey(KEYS.ROUND_SCORES, mode), rounds);

    this._syncPush(mode, { type: 'round', scope, round, correct, total });
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
