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
};

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
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      throw new Error(
        `데이터를 불러오지 못했습니다 (status ${res.status}). Google Sheets의 "웹에 게시" 또는 공유 설정을 확인해 주세요.`
      );
    }
    const text = await res.text();
    return this.loadFromCSV(text);
  }

  /** 사용자가 로컬에서 업로드한 CSV 파일로부터 불러온다. */
  async loadFromCSVFile(file) {
    const text = await file.text();
    return this.loadFromCSV(text);
  }

  /** CSV 원문 텍스트를 Question[] 로 변환한다. */
  loadFromCSV(csvText) {
    const rows = parseCSV(csvText.replace(/^\uFEFF/, ''));
    if (rows.length === 0) return [];

    const headers = rows[0].map((h) => h.trim());
    this.headers = headers;

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
