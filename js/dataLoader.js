// dataLoader.js
// 문제 데이터(Source of Truth = Google Sheets)를 가져오는 유일한 창구.
// 나머지 앱 코드는 loadFromGoogleSheets/loadFromCSV*가 반환하는 Question[] 배열만 알면 되고,
// 데이터 원본이 Google Sheets -> CSV -> JSON 등으로 바뀌어도 이 파일만 손대면 된다.

// 알려진 헤더는 영문 키로 별칭을 주되, 목록에 없는 새 컬럼(난이도/해설/보기1~5/이미지URL 등)은
// 원래 헤더명 그대로 Question 객체에 실려 전달된다 -> 새 컬럼 추가 시 이 파일 수정이 필요 없다.
const HEADER_ALIAS = {
  ID: 'id',
  과목: 'subject',
  소과목: 'subSubject',
  문제: 'question',
  정답: 'answer',
  회차: 'round',
  해설: 'explanation',
  Explanation: 'explanation',
  난이도: 'difficulty',
  Difficulty: 'difficulty',
};

// 필수 헤더와 허용하는 별칭 (비교는 소문자 기준)
const REQUIRED_HEADERS = [
  { label: 'ID', names: ['id'] },
  { label: '과목', names: ['과목', 'subject'] },
  { label: '소과목', names: ['소과목', 'subsubject'] },
  { label: '문제', names: ['문제', 'question'] },
  { label: '정답', names: ['정답', 'answer', '정답번호', '답', 'correct', 'correctanswer'] },
];

/**
 * 따옴표로 감싼 필드(콤마/개행/이스케이프된 "" 포함)를 지원하는 CSV 파서.
 * 표준 라이브러리 없이 순수 문자열 스캔으로 동작한다.
 */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // \r\n 의 \r은 무시 (다음 \n에서 행이 닫힘)
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 완전히 빈 줄 제거
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

export default class DataLoader {
  constructor() {
    this.headers = [];
  }

  /**
   * 사용자가 공유/게시(Publish to web) 링크를 그대로 붙여넣어도 동작하도록
   * 일반 Google Sheets URL을 CSV 내보내기 URL로 정규화한다.
   */
  normalizeSheetUrl(url) {
    const trimmed = url.trim();
    if (!trimmed) return trimmed;

    if (trimmed.includes('output=csv') || trimmed.includes('/export?') || trimmed.includes('/export?format=csv')) {
      return trimmed;
    }

    const idMatch = trimmed.match(/\/d\/(?:e\/)?([a-zA-Z0-9-_]+)/);
    if (!idMatch) return trimmed;

    const sheetId = idMatch[1];
    const gidMatch = trimmed.match(/[?&#]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : '0';
    return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  }

  /** Google Sheets 링크로부터 문제 데이터를 불러온다. */
  async loadFromGoogleSheets(sheetUrl) {
    const csvUrl = this.normalizeSheetUrl(sheetUrl);
    return this.loadFromCSVUrl(csvUrl);
  }

  /** 임의의 CSV URL(정적 호스팅 파일 등)로부터 불러온다. */
  async loadFromCSVUrl(url) {
    let res;
    try {
      res = await fetch(url, { cache: 'no-store' });
    } catch (e) {
      throw new Error('네트워크에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
    }
    if (!res.ok) {
      throw new Error(
        `데이터를 불러오지 못했습니다 (status ${res.status}). Google Sheets의 "웹에 게시" 또는 공유 설정을 확인해 주세요.`
      );
    }
    const text = await res.text();
    // 게시/공유가 안 된 시트는 CSV 대신 로그인 페이지 같은 HTML을 돌려준다.
    if (/^\s*<(!doctype|html)/i.test(text)) {
      throw new Error('시트가 CSV 대신 웹페이지로 응답했습니다. "웹에 게시"를 했는지, 공유가 "링크가 있는 모든 사용자 보기 가능"인지 확인해 주세요.');
    }
    return this.loadFromCSV(text);
  }

  /** 사용자가 로컬에서 업로드한 CSV 파일로부터 불러온다. */
  async loadFromCSVFile(file) {
    const text = await file.text();
    return this.loadFromCSV(text);
  }

  /** 필수 헤더(ID/과목/소과목/문제/정답)가 모두 있는지 확인하고, 빠진 이름을 알려준다. */
  assertRequiredHeaders(headers) {
    const have = new Set(headers.map((h) => h.toLowerCase()));
    const missing = REQUIRED_HEADERS.filter((r) => !r.names.some((n) => have.has(n))).map((r) => r.label);
    if (missing.length) {
      throw new Error(`필수 헤더가 없습니다: ${missing.join(', ')}. 첫 행을 ID, 과목, 소과목, 문제, 정답 순서로 맞춰 주세요.`);
    }
  }

  /** CSV 원문 텍스트를 Question[] 로 변환한다. */
  loadFromCSV(csvText) {
    const rows = parseCSV(csvText.replace(/^\uFEFF/, ''));
    if (rows.length === 0) return [];

    const headers = rows[0].map((h) => h.trim());
    this.headers = headers;
    this.assertRequiredHeaders(headers);

    const questions = [];
    for (let i = 1; i < rows.length; i++) {
      const raw = rows[i];
      if (raw.length === 1 && raw[0].trim() === '') continue;

      const record = {};
      headers.forEach((h, idx) => { record[h] = (raw[idx] ?? '').trim(); });

      const q = this.parseQuestion(record, headers);
      if (q) questions.push(q);
    }
    return questions;
  }

  /**
   * 원시 { 헤더명: 값 } 레코드를 Question 객체로 변환.
   * 알려진 컬럼(ID/과목/소과목/문제/정답)은 안정적인 영문 키로 접근 가능하고,
   * 그 외 모든 컬럼은 원래 헤더명 그대로 함께 실린다 (raw에도 원본 보존).
   */
  parseQuestion(record, headers) {
    const q = { raw: record };
    headers.forEach((h) => {
      const key = HEADER_ALIAS[h] || h;
      q[key] = record[h];
    });
    if (!q.id) return null;
    return q;
  }
}
