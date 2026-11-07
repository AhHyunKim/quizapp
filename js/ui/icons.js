// ui/icons.js
// 인라인 SVG 아이콘 (선 아이콘, 24x24, currentColor). 외부 라이브러리 없이 이 파일 하나로 관리한다.

const PATHS = {
  'chart-bar': '<path d="M4 20h16M7 20v-7M12 20V6M17 20v-11"/>',
  'notes-x': '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9.5 12.5l4 4M13.5 12.5l-4 4"/>',
  bookmark: '<path d="M7 4h10v17l-5-4-5 4z"/>',
  star: '<path d="M12 3.5l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17.3l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"/>',
  'calendar-check': '<path d="M5 5h14v15H5zM5 9.5h14M8.5 3v4M15.5 3v4M9 14.5l2 2 4-4"/>',
  gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="M14 7l3 3"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
  book: '<path d="M4 5.5C6.5 4 9.5 4 12 5.5c2.5-1.5 5.5-1.5 8 0V19c-2.5-1.5-5.5-1.5-8 0-2.5-1.5-5.5-1.5-8 0z"/><path d="M12 5.5V19"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
};

/** 아이콘 SVG 문자열. 채움 여부는 CSS(.on svg 등)로 제어한다. */
export function icon(name, size = 20) {
  const body = PATHS[name] || '';
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** HTML 안의 <span data-icon="이름"> 자리표시자를 SVG로 바꾼다. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    node.innerHTML = icon(node.dataset.icon, Number(node.dataset.size) || 20);
    node.removeAttribute('data-icon');
  });
}
