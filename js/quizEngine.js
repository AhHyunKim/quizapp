// quizEngine.js
// 하나의 학습 세션(문제 큐, 현재 위치, 정답 제출)을 관리한다.
// ID 기준으로만 동작하므로 문제 순서가 바뀌거나 새 문제가 추가돼도 기존 학습기록과 충돌하지 않는다.

export default class QuizEngine {
  constructor(questionsById, storageManager) {
    this.byId = questionsById; // Map<id, Question>
    this.storage = storageManager;
    this.queue = [];
    this.index = 0;
    this.scope = '__all__';
    this.sessionCorrect = 0;
    this.sessionTotal = 0;
  }

  start(ids, { shuffle = false, scope = '__all__' } = {}) {
    this.queue = ids.filter((id) => this.byId.has(id));
    if (shuffle) this._shuffle(this.queue);
    this.index = 0;
    this.scope = scope;
    this.sessionCorrect = 0;
    this.sessionTotal = 0;
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  current() {
    if (this.queue.length === 0) return null;
    return this.byId.get(this.queue[this.index]) || null;
  }

  isEmpty() { return this.queue.length === 0; }
  hasNext() { return this.index < this.queue.length - 1; }
  hasPrev() { return this.index > 0; }
  next() { if (this.hasNext()) this.index += 1; return this.current(); }
  prev() { if (this.hasPrev()) this.index -= 1; return this.current(); }

  progress() { return { index: this.index + 1, total: this.queue.length }; }

  submitResult(correct) {
    const q = this.current();
    if (!q) return null;
    const stats = this.storage.recordAnswer(q.id, q.subject, correct);
    this.sessionTotal += 1;
    if (correct) this.sessionCorrect += 1;
    this.storage.setLastPosition({ scope: this.scope, id: q.id, index: this.index });
    return stats;
  }

  finishRound() {
    if (this.sessionTotal === 0) return null;
    this.storage.saveRoundScore(this.scope, this.sessionCorrect, this.sessionTotal);
    const result = { correct: this.sessionCorrect, total: this.sessionTotal };
    this.sessionCorrect = 0;
    this.sessionTotal = 0;
    return result;
  }
}
