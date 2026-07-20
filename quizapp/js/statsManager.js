// statsManager.js
// LocalStorage에 쌓인 학습 데이터를 화면에 보여줄 형태로 집계만 한다 (저장 로직은 storageManager 담당).

export default class StatsManager {
  constructor(storageManager, questionsById, mode = 'default') {
    this.storage = storageManager;
    this.byId = questionsById;
    this.mode = mode;
  }

  overview() {
    const qStats = this.storage.getAllQuestionStats(this.mode);
    let attempts = 0;
    let correct = 0;
    Object.values(qStats).forEach((s) => { attempts += s.attempts; correct += s.correct; });
    return {
      attempts,
      correct,
      accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
      totalQuestions: this.byId.size,
      studiedQuestions: Object.keys(qStats).length,
      wrongCount: this.storage.getWrongList(this.mode).length,
      bookmarkCount: this.storage.getBookmarks(this.mode).length,
      favoriteCount: this.storage.getFavorites(this.mode).length,
    };
  }

  bySubject() {
    const subStats = this.storage.getSubjectStats(this.mode);
    return Object.entries(subStats)
      .map(([subject, s]) => ({
        subject,
        attempts: s.attempts,
        correct: s.correct,
        accuracy: s.attempts ? Math.round((s.correct / s.attempts) * 100) : 0,
      }))
      .sort((a, b) => b.attempts - a.attempts);
  }

  rounds(scope) {
    return this.storage.getRoundScores(scope, this.mode);
  }
}
