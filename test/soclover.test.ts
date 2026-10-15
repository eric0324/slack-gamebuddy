import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applySoclover, faceWord, leafPairs, ratingFor, type SCAction, type SCState } from '../src/soclover.js';

// rng 固定 0.99999 時：洗牌不改順序、每張卡方向都是 3
const rng = () => 0.99999;

function run(actions: SCAction[], start?: SCState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applySoclover(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as SCAction),
  ]);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) =>
  events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) =>
  events.filter((e) => e.type === 'prompt' && e.kind === 'soclover') as Extract<GameEvent, { type: 'prompt' }>[];
const dms = (events: GameEvent[], to: string) => events.filter((e) => e.type === 'dm' && e.to === to).map((e) => (e as { text: string }).text);
const lastTimerMs = (events: GameEvent[]) => (events.filter((e) => e.type === 'startTimer') as { ms: number }[]).at(-1)!.ms;
const started = (n: number, r: () => number = rng) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state, r);

describe('soclover/setup: 四葉草的房間', () => {
  it('開房：公告標示四葉草', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'soclover', host: 'A', phase: 'lobby' });
    expect(events[0]).toMatchObject({ type: 'lobby', title: '四葉草', players: ['A'] });
  });

  it('人數：至少 3 人、最多 6 人', () => {
    const two = run([{ type: 'start', user: 'p1' }], lobbyWith(2).state);
    expect(two.state.phase).toBe('lobby');
    expect(ephemeralTo(two.events, 'p1')!.text).toContain('至少需要 3 人');
    expect(started(3).state.phase).toBe('clue');
    const full = run([{ type: 'join', user: 'x' }], lobbyWith(6).state);
    expect(full.state.players).toHaveLength(6);
    expect(ephemeralTo(full.events, 'x')!.text).toContain('房間已滿');
  });

  it('不支援 bot', () => {
    for (const type of ['addBot', 'removeBot'] as const) {
      const { events } = run([{ type, user: 'p1', count: 1 }], lobbyWith(3).state);
      expect(ephemeralTo(events, 'p1')!.text).toBe('四葉草不支援 bot。');
    }
  });

  it('加入、離開、房主離開取消、取消；非房主不能開始；頻道已有遊戲', () => {
    const lobby = lobbyWith(3).state;
    expect(run([{ type: 'leave', user: 'p3' }], lobby).state.players).toHaveLength(2);
    expect(run([{ type: 'leave', user: 'p1' }], lobby).state.phase).toBe('ended');
    expect(run([{ type: 'cancel', user: 'p1' }], lobby).state.phase).toBe('ended');
    const notHost = run([{ type: 'start', user: 'p2' }], lobby);
    expect(notHost.state.phase).toBe('lobby');
    expect(ephemeralTo(notHost.events, 'p2')).toBeDefined();
    expect(ephemeralTo(run([{ type: 'new', user: 'x', channel: 'C1' }], lobby).events, 'x')!.text).toContain('已經有遊戲');
  });
});

describe('soclover/setup: 四葉草的結構', () => {
  it('旋轉：[海, 火, 鐘, 山] 轉 1 次後上山、右海、下火、左鐘', () => {
    const card = ['海', '火', '鐘', '山'];
    expect([0, 1, 2, 3].map((d) => faceWord(card, 0, d))).toEqual(['海', '火', '鐘', '山']);
    expect([0, 1, 2, 3].map((d) => faceWord(card, 1, d))).toEqual(['山', '海', '火', '鐘']);
  });

  it('葉子：上 = 格1上＋格2上、右 = 格2右＋格4右、下 = 格3下＋格4下、左 = 格1左＋格3左', () => {
    const cards = [
      ['a0', 'a1', 'a2', 'a3'],
      ['b0', 'b1', 'b2', 'b3'],
      ['c0', 'c1', 'c2', 'c3'],
      ['d0', 'd1', 'd2', 'd3'],
    ];
    expect(leafPairs(cards, [0, 0, 0, 0])).toEqual([
      ['a0', 'b0'],
      ['b1', 'd1'],
      ['c2', 'd2'],
      ['a3', 'c3'],
    ]);
    expect(leafPairs(cards, [1, 0, 0, 0])[0]).toEqual(['a3', 'b0']);
    expect(leafPairs([cards[0], null, null, null], [0, 0, 0, 0])).toEqual([
      ['a0', '？'],
      ['？', '？'],
      ['？', '？'],
      ['a3', '？'],
    ]);
  });
});

