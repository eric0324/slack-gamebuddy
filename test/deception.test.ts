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

type Partial2 = Record<string, unknown> & { type: DAction['type'] };
type Run = { state: DState; events: GameEvent[] };
const sciOf = (s: DState) => roleOf(s, 'scientist')[0];
const fsAct = (s: DState, a: Partial2, user = sciOf(s)) => run([{ user, pseq: s.pseq, ...a } as DAction], s);
const lineOf = (b: { title: string; options: string[] }, bullet?: number) =>
  `${b.title}：${b.options.map((o, i) => (i === bullet ? `【${o}】` : o)).join('／')}`;
// 第 1 輪：死因、居家地點、4 張場景板都放在第 0 個選項
function placeAll(s: DState): Run {
  const steps: Partial2[] = [
    { type: 'fsPlace', slot: 'cause', opt: 0 },
    { type: 'fsLocation', board: 0, opt: 0 },
    ...[0, 1, 2, 3].map((i) => ({ type: 'fsPlace', slot: `s${i}`, opt: 0 }) as Partial2),
  ];
  let r: Run = { state: s, events: [] };
  for (const a of steps) r = fsAct(r.state, a);
  return r;
}
// 這一輪剩下的人依序按說完了
function speakAll(s: DState): Run {
  let r: Run = { state: s, events: [] };
  for (let k = s.speaker; k < s.speakers.length; k++) r = run([{ type: 'done', user: r.state.speakers[r.state.speaker], tseq: r.state.tseq }], r.state);
  return r;
}
const timeout = (s: DState) => run([{ type: 'timeout', id: s.timers.phase! }], s);
// 第 1 輪發言開始
const present1 = (n = 6) => placeAll(day(n).state);
// 第 2 輪蒐證開始
const evidence2 = (n = 6) => speakAll(present1(n).state);
const shortMsgs = (events: GameEvent[]) => prompts(events).filter((p) => p.audience === 'channel' && !p.ref);

describe('deception/clues: 提示板與回合面板', () => {
  it('第 1 輪場上有死因板、未選的地點板、4 張場景板，都沒有子彈', () => {
    const { state } = day(6);
    expect(state.cause).toEqual({ board: CAUSE_BOARD });
    expect(state.location).toBeUndefined();
    expect(state.scenes.map((x) => x.board)).toEqual(SCENE_BOARDS.slice(0, 4));
    expect(state.scenes.every((x) => x.bullet === undefined)).toBe(true);
  });

  it('面板：第 N/3 輪、階段、提示板一行一張、場上一覽、誰有徽章、三顆按鈕，不含角色', () => {
    const { state, events } = day(6);
    const panel = panels(events).at(-1)!;
    expect(panel.ref).toBe(`deception:panel:${state.pseq}`);
    expect(panel.text).toContain('第 1/3 輪．蒐證');
    expect(panel.text).toContain(lineOf(CAUSE_BOARD));
    expect(panel.text).toContain('案發地點：（還沒選）');
    for (const x of state.scenes) expect(panel.text).toContain(lineOf(x.board));
    expect(panel.text).toContain('場上一覽');
    for (const p of state.players.slice(0, 5)) expect(panel.text).toContain(`<@${p.id}>　手段：${p.means.join('、')}　線索：${p.clues.join('、')}`);
    expect(panel.text).toContain('還有徽章：<@p1> <@p2> <@p3> <@p4> <@p5>');
    expect(values(panel)).toEqual([`fs:${state.pseq}`, 'solve', 'me']);
    expect(labels(panel)).toEqual(['🧪 鑑識官放子彈', '🔍 破案', '🗂️ 我的身分']);
    for (const w of ['🔪', '共犯', '目擊者', '調查員']) expect(panel.text).not.toContain(w);
  });

  it('放子彈的選項用【】標出', () => {
    const { events } = fsAct(day(6).state, { type: 'fsPlace', slot: 'cause', opt: 3 });
    expect(panels(events).at(-1)!.text).toContain('死因：窒息／鈍器重擊／失血過多／【中毒】／急病發作／意外事故');
  });

  it('12 人局面板文字少於 3000 字', () => {
    const { events } = present1(12);
    for (const p of panels(events)) expect(p.text.length).toBeLessThan(3000);
  });
});

