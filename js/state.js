// state.js
// 앱 전체가 공유하는 상태와 서비스 인스턴스. 화면 모듈들은 여기만 import 해서 같은 상태를 본다.

import DataLoader from './dataLoader.js';
import StorageManager from './storageManager.js';
import MenuBuilder from './menuBuilder.js';

export const storage = new StorageManager();
export const dataLoader = new DataLoader();
export const menuBuilder = new MenuBuilder();

export const state = {
  questions: [],
  byId: new Map(),
  menu: [],
  examRoundMenu: [],
  quiz: null,
  stats: null,
  revealed: false,
  graded: false,
  myAnswerDraft: '',
  selectedOption: 0, // 객관식에서 고른 보기 번호 (1부터, 0=선택 없음)
  currentMode: 'basic',
  currentModeLabel: '빈출문제',
};