describe('soclover/setup: 詞卡與發卡', () => {
  it('每人 4 張卡 + 1 張干擾卡；6 人局 120 個詞都不重複', () => {
    const { state } = started(6);
    const words: string[] = [];
    for (const p of state.players) {
      const clover = state.clovers[p.id];
      expect(clover.cards).toHaveLength(4);
      expect(clover.rot).toHaveLength(4);
      for (const card of [...clover.cards, clover.decoy]) {
        expect(card).toHaveLength(4);
        words.push(...card);
      }
    }
    expect(words).toHaveLength(120);
    expect(new Set(words).size).toBe(120);
  });

  it('隨機方向：方向在 0～3', () => {
    const { state } = started(3, () => 0.3);
    for (const p of state.players) for (const r of state.clovers[p.id].rot) expect([0, 1, 2, 3]).toContain(r);
  });

  it('開局公告座位順序', () => {
    const text = announces(started(3).events).join('\n');
    expect(text).toContain('<@p1> → <@p2> → <@p3>');
  });
});

const CLUES = ['夏天', '速度', '童年', '冰冷'];
const clue = (user: string, texts: string[] = CLUES): SCAction => ({ type: 'clue', user, texts });
const timeout = (s: SCState) => run([{ type: 'timeout', id: s.timers.phase! }], s);

