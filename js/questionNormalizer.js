// questionNormalizer.js
// 시트/CSV에서 읽은 행을 화면용 Question 객체로 정규화한다 (보기 파싱, 기출 행 변환, 회차 메뉴).

import { naturalCompare } from './menuBuilder.js';

// ---------------------------------------------------------------------------
// 데이터 로딩
// ---------------------------------------------------------------------------
export function parseOptionList(value) {
  if (value === undefined || value === null || value === '') return [];
  const text = String(value).trim();
  if (!text) return [];
  const splitters = /\r?\n|\s*\|\s*|\s*；\s*|\s*;\s*|\s*\/\s*|\s*／\s*/;
  const parts = text.split(splitters).map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [text];
}

export function normalizeQuestions(list) {
  return list.map((q) => {
    const next = { ...q };
    const raw = next.raw || {};
    const optionEntries = [];

    const registerOption = (key, value) => {
      if (value === undefined || value === null || value === '') return;
      const text = String(value).trim();
      if (!text) return;
      const match = String(key).match(/^(?:((?:보기|선택지|option|choice)(\d+)?)|(\d+))$/i);
      if (match) {
        const index = match[2] ? Number(match[2]) : Number(match[3] || 0);
        if (index > 0) optionEntries.push([index, text]);
      }
    };

    Object.entries(next).forEach(([key, value]) => {
      if (key === 'options' || key === 'raw') return;
      registerOption(key, value);
    });
    Object.entries(raw).forEach(([key, value]) => {
      registerOption(key, value);
    });

    if (Array.isArray(next.options) && next.options.length) {
      next.options = next.options.filter((opt) => opt !== undefined && opt !== null).map((opt) => String(opt));
    } else if (typeof next.options === 'string' && next.options.trim()) {
      next.options = parseOptionList(next.options);
    } else if (optionEntries.length) {
      next.options = optionEntries.sort((a, b) => a[0] - b[0]).map(([, value]) => value);
    } else {
      const fallbackKeys = ['options', 'choices', 'selects', 'optionList'];
      fallbackKeys.forEach((key) => {
        if (raw[key] !== undefined) {
          next.options = parseOptionList(raw[key]);
        }
      });
    }

    if (next.answer !== undefined && next.answer !== null && next.answer !== '') {
      const answerText = String(next.answer).trim();
      const numeric = Number(answerText.replace(/[^0-9]/g, ''));
      if (!Number.isNaN(numeric) && numeric > 0) {
        next.answer = numeric;
      } else {
        const alias = { a: 1, b: 2, c: 3, d: 4, e: 5, '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 };
        next.answer = alias[answerText.toLowerCase()] || next.answer;
      }
    }

    return next;
  });
}

/** 기출문제의 "회차" 컬럼 기준으로 문제를 묶는다. 회차가 없는 문제는 별도 그룹으로 모은다. */
export function buildRoundMenu(list) {
  const map = new Map();
  list.forEach((q) => {
    const round = (q.round || '').toString().trim() || '(회차 미지정)';
    if (!map.has(round)) map.set(round, []);
    map.get(round).push(q.id);
  });
  const names = Array.from(map.keys()).sort(naturalCompare);
  return names.map((name) => ({ name, ids: map.get(name), count: map.get(name).length }));
}

export function convertExamRow(row) {
  const raw = row.raw || row;
  const optionEntries = [];
  Object.entries(raw).forEach(([key, value]) => {
    const match = String(key).match(/^(?:((?:보기|선택지|option|choice)(\d+)?)|(\d+))$/i);
    if (match && value !== undefined && value !== null && value !== '') {
      const index = match[2] ? Number(match[2]) : Number(match[3] || 0);
      if (index > 0) optionEntries.push([index, String(value)]);
    }
  });

  const answerValue = row.answer ?? row.답 ?? row.정답 ?? row.정답번호 ?? row.correct ?? row.correctAnswer ?? 0;
  const answerText = String(answerValue ?? '').trim();
  const numeric = Number(answerText.replace(/[^0-9]/g, ''));
  const normalizedAnswer = !Number.isNaN(numeric) && numeric > 0
    ? numeric
    : (({ a: 1, b: 2, c: 3, d: 4, e: 5, '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 })[answerText.toLowerCase()] || 0);

  let options = [];
  if (Array.isArray(row.options) && row.options.length) {
    options = row.options.filter((v) => v !== undefined && v !== null && v !== '').map((v) => String(v));
  } else if (typeof row.options === 'string' && row.options.trim()) {
    options = parseOptionList(row.options);
  } else if (optionEntries.length) {
    options = optionEntries.sort((a, b) => a[0] - b[0]).map(([, value]) => value);
  } else {
    Object.entries(raw).forEach(([key, value]) => {
      if (['options', 'choices', 'selects', 'optionlist'].includes(String(key).toLowerCase()) && value) {
        options = parseOptionList(value);
      }
    });
  }

  const normalizedOptions = options
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map((v) => String(v).trim())
    .slice(0, 4);

  const roundValue = row.round || row.회차 || raw.회차 || raw.Round || raw.round || '';

  return {
    id: row.id || row.ID || '',
    subject: row.subject || row.과목 || '',
    subSubject: row.subSubject || row.소과목 || '',
    question: row.question || row.문제 || '',
    options: normalizedOptions,
    answer: normalizedAnswer,
    explanation: row.explanation || row.해설 || '',
    difficulty: row.difficulty || row.난이도 || '',
    round: String(roundValue || '').trim(),
  };
}
