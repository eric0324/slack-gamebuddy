import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/engine.js';
import { applyDeception, type DAction, type DState } from '../src/deception.js';
import { CAUSE_BOARD, CLUES, LOCATION_BOARDS, MEANS, SCENE_BOARDS } from '../src/deceptionCards.js';

const EMOJI = /\p{Extended_Pictographic}/u;

describe('deception/setup: 詞庫', () => {
  it('手段、線索各至少 100 個，不空白、不重複、兩個詞庫沒有共同的詞、不超過 6 個字', () => {
    for (const words of [MEANS, CLUES]) {
      expect(words.length).toBeGreaterThanOrEqual(100);
      expect(new Set(words).size).toBe(words.length);
      for (const w of words) {
        expect(w.trim(), w).toBe(w);
        expect(w.length, w).toBeGreaterThan(0);
        expect([...w].length, w).toBeLessThanOrEqual(6);
        expect(EMOJI.test(w), w).toBe(false);
      }
    }
    const means = new Set(MEANS);
    expect(CLUES.filter((w) => means.has(w))).toEqual([]);
  });
});

describe('deception/clues: 提示板內容', () => {
  it('死因板 1 張、地點板 4 張、場景板至少 20 張；每張 6 個不重複的選項；題目不重複、不含 emoji', () => {
    expect(CAUSE_BOARD.title).toBe('死因');
    expect(LOCATION_BOARDS).toHaveLength(4);
    expect(SCENE_BOARDS.length).toBeGreaterThanOrEqual(20);
    const all = [CAUSE_BOARD, ...LOCATION_BOARDS, ...SCENE_BOARDS];
    for (const b of all) {
      expect(b.title.trim(), b.title).not.toBe('');
      expect(b.options, b.title).toHaveLength(6);
      expect(new Set(b.options).size, b.title).toBe(6);
      for (const t of [b.title, ...b.options]) {
        expect(t.trim(), b.title).not.toBe('');
        expect(EMOJI.test(t), t).toBe(false);
      }
    }
    const titles = all.map((b) => b.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

// ---------- engine ----------

const rng = () => 0.99999; // 洗牌不動：最後一位是鑑識官，p1 兇手、p2 共犯、p3 目擊者（6 人以上），其他調查員

function run(actions: DAction[], start?: DState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyDeception(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const lobbyWith = (n: number) =>
  run([{ type: 'new', user: 'p1', channel: 'C1' }, ...ids(n).slice(1).map((user) => ({ type: 'join', user }) as DAction)]);
const started = (n: number, r: () => number = rng) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state, r);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.filter((e) => e.type === 'ephemeral' && e.to === user).map((e) => (e as { text: string }).text);
const dmTo = (events: GameEvent[], user: string) => events.filter((e) => e.type === 'dm' && e.to === user).map((e) => (e as { text: string }).text);
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const panels = (events: GameEvent[]) => prompts(events).filter((p) => p.audience === 'channel' && p.ref);
const menuOf = (events: GameEvent[], user: string) => prompts(events).find((p) => p.audience === 'ephemeral' && p.user === user);
const userPrompt = (events: GameEvent[], user: string) => prompts(events).find((p) => p.audience === 'user' && p.user === user);
const roleOf = (s: DState, role: string) => s.players.filter((p) => p.role === role).map((p) => p.id);
const values = (p: { options: { value: string }[] } | undefined) => p?.options.map((o) => o.value) ?? [];
const labels = (p: { options: { label: string }[] } | undefined) => p?.options.map((o) => o.label) ?? [];

describe('deception/setup: 詭影神探的房間', () => {
  it('開房：公告標示詭影神探', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'deception', host: 'A', phase: 'lobby' });
    expect(events).toContainEqual({ type: 'lobby', title: '詭影神探', host: 'A', players: ['A'], open: true });
  });

  it('人數不足 4 人不能開始', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(3).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1').join()).toContain('至少需要 4 人');
  });

  it('房間已滿（12 人）時拒絕加入', () => {
    const { state, events } = run([{ type: 'join', user: 'x' }], lobbyWith(12).state);
    expect(state.players).toHaveLength(12);
    expect(ephemeralTo(events, 'x').join()).toContain('房間已滿');
  });

  it('加入、離開、房主離開取消、頻道已經有遊戲', () => {
    const lobby = lobbyWith(4).state;
    expect(run([{ type: 'leave', user: 'p2' }], lobby).state.players.map((p) => p.id)).toEqual(['p1', 'p3', 'p4']);
    const hostLeft = run([{ type: 'leave', user: 'p1' }], lobby);
    expect(hostLeft.state.phase).toBe('ended');
    expect(announces(hostLeft.events).join()).toContain('取消');
    const busy = run([{ type: 'new', user: 'x', channel: 'C1' }], lobby);
    expect(ephemeralTo(busy.events, 'x')).toEqual(['這個頻道已經有遊戲了。']);
  });

  it('addbot／removebot 回「詭影神探不支援 bot」且名單不變', () => {
    const lobby = lobbyWith(2).state;
    for (const type of ['addBot', 'removeBot'] as const) {
      const { state, events } = run([{ type, user: 'p1', count: 1 }], lobby);
      expect(state.players.map((p) => p.id)).toEqual(['p1', 'p2']);
      expect(ephemeralTo(events, 'p1')).toEqual(['詭影神探不支援 bot。']);
    }
  });
});

describe('deception/setup: 角色分配', () => {
  const count = (s: DState) => ['scientist', 'murderer', 'accomplice', 'witness', 'investigator'].map((r) => roleOf(s, r).length);

  it('4、5 人沒有共犯和目擊者；6、8、12 人各 1 共犯 1 目擊者，調查員是人數 − 4', () => {
    expect(count(started(4).state)).toEqual([1, 1, 0, 0, 2]);
    expect(count(started(5).state)).toEqual([1, 1, 0, 0, 3]);
    expect(count(started(6).state)).toEqual([1, 1, 1, 1, 2]);
    expect(count(started(8).state)).toEqual([1, 1, 1, 1, 4]);
    expect(count(started(12).state)).toEqual([1, 1, 1, 1, 8]);
  });

  it('鑑識官隨機選；座位是加入順序', () => {
    expect(roleOf(started(5).state, 'scientist')).toEqual(['p5']);
    expect(roleOf(started(5, () => 0).state, 'scientist')).toEqual(['p1']);
    expect(started(5).state.players.map((p) => p.id)).toEqual(ids(5));
  });

  it('頻道公開鑑識官，不公開其他角色', () => {
    const { events } = started(6);
    const text = announces(events).join('\n');
    expect(text).toContain('鑑識官：<@p6>');
    for (const word of ['兇手：', '共犯：', '目擊者：', '<@p1> 是', '<@p2> 是']) expect(text).not.toContain(word);
  });
});

describe('deception/setup: 發卡、身分私訊、開局公告', () => {
  it('鑑識官以外每人 4 手段 4 線索，12 人局全部不重複；鑑識官沒卡、沒有徽章', () => {
    const { state } = started(12);
    const others = state.players.filter((p) => p.role !== 'scientist');
    expect(others).toHaveLength(11);
    for (const p of others) {
      expect(p.means).toHaveLength(4);
      expect(p.clues).toHaveLength(4);
      expect(p.badge).toBe(true);
      for (const m of p.means) expect(MEANS).toContain(m);
      for (const cl of p.clues) expect(CLUES).toContain(cl);
    }
    expect(new Set(others.flatMap((p) => p.means)).size).toBe(44);
    expect(new Set(others.flatMap((p) => p.clues)).size).toBe(44);
    const sci = state.players.find((p) => p.role === 'scientist')!;
    expect(sci).toMatchObject({ means: [], clues: [], badge: false });
  });

  it('身分私訊：各角色的文字；開局時共犯和目擊者還沒有夜晚資訊', () => {
    const { events } = started(6);
    expect(dmTo(events, 'p1').join()).toContain('你是兇手');
    expect(dmTo(events, 'p2').join()).toContain('你是共犯');
    expect(dmTo(events, 'p3').join()).toContain('你是目擊者');
    expect(dmTo(events, 'p4').join()).toContain('你是調查員');
    expect(dmTo(events, 'p6').join()).toContain('你是鑑識官');
    expect(dmTo(events, 'p6').join()).toContain('只能用提示板上的子彈');
    for (const u of ['p2', 'p3', 'p4', 'p5', 'p6']) expect(dmTo(events, u).join(), u).not.toContain('<@p1>');
  });

  it('開局公告：玩家、鑑識官、有共犯和目擊者、3 輪、規則摘要、場上一覽純文字，然後進入夜晚', () => {
    const { state, events } = started(6);
    const text = announces(events).join('\n');
    expect(text).toContain('<@p1>');
    expect(text).toContain('<@p5>');
    expect(text).toContain('這局有共犯和目擊者');
    expect(text).toContain('3 輪');
    expect(text).toContain('一次破案機會');
    expect(text).toContain('場上一覽');
    const p1 = state.players[0];
    const line = text.split('\n').find((l) => l.startsWith('<@p1>'))!;
    for (const w of [...p1.means, ...p1.clues]) expect(line).toContain(w);
    const opening = announces(events).find((t) => t.includes('場上一覽'))!;
    const list = opening.slice(opening.indexOf('場上一覽'));
    expect(EMOJI.test(list)).toBe(false);
    expect(list).not.toContain('<@p6>');
    expect(state.phase).toBe('night');
    expect(announces(started(5).events).join()).toContain('這局沒有共犯和目擊者');
  });
});

// 兇手 p1 選第 0 張手段和第 0 張線索，天亮進入第 1 輪蒐證
const day = (n: number) => run([{ type: 'nightMeans', user: 'p1', i: 0 }, { type: 'nightClue', user: 'p1', i: 0 }], started(n).state);

describe('deception/night: 兇手選答案', () => {
  it('頻道公告天黑不透露兇手；兇手私訊 4 張手段按鈕，選了之後私訊 4 張線索按鈕', () => {
    const { state, events } = started(6);
    const dark = announces(events).find((t) => t.includes('天黑了'))!;
    expect(dark).toBeDefined();
    expect(dark).not.toContain('<@p1>');
    const p1 = state.players[0];
    const m = userPrompt(events, 'p1')!;
    expect(labels(m)).toEqual(p1.means);
    expect(values(m)).toEqual(['nm:0', 'nm:1', 'nm:2', 'nm:3']);
    const after = run([{ type: 'nightMeans', user: 'p1', i: 1 }], state);
    expect(after.state.answer).toEqual({ means: p1.means[1] });
    const cl = userPrompt(after.events, 'p1')!;
    expect(labels(cl)).toEqual(p1.clues);
    expect(values(cl)).toEqual(['nc:0', 'nc:1', 'nc:2', 'nc:3']);
    const done = run([{ type: 'nightClue', user: 'p1', i: 2 }], after.state);
    expect(done.state.answer).toEqual({ means: p1.means[1], clue: p1.clues[2] });
    expect(done.state.phase).toBe('evidence');
  });

  it('只能選自己的卡；兇手以外的人按被拒、state 不變', () => {
    const s = started(6).state;
    expect(run([{ type: 'nightMeans', user: 'p1', i: 4 }], s).state).toBe(s);
    const other = run([{ type: 'nightMeans', user: 'p2', i: 0 }], s);
    expect(other.state).toBe(s);
    expect(ephemeralTo(other.events, 'p2').join()).toContain('只有兇手');
  });

  it('答案固定後再按回「已經選好了」，答案不變', () => {
    const s = day(6).state;
    const again = run([{ type: 'nightMeans', user: 'p1', i: 2 }], s);
    expect(again.state).toBe(s);
    expect(ephemeralTo(again.events, 'p1')).toEqual(['已經選好了。']);
    const half = run([{ type: 'nightMeans', user: 'p1', i: 0 }], started(6).state).state;
    expect(ephemeralTo(run([{ type: 'nightMeans', user: 'p1', i: 2 }], half).events, 'p1')).toEqual(['已經選好了。']);
  });
});

describe('deception/night: 夜晚得知的資訊', () => {
  it('6 人局天亮：鑑識官、共犯、目擊者、兇手各自的私訊；調查員沒有新私訊；頻道公告天亮', () => {
    const { state, events } = day(6);
    const { means, clue } = state.answer as { means: string; clue: string };
    const sci = dmTo(events, 'p6').join();
    for (const w of ['<@p1>', '<@p2>', means, clue]) expect(sci).toContain(w);
    const acc = dmTo(events, 'p2').join();
    for (const w of ['<@p1>', means, clue]) expect(acc).toContain(w);
    const wit = dmTo(events, 'p3').join();
    expect(wit).toContain('<@p1>');
    expect(wit).toContain('<@p2>');
    expect(wit).toContain('不知道誰是誰');
    expect(wit).not.toContain(means);
    expect(wit).not.toContain(clue);
    expect(dmTo(events, 'p1').join()).toContain(clue);
    expect(dmTo(events, 'p4')).toEqual([]);
    expect(dmTo(events, 'p5')).toEqual([]);
    const dawn = announces(events).find((t) => t.includes('天亮了'))!;
    expect(dawn).toBeDefined();
    for (const w of ['<@p1>', means, clue]) expect(dawn).not.toContain(w);
    expect(state).toMatchObject({ phase: 'evidence', round: 1 });
  });

  it('4 人局只有鑑識官收到兇手和答案', () => {
    const { events } = day(4);
    expect(dmTo(events, 'p4').join()).toContain('<@p1>');
    expect(dmTo(events, 'p2')).toEqual([]);
    expect(dmTo(events, 'p3')).toEqual([]);
  });
});

describe('deception/night: 夜晚逾時', () => {
  it('都沒選 → 兩項都從兇手面前隨機選；頻道不公告逾時', () => {
    const s = started(6).state;
    const { state, events } = run([{ type: 'timeout', id: s.timers.phase! }], s);
    expect(state.answer).toEqual({ means: s.players[0].means[3], clue: s.players[0].clues[3] });
    expect(dmTo(events, 'p1').join()).toContain(s.players[0].clues[3]);
    expect(state.phase).toBe('evidence');
    for (const t of announces(events)) expect(t).not.toMatch(/逾時|時間到/);
  });

  it('選了手段 → 只補線索', () => {
    const s = run([{ type: 'nightMeans', user: 'p1', i: 1 }], started(6).state).state;
    const { state } = run([{ type: 'timeout', id: s.timers.phase! }], s);
    expect(state.answer).toEqual({ means: s.players[0].means[1], clue: s.players[0].clues[3] });
  });

  it('舊計時器被忽略', () => {
    const s = started(6).state;
    const old = run([{ type: 'timeout', id: s.timers.phase! - 1 }], s);
    expect(old.state).toBe(s);
    expect(old.events).toEqual([]);
  });
});