describe('soclover/rounds: 寫提示', () => {
  it('私訊自己的四葉草：4 片葉子的詞對、4 格朝外的詞', () => {
    const { state, events } = started(3);
    const clover = state.clovers.p1;
    const [top, right, bottom, left] = leafPairs(clover.cards, clover.rot);
    const text = dms(events, 'p1').join('\n');
    expect(text).toContain(`⬆️ 上葉：${top[0]} ＋ ${top[1]}`);
    expect(text).toContain(`➡️ 右葉：${right[0]} ＋ ${right[1]}`);
    expect(text).toContain(`⬇️ 下葉：${bottom[0]} ＋ ${bottom[1]}`);
    expect(text).toContain(`⬅️ 左葉：${left[0]} ＋ ${left[1]}`);
    expect(text).toContain(`↖ 格1〔⬆️${faceWord(clover.cards[0], clover.rot[0], 0)} ⬅️${faceWord(clover.cards[0], clover.rot[0], 3)}〕`);
    expect(dms(events, 'p2').join('\n')).not.toContain(top[0]);
  });

  it('頻道有寫提示按鈕，5 分鐘計時', () => {
    const { events } = started(3);
    expect(prompts(events).at(-1)!.options.map((o) => o.value)).toEqual(['clue']);
    expect(events.filter((e) => e.type === 'startTimer').at(-1)).toMatchObject({ ms: 300_000 });
  });

  it('openClue：4 欄視窗，標籤是葉子的詞對；不在遊戲中的人被拒', () => {
    const s = started(3).state;
    const { events } = run([{ type: 'openClue', user: 'p2' }], s);
    const [top] = leafPairs(s.clovers.p2.cards, s.clovers.p2.rot);
    const modal = events.find((e) => e.type === 'modal') as Extract<GameEvent, { type: 'modal' }>;
    expect(modal).toMatchObject({ to: 'p2', kind: 'socloverClue' });
    expect(modal.fields).toHaveLength(4);
    expect(modal.fields![0]).toBe(`⬆️ 上葉：${top[0]} ＋ ${top[1]}`);
    const x = run([{ type: 'openClue', user: 'x' }], s);
    expect(x.events.some((e) => e.type === 'modal')).toBe(false);
    expect(ephemeralTo(x.events, 'x')).toBeDefined();
  });

  it('送出：只讓本人看到已送出，頻道公告進度但不公開內容；不能修改', () => {
    const s = started(3).state;
    const { state, events } = run([clue('p1')], s);
    expect(state.clovers.p1.clues).toEqual(CLUES);
    expect(ephemeralTo(events, 'p1')!.text).toContain('已送出');
    const text = announces(events).join('\n');
    expect(text).toContain('<@p1> 已寫好提示（1／3）');
    expect(text).not.toContain('夏天');
    expect(ephemeralTo(run([{ type: 'openClue', user: 'p1' }], state).events, 'p1')!.text).toContain('你已經送出了');
    const again = run([clue('p1', ['a', 'b', 'c', 'd'])], state);
    expect(again.state.clovers.p1.clues).toEqual(CLUES);
    expect(ephemeralTo(again.events, 'p1')!.text).toContain('你已經送出了');
  });

  it('提示要剛好 4 個、1～15 字、不能和自己卡上的詞相同', () => {
    const s = started(3).state;
    const own = s.clovers.p1.cards[2][1];
    for (const texts of [['a', 'b', 'c'], ['a', '', 'c', 'd'], ['a', 'b', 'c', '一二三四五六七八九十一二三四五六'], ['a', own, 'c', 'd']]) {
      const r = run([clue('p1', texts)], s);
      expect(r.state.clovers.p1.clues).toBeUndefined();
      expect(ephemeralTo(r.events, 'p1')).toBeDefined();
    }
    expect(run([clue('p1', [' a ', 'b', 'c', 'd'])], s).state.clovers.p1.clues).toEqual(['a', 'b', 'c', 'd']);
  });

  it('全部送出提早進入排卡', () => {
    const { state } = run([clue('p1'), clue('p2'), clue('p3')], started(3).state);
    expect(state.phase).toBe('place');
  });

  it('超時：沒送出的四葉草跳過', () => {
    const s = run([clue('p1'), clue('p2')], started(3).state).state;
    const { state, events } = timeout(s);
    expect(state.phase).toBe('place');
    expect(state.queue).toEqual(['p1', 'p2']);
    expect(announces(events).join('\n')).toContain('<@p3> 沒有寫完提示，這片四葉草跳過、0 分');
  });

  it('沒有人寫：直接結束，總分 0，仍送出戰績結果', () => {
    const { state, events } = timeout(started(3).state);
    expect(state.phase).toBe('ended');
    expect(events.find((e) => e.type === 'result')).toEqual({ type: 'result', players: ['p1', 'p2', 'p3'], winners: [], score: 0 });
  });
});

// 三人都寫好提示：依序排 p1、p2、p3；手上卡A～D 就是作者格1～4 的卡（方向也對），卡E 是干擾卡
const placing = () => run([clue('p1'), clue('p2'), clue('p3')], started(3).state);
type Op = Extract<SCAction, { type: 'board' }>['op'];
const act = (s: SCState, user: string, op: Op, n?: number) => run([{ type: 'board', user, seq: s.seq, op, n }], s);
// 擺放者依序操作
function ops(s: SCState, user: string, list: [Op, number?][]) {
  let r = { state: s, events: [] as GameEvent[] };
  for (const [op, n] of list) r = act(r.state, user, op, n);
  return r;
}
const ALL_RIGHT: [Op, number?][] = [['card', 0], ['card', 1], ['card', 2], ['card', 3], ['submit']];

