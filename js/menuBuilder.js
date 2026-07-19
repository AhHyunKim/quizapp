// menuBuilder.js
// Google Sheets의 "과목"/"소과목" 컬럼만 보고 메뉴 트리를 매번 새로 만든다.
// 시트에 과목/소과목이 추가·삭제되면 다음 로딩 때 메뉴도 자동으로 바뀐다 (하드코딩 없음).

/** "1.1. 세제관련..." 처럼 앞에 붙은 번호 기준으로 자연스럽게 정렬 */
export function naturalCompare(a, b) {
  const re = /(\d+(\.\d+)?)|(\D+)/g;
  const pa = String(a).match(re) || [];
  const pb = String(b).match(re) || [];
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? '';
    const y = pb[i] ?? '';
    const nx = parseFloat(x);
    const ny = parseFloat(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

export default class MenuBuilder {
  /**
   * @param {Array} questions
   * @returns {Array<{name, count, ids, children: Array<{name, count, ids}>}>}
   */
  build(questions) {
    const tree = new Map();

    questions.forEach((q) => {
      const subject = q.subject || '(미분류)';
      const sub = q.subSubject || '(미분류)';
      if (!tree.has(subject)) tree.set(subject, { ids: [], subSubjects: new Map() });
      const node = tree.get(subject);
      node.ids.push(q.id);
      if (!node.subSubjects.has(sub)) node.subSubjects.set(sub, { ids: [] });
      node.subSubjects.get(sub).ids.push(q.id);
    });

    const subjectNames = Array.from(tree.keys()).sort(naturalCompare);
    return subjectNames.map((subject) => {
      const node = tree.get(subject);
      const subNames = Array.from(node.subSubjects.keys()).sort(naturalCompare);
      return {
        name: subject,
        count: node.ids.length,
        ids: node.ids,
        children: subNames.map((name) => ({
          name,
          count: node.subSubjects.get(name).ids.length,
          ids: node.subSubjects.get(name).ids,
        })),
      };
    });
  }
}