describe('deception/clues: 第 1 輪蒐證', () => {
  it('選單只列沒子彈的板；選板後原地換成 6 個選項和「↩️ 換一張」', () => {
    const s = day(6).state;
    const m = menuOf(fsAct(s, { type: 'fsMenu' }).events, 'p6')!;
    expect(m.replace).toBe(true);
    const p = s.pseq;
    expect(values(m)).toEqual([`fb:${p}:cause`, `fb:${p}:loc`, `fb:${p}:s0`, `fb:${p}:s1`, `fb:${p}:s2`, `fb:${p}:s3`]);
    expect(labels(m)).toEqual(['死因', '案發地點（4 選 1）', ...SCENE_BOARDS.slice(0, 4).map((b) => b.title)]);
    const b = menuOf(fsAct(s, { type: 'fsBoard', slot: 'cause' }).events, 'p6')!;
    expect(b.replace).toBe(true);
    expect(values(b)).toEqual([...[0, 1, 2, 3, 4, 5].map((o) => `fp:${p}:cause:${o}`), `fback:${p}`]);
    expect(labels(b)).toEqual([...CAUSE_BOARD.options, '↩️ 換一張']);
    expect(values(menuOf(fsAct(s, { type: 'fsBack' }).events, 'p6'))).toEqual(values(m));
  });

  it('放下子彈：面板原地更新、選單回到第 1 步且少了這張板；不能移動', () => {
    const s = day(6).state;
    const { state, events } = fsAct(s, { type: 'fsPlace', slot: 'cause', opt: 3 });
    expect(state.cause.bullet).toBe(3);
    expect(panels(events).map((x) => x.ref)).toEqual([`deception:panel:${s.pseq}`]);
    expect(values(menuOf(events, 'p6'))).not.toContain(`fb:${s.pseq}:cause`);
    expect(values(menuOf(events, 'p6'))).toHaveLength(5);
    expect(fsAct(state, { type: 'fsPlace', slot: 'cause', opt: 1 }).state).toBe(state);
  });

  it('選地點：4 列各 6 顆，按下同時決定地點板和子彈', () => {
    const s = day(6).state;
    const m = menuOf(fsAct(s, { type: 'fsBoard', slot: 'loc' }).events, 'p6')!;
    expect(m.perRow).toBe(6);
    expect(values(m)).toHaveLength(25);
    expect(values(m)[9]).toBe(`fl:${s.pseq}:1:3`);
    expect(labels(m)[9]).toBe('醫院');
    expect(values(m)[24]).toBe(`fback:${s.pseq}`);
    const { state, events } = fsAct(s, { type: 'fsLocation', board: 1, opt: 3 });
    expect(state.location).toEqual({ board: LOCATION_BOARDS[1], bullet: 3 });
    const text = panels(events).at(-1)!.text;
    expect(text).toContain('案發地點（公共場所）：餐廳／商場／電影院／【醫院】／學校／圖書館');
    expect(text).not.toContain('居家');
    expect(values(menuOf(events, 'p6'))).not.toContain(`fb:${s.pseq}:loc`);
    expect(fsAct(state, { type: 'fsLocation', board: 0, opt: 0 }).state).toBe(state);
  });

  it('非鑑識官被拒', () => {
    const s = day(6).state;
    const r = fsAct(s, { type: 'fsMenu' }, 'p1');
    expect(r.state).toBe(s);
    expect(ephemeralTo(r.events, 'p1').join()).toContain('只有鑑識官可以放子彈');
    expect(fsAct(s, { type: 'fsPlace', slot: 'cause', opt: 0 }, 'p1').state).toBe(s);
  });

  it('6 顆放完進入第 1 輪發言', () => {
    const { state } = present1();
    expect(state).toMatchObject({ phase: 'present', round: 1 });
    expect([state.cause.bullet, state.location?.bullet, ...state.scenes.map((x) => x.bullet)]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('deception/clues: 第 2、3 輪換板', () => {
  it('抽新板；只能換場景板；換掉後新板在原位、面板寫出換掉哪張、進入發言', () => {
    const { state: s, events } = evidence2();
    expect(s).toMatchObject({ phase: 'evidence', round: 2 });
    expect(s.fresh).toEqual(SCENE_BOARDS[4]);
    expect(panels(events).at(-1)!.text).toContain(SCENE_BOARDS[4].title);
    const m = menuOf(fsAct(s, { type: 'fsMenu' }).events, 'p6')!;
    expect(values(m)).toEqual([0, 1, 2, 3].map((i) => `fx:${s.pseq}:s${i}`));
    const swap = menuOf(fsAct(s, { type: 'fsSwap', slot: 's3' }).events, 'p6')!;
    expect(values(swap)).toEqual([...[0, 1, 2, 3, 4, 5].map((o) => `fn:${s.pseq}:s3:${o}`), `fs:${s.pseq}`]);
    expect(labels(swap)).toEqual([...SCENE_BOARDS[4].options, '↩️ 換一張']);
    const r = fsAct(s, { type: 'fsNew', slot: 's3', opt: 2 });
    expect(r.state.scenes[3]).toEqual({ board: SCENE_BOARDS[4], bullet: 2 });
    expect(r.state.scenes.slice(0, 3)).toEqual(s.scenes.slice(0, 3));
    expect(r.state.fresh).toBeUndefined();
    const updated = panels(r.events).find((p) => p.ref === `deception:panel:${s.pseq}`)!;
    expect(updated.text).toContain(`換掉了${SCENE_BOARDS[3].title}`);
    expect(r.state).toMatchObject({ phase: 'present', round: 2 });
  });

  it('第 2 輪不能用第 1 輪的放子彈動作', () => {
    const s = evidence2().state;
    expect(fsAct(s, { type: 'fsPlace', slot: 'cause', opt: 1 }).state).toBe(s);
    expect(fsAct(s, { type: 'fsBoard', slot: 's0' }).state).toBe(s);
  });
});

describe('deception/clues: 蒐證逾時與鑑識官掛機', () => {
  it('第 1 輪放了 4 顆、沒選地點 → 沒放的板沒子彈、不用地點板，公告後進入發言', () => {
    let r: Run = day(6);
    for (const slot of ['cause', 's0', 's1', 's2']) r = fsAct(r.state, { type: 'fsPlace', slot, opt: 1 });
    const { state, events } = timeout(r.state);
    expect(state.scenes[3].bullet).toBeUndefined();
    expect(state.location).toBeUndefined();
    expect(announces(events).join()).toContain('鑑識官時間到，沒放子彈的板沒有提示');
    expect(state.phase).toBe('present');
    expect(panels(events).at(-1)!.text).toContain('案發地點：（沒有使用）');
  });

  it('第 1 輪 0 顆 → 中止、公告答案、沒有 result、沒有再來一局', () => {
    const s = day(6).state;
    const { state, events } = timeout(s);
    expect(state.phase).toBe('ended');
    const text = announces(events).join();
    for (const w of ['鑑識官沒有回應，遊戲中止', '<@p1>', s.answer.means!, s.answer.clue!]) expect(text).toContain(w);
    expect(events.some((e) => e.type === 'result')).toBe(false);
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], state).events).toEqual([]);
  });

  it('第 2 輪逾時不換板並公告', () => {
    const s = evidence2().state;
    const { state, events } = timeout(s);
    expect(state.scenes).toEqual(s.scenes);
    expect(state.fresh).toBeUndefined();
    expect(announces(events).join()).toContain('鑑識官這輪沒有換板');
    expect(state).toMatchObject({ phase: 'present', round: 2 });
  });
});

describe('deception/clues: 發言', () => {
  it('從鑑識官下一位依座位、鑑識官不發言', () => {
    const s = structuredClone(day(5).state);
    const [p3, p5] = [s.players[2], s.players[4]];
    Object.assign(p5, { role: 'investigator', means: p3.means, clues: p3.clues, badge: true });
    Object.assign(p3, { role: 'scientist', means: [], clues: [], badge: false });
    expect(placeAll(s).state.speakers).toEqual(['p4', 'p5', 'p1', 'p2']);
  });

  it('發言開始：新面板和「輪到 @X 發言（90 秒）」短訊息（不帶 ref）', () => {
    const { state, events } = present1();
    expect(state.speakers).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
    const panel = panels(events).at(-1)!;
    expect(panel.ref).toBe(`deception:panel:${state.pseq}`);
    expect(panel.text).toContain('第 1/3 輪．發言');
    expect(panel.text).toContain('輪到 <@p1>');
    expect(values(panel)).toEqual(['solve', 'me']);
    const [msg] = shortMsgs(events);
    expect(msg.text).toBe('輪到 <@p1> 發言（90 秒）');
    expect(values(msg)).toEqual([`done:${state.tseq}`, 'solve']);
    expect(labels(msg)).toEqual(['✅ 說完了', '🔍 破案']);
  });

  it('說完了換人，面板原地更新；別人按說完了回「還沒輪到你」', () => {
    const s = present1().state;
    const r = run([{ type: 'done', user: 'p1', tseq: s.tseq }], s);
    expect(panels(r.events).map((p) => p.ref)).toEqual([`deception:panel:${s.pseq}`]);
    expect(panels(r.events)[0].text).toContain('輪到 <@p2>');
    expect(shortMsgs(r.events).map((p) => p.text)).toEqual(['輪到 <@p2> 發言（90 秒）']);
    const other = run([{ type: 'done', user: 'p3', tseq: s.tseq }], s);
    expect(other.state).toBe(s);
    expect(ephemeralTo(other.events, 'p3')).toEqual(['還沒輪到你。']);
  });

  it('90 秒逾時換人；徽章用掉的人照常發言', () => {
    const s = structuredClone(present1().state);
    s.players[1].badge = false;
    const r = timeout(s);
    expect(r.state.speakers[r.state.speaker]).toBe('p2');
    expect(shortMsgs(r.events).map((p) => p.text)).toEqual(['輪到 <@p2> 發言（90 秒）']);
  });

  it('第 1 輪最後一位說完進入第 2 輪蒐證', () => {
    expect(evidence2().state).toMatchObject({ phase: 'evidence', round: 2 });
  });

  it('舊階段的按鈕回「這個階段已經結束了」且 state 不變', () => {
    const d = day(6).state;
    const s = present1().state;
    const old = run([{ type: 'fsMenu', user: 'p6', pseq: d.pseq }], s);
    expect(old.state).toBe(s);
    expect(ephemeralTo(old.events, 'p6').join()).toContain('這個階段已經結束了');
    const oldDone = run([{ type: 'done', user: 'p1', tseq: s.tseq - 1 }], s);
    expect(oldDone.state).toBe(s);
    expect(ephemeralTo(oldDone.events, 'p1').join()).toContain('這個階段已經結束了');
  });
});