describe('soclover/rounds: 一起排卡', () => {
  it('開盤：5 張卡含干擾卡、4 格空、選格1、同一則訊息的盤面', () => {
    const { state, events } = placing();
    const b = state.board!;
    const cl = state.clovers.p1;
    expect(b.hand).toEqual([...cl.cards, cl.decoy]);
    expect(b.slots).toEqual([null, null, null, null]);
    expect(b).toMatchObject({ sel: 0, attempt: 1, placer: 'p2' });
    const p = prompts(events).at(-1)!;
    expect(p).toMatchObject({ audience: 'channel', ref: `soclover:${state.seq}`, perRow: 5 });
    expect(p.options.map((o) => o.value)).toEqual([
      ...[0, 1, 2, 3].map((i) => `${state.seq}:slot:${i}`),
      `${state.seq}:rotate`,
      ...[0, 1, 2, 3, 4].map((i) => `${state.seq}:card:${i}`),
      `${state.seq}:back`,
      `${state.seq}:submit`,
      `${state.seq}:take`,
    ]);
    expect(p.options.map((o) => o.label).slice(0, 6)).toEqual(['▶格1', '格2', '格3', '格4', '🔄 旋轉', '卡A']);
    expect(p.text).toContain('第 1／3 片：<@p1> 的四葉草（第 1 次）・擺放者 <@p2>');
    expect(p.text).toContain('⬆️ 上葉「夏天」：？ ＋ ？');
    expect(p.text).toContain(`卡E ${[0, 1, 2, 3].map((d) => faceWord(cl.decoy, b.rot[4], d)).join('→')}`);
  });

  it('隨機方向：手上的卡方向在 0～3', () => {
    const s = run([clue('p1'), clue('p2'), clue('p3')], started(3, () => 0.3).state, () => 0.3).state;
    for (const r of s.board!.rot) expect([0, 1, 2, 3]).toContain(r);
  });

  it('擺放者是作者的下一位，C 的四葉草由 A 擺放', () => {
    const one = ops(placing().state, 'p2', ALL_RIGHT).state;
    expect(one.board).toMatchObject({ placer: 'p3' });
    const two = ops(one, 'p3', ALL_RIGHT).state;
    expect(two.board).toMatchObject({ placer: 'p1' });
  });

  it('不是擺放者、作者、不在遊戲中的人被拒；換我排', () => {
    const s = placing().state;
    const other = act(s, 'p3', 'slot', 1);
    expect(other.state.board!.sel).toBe(0);
    expect(ephemeralTo(other.events, 'p3')!.text).toContain('現在由 <@p2> 擺放，可以按 🙋 換我排接手');
    for (const op of ['card', 'take'] as const) expect(ephemeralTo(act(s, 'p1', op, 0).events, 'p1')!.text).toContain('這是你的四葉草，請保持安靜讓大家猜');
    expect(ephemeralTo(act(s, 'x', 'take').events, 'x')).toBeDefined();
    const taken = act(s, 'p3', 'take');
    expect(taken.state.board!.placer).toBe('p3');
    expect(prompts(taken.events).at(-1)!.text).toContain('擺放者 <@p3>');
    expect(ephemeralTo(act(taken.state, 'p2', 'slot', 1).events, 'p2')).toBeDefined();
  });

  it('放卡後跳到下一個空格；盤面用同一個 ref 更新', () => {
    const s = placing().state;
    const { state, events } = act(s, 'p2', 'card', 2);
    expect(state.board!.slots).toEqual([2, null, null, null]);
    expect(state.board!.sel).toBe(1);
    expect(prompts(events).at(-1)!.ref).toBe(`soclover:${s.seq}`);
    expect(prompts(events).at(-1)!.text).toContain('↖ 格1：卡C');
  });

  it('交換、換掉格裡的卡回手上、拿回手上', () => {
    let s = ops(placing().state, 'p2', [['card', 2], ['card', 0], ['slot', 0], ['card', 0]]).state;
    expect(s.board!.slots).toEqual([0, 2, null, null]);
    s = ops(s, 'p2', [['slot', 0], ['card', 3]]).state; // 格1 換成卡D，卡A 回手上
    expect(s.board!.slots).toEqual([3, 2, null, null]);
    s = ops(s, 'p2', [['slot', 1], ['back']]).state;
    expect(s.board!.slots).toEqual([3, null, null, null]);
  });

  it('旋轉：順時針 90 度；空格被拒', () => {
    const s = act(placing().state, 'p2', 'card', 0).state;
    const r0 = s.board!.rot[0];
    const rotated = ops(s, 'p2', [['slot', 0], ['rotate']]);
    expect(rotated.state.board!.rot[0]).toBe((r0 + 1) % 4);
    const empty = act(s, 'p2', 'rotate'); // 選的格是格2，空的
    expect(ephemeralTo(empty.events, 'p2')!.text).toContain('這一格還沒有卡');
  });

  it('還沒排滿不能送出；舊盤面被拒', () => {
    const s = ops(placing().state, 'p2', [['card', 0], ['card', 1], ['card', 2]]).state;
    const r = act(s, 'p2', 'submit');
    expect(r.state.board!.attempt).toBe(1);
    expect(ephemeralTo(r.events, 'p2')!.text).toContain('4 格都要放卡才能送出');
    const next = ops(s, 'p2', [['card', 3], ['submit']]).state;
    const old = run([{ type: 'board', user: 'p3', seq: s.seq, op: 'slot', n: 1 }], next);
    expect(ephemeralTo(old.events, 'p3')!.text).toContain('這個盤面已經結束了');
  });
});

describe('soclover/rounds: 兩次機會與計分', () => {
  it('第一次全對得 6 分，公告正確擺法、干擾卡、得分和總分，接著排下一片', () => {
    const s = placing().state;
    const cl = s.clovers.p1;
    const { state, events } = ops(s, 'p2', ALL_RIGHT);
    expect(state.score).toBe(6);
    expect(state.cur).toBe(1);
    const text = announces(events).join('\n');
    expect(text).toContain('🎉 第一次就全對！+6');
    expect(text).toContain(`↖ 格1：卡A〔⬆️${faceWord(cl.cards[0], cl.rot[0], 0)} ⬅️${faceWord(cl.cards[0], cl.rot[0], 3)}〕`);
    expect(text).toContain('⬆️ 上葉「夏天」：');
    expect(text).toContain('干擾卡：卡E');
    expect(text).toContain('總分 6');
    expect(prompts(events).at(-1)!.text).toContain('<@p2> 的四葉草');
  });

  it('方向錯算錯；沒全對時對的鎖住、錯的回手上，進入第 2 次', () => {
    const s = ops(placing().state, 'p2', [['card', 0], ['card', 1], ['card', 2], ['card', 3], ['slot', 0], ['rotate'], ['submit']]);
    const b = s.state.board!;
    expect(b).toMatchObject({ attempt: 2, slots: [null, 1, 2, 3], locked: [false, true, true, true], sel: 0 });
    expect(s.state.score).toBe(0);
    expect(announces(s.events).join('\n')).toContain('對了 3 張');
    expect(prompts(s.events).at(-1)!.ref).toBe(`soclover:${s.state.seq}`);
    expect(prompts(s.events).at(-1)!.text).toContain('（第 2 次）');
  });

  it('鎖住的卡不能換、轉、拿回', () => {
    const s = ops(placing().state, 'p2', [['card', 0], ['card', 1], ['card', 2], ['card', 3], ['slot', 0], ['rotate'], ['submit']]).state;
    for (const list of [[['slot', 1], ['rotate']], [['slot', 1], ['back']], [['slot', 1], ['card', 0]], [['slot', 0], ['card', 1]]] as [Op, number?][][]) {
      const r = ops(s, 'p2', list);
      expect(r.state.board!.slots).toEqual([null, 1, 2, 3]);
      expect(ephemeralTo(r.events, 'p2')!.text).toContain('這張卡已經確定了');
    }
  });

  it('第 2 次得盤面上對的張數（含鎖住的）', () => {
    // 卡C、卡D 放反：對 2 張；第 2 次放對卡D、格4 放干擾卡：共 3 張
    const first = ops(placing().state, 'p2', [['card', 0], ['card', 1], ['card', 3], ['card', 2], ['submit']]).state;
    expect(first.board).toMatchObject({ attempt: 2, slots: [0, 1, null, null], sel: 2 });
    const { state, events } = ops(first, 'p2', [['card', 2], ['card', 4], ['submit']]);
    expect(state.score).toBe(3);
    expect(announces(events).join('\n')).toContain('這片 +3');
  });

  it('超時以目前盤面送出：第 1 次沒全對進第 2 次；第 2 次空格算錯', () => {
    const one = ops(placing().state, 'p2', [['card', 0], ['card', 1]]).state;
    expect(lastTimerMs(placing().events)).toBe(240_000);
    const second = timeout(one).state;
    expect(second.board).toMatchObject({ attempt: 2, slots: [0, 1, null, null], locked: [true, true, false, false] });
    const placed = ops(second, 'p2', [['card', 3]]).state; // 卡D 放在格3：錯
    const { state } = timeout(placed);
    expect(state.score).toBe(2);
    expect(state.cur).toBe(1);
  });
});

describe('soclover/rounds: 結束與評價', () => {
  const finish = () => ops(ops(ops(placing().state, 'p2', ALL_RIGHT).state, 'p3', ALL_RIGHT).state, 'p1', ALL_RIGHT);

  it('全部排完：公告總分／滿分和評價、送出戰績結果、再來一局', () => {
    const { state, events } = finish();
    expect(state.phase).toBe('ended');
    expect(events.find((e) => e.type === 'result')).toEqual({ type: 'result', players: ['p1', 'p2', 'p3'], winners: [], score: 18 });
    const text = announces(events).join('\n');
    expect(text).toContain('全隊總分 18／18');
    expect(text).toContain('🍀 完美的四葉草，幸運滿點！');
    expect(events.some((e) => e.type === 'prompt' && e.kind === 'rematch')).toBe(true);
  });

  it('評價邊界：100／85／70／50／30／0%', () => {
    expect(ratingFor(24, 24)).toBe('🍀 完美的四葉草，幸運滿點！');
    expect(ratingFor(23, 24)).toBe('🌈 心有靈犀，默契絕佳');
    expect(ratingFor(18, 24)).toBe('😎 很有默契！');
    expect(ratingFor(12, 24)).toBe('🙂 還不錯，算是好朋友');
    expect(ratingFor(11, 24)).toBe('🤔 有點默契，還要再磨合');
    expect(ratingFor(7, 24)).toBe('🌧️ 今天的幸運草沒有開花');
    expect(ratingFor(17, 20)).toBe('🌈 心有靈犀，默契絕佳');
    expect(ratingFor(14, 20)).toBe('😎 很有默契！');
    expect(ratingFor(6, 20)).toBe('🤔 有點默契，還要再磨合');
  });

  it('滿分含被跳過的四葉草', () => {
    const s = run([clue('p1'), clue('p2')], started(3).state).state;
    const after = timeout(s).state;
    const { events } = ops(ops(after, 'p2', ALL_RIGHT).state, 'p3', ALL_RIGHT);
    expect(announces(events).join('\n')).toContain('全隊總分 12／18');
  });

  it('再來一局只有上一局玩家', () => {
    const ended = finish().state;
    expect(ephemeralTo(run([{ type: 'rematch', user: 'x', channel: 'C1' }], ended).events, 'x')!.text).toContain('只有上一局的玩家');
    expect(run([{ type: 'rematch', user: 'p2', channel: 'C1' }], ended).state).toMatchObject({ phase: 'lobby', host: 'p2' });
  });

  it('排卡中取消：公布這片的正確擺法，沒有戰績結果、沒有再來一局', () => {
    const s = placing().state;
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], s);
    expect(state.phase).toBe('ended');
    expect(events.some((e) => e.type === 'result')).toBe(false);
    const text = announces(events).join('\n');
    expect(text).toContain('房主已取消遊戲');
    expect(text).toContain('<@p1> 的正確擺法');
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], state).events).toEqual([]);
  });
});
