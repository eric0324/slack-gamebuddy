import { describe, expect, it } from 'vitest';
import { applyEmoji, emojiCount, isEmojiOnly, type EAction, type EState } from '../src/emoji.js';
import { EMOJI_PROMPTS } from '../src/emojiPrompts.js';
import { type GameEvent } from '../src/engine.js';

describe('emoji/rounds: Emoji 格式', () => {
  it.each([
    ['🧋 ⚫ ⚫'],
    ['🧋　⚫⚫'], // 全形空白
    [':bubble_tea: 🐻 :wave::skin-tone-3:'],
    [':+1: :e-mail: :man\'s_shoe:'],
    ['👨‍👩‍👧 🇹🇼 1️⃣'],
    ['❤'], // 沒有變體選擇符
    ['☺️'],
    ['👍🏽'],
  ])('接受「%s」', (text) => {
    expect(isEmojiOnly(text)).toBe(true);
  });

  it.each([[''], ['   　'], ['🧋奶茶'], ['boba 🧋'], ['1 🧋'], ['1'], ['#'], ['<3'], ['🧋！'], ['🧋.'], [':abc'], [':珍奶:'], [':Bubble_Tea:'], ['ㄅ🧋']])(
    '拒絕「%s」',
    (text) => {
      expect(isEmojiOnly(text)).toBe(false);
    },
  );

  it('ZWJ 組合、國旗、keycap、shortcode 各算 1 個', () => {
    expect(emojiCount('👨‍👩‍👧 🇹🇼 1️⃣')).toBe(3);
    expect(emojiCount(':wave::skin-tone-3: 🧋')).toBe(3);
    expect(emojiCount('🧋奶茶')).toBeNull();
  });

  it('最多 20 個', () => {
    expect(isEmojiOnly('👨‍👩‍👧'.repeat(20))).toBe(true);
    expect(isEmojiOnly('🧋'.repeat(21))).toBe(false);
    expect(isEmojiOnly(':cat:'.repeat(21))).toBe(false);
  });
});

// ---- engine ----
const rng = () => 0.99999; // 洗牌不動：題目照 EMOJI_PROMPTS 的順序
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];

function run(actions: EAction[], start?: EState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyEmoji(state, action, rng);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([{ type: 'new', user: 'A', channel: 'C1' }, ...NAMES.slice(1, n).map((user) => ({ type: 'join', user }) as EAction)]);
const started = (n = 4) => run([{ type: 'start', user: 'A' }], lobbyWith(n).state);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.filter((e) => e.type === 'ephemeral' && e.to === user).map((e) => (e as { text: string }).text);
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const boards = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'emoji' && p.audience === 'channel');
const channelText = (events: GameEvent[]) => [...announces(events), ...boards(events).map((b) => b.text)].join('\n');
const promptOf = (s: EState, user: string) => EMOJI_PROMPTS[s.chains.find((ch) => ch.owner === user)!.prompt];

describe('emoji/setup: Emoji 傳話的房間', () => {
  it('房間公告標題是 Emoji 傳話', () => {
    expect(lobbyWith(1).events).toContainEqual(expect.objectContaining({ type: 'lobby', title: 'Emoji 傳話', host: 'A' }));
  });

  it('人數不足：至少 4 人', () => {
    const { state, events } = run([{ type: 'start', user: 'A' }], lobbyWith(3).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'A')[0]).toContain('至少需要 4 人');
  });

  it('房間已滿：最多 10 人', () => {
    const full = run([{ type: 'join', user: 'Z' }], lobbyWith(10).state);
    expect(full.state.players).toHaveLength(10);
    expect(ephemeralTo(full.events, 'Z')[0]).toContain('房間已滿');
  });

  it('不支援 bot', () => {
    for (const type of ['addBot', 'removeBot'] as const) {
      const { events } = run([{ type, user: 'A', count: 1 }], lobbyWith(4).state);
      expect(ephemeralTo(events, 'A')[0]).toBe('Emoji 傳話不支援 bot。');
    }
  });

  it('頻道已經有遊戲', () => {
    const { events } = run([{ type: 'new', user: 'Z', channel: 'C1' }], started().state);
    expect(ephemeralTo(events, 'Z')[0]).toContain('這個頻道已經有遊戲了');
  });
});

describe('emoji/setup: 開局與發題', () => {
  it('4 人開局：公告傳遞順序、4 步和規則摘要，沒有題目，開始第 1 步', () => {
    const { state, events } = started(4);
    const text = announces(events).join('\n');
    expect(text).toContain('<@A> → <@B> → <@C> → <@D> → <@A>');
    expect(text).toContain('共 4 步');
    expect(text).toContain('最佳 emoji');
    expect(text).toContain('最神猜測');
    expect(text).toContain('+1 分');
    expect(state.players.map((p) => p.score)).toEqual([0, 0, 0, 0]);
    expect(state.chains.map((ch) => ch.owner)).toEqual(['A', 'B', 'C', 'D']);
    expect(new Set(state.chains.map((ch) => ch.prompt)).size).toBe(4);
    for (const user of ['A', 'B', 'C', 'D']) expect(channelText(events)).not.toContain(promptOf(state, user));
    expect(state).toMatchObject({ phase: 'play', step: 1, steps: 4 });
    expect(boards(events).at(-1)!.text).toContain('第 1／4 步');
  });

  it.each([
    [4, 4],
    [5, 4],
    [6, 6],
    [7, 6],
    [10, 10],
  ])('%i 人共 %i 步', (n, k) => {
    expect(started(n).state.steps).toBe(k);
  });
});

describe('emoji/setup: 題庫不重複', () => {
  // 大家都不交 → 第 1 步就中止，題目已經發過
  const abort = (s: EState) => run([{ type: 'timeout', id: s.timers.phase! }], s).state;
  const dealt = (s: EState) => s.chains.map((ch) => ch.prompt);

  it('同一局題目不重複', () => {
    expect(new Set(dealt(started(10).state)).size).toBe(10);
  });

  it('連續幾局也不重複：新的一局接著上一局剩下的題目', () => {
    const first = started(4).state;
    const ended = abort(first);
    const lobby = run([{ type: 'new', user: 'B', channel: 'C1' }], ended).state;
    expect(lobby.deck).toEqual(ended.deck);
    const joins = ['A', 'C', 'D'].map((user) => ({ type: 'join', user }) as EAction);
    const second = run([...joins, { type: 'start', user: 'B' }], lobby).state;
    for (const p of dealt(second)) expect(dealt(first)).not.toContain(p);
  });

  it('剩下的題目不夠：先發完剩下的，再從重洗的題庫補足，互不重複', () => {
    const lobby = { ...lobbyWith(6).state, deck: [5, 6] };
    const s = run([{ type: 'start', user: 'A' }], lobby).state;
    expect(dealt(s).slice(0, 2)).toEqual([5, 6]);
    expect(new Set(dealt(s)).size).toBe(6);
    expect(s.deck).not.toContain(5);
    expect(s.deck).toHaveLength(EMOJI_PROMPTS.length - 6);
  });
});

// 依序執行，收集全部 events
function runAll(actions: EAction[], start: EState) {
  let state = start;
  const events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyEmoji(state, action, rng);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
const send = (user: string, text: string): EAction => ({ type: 'send', user, text });
const timeout = (s: EState): EAction => ({ type: 'timeout', id: s.timers.phase! });
const ids = (s: EState) => s.players.map((p) => p.id);
// 這一步大家都交（texts 可以指定某人的內容，null 表示不交）；預設 emoji 步交 🐱、猜測步交「貓」
function stepAll(s: EState, texts: Record<string, string | null> = {}) {
  const def = s.step % 2 ? '🐱' : '貓';
  const actions = ids(s)
    .filter((u) => texts[u] !== null)
    .map((u) => send(u, texts[u] ?? def));
  const r = runAll(actions, s);
  return r.state.step === s.step && r.state.phase === 'play' ? run([timeout(r.state)], r.state).state : r.state;
}
const sees = (s: EState, user: string) => ephemeralTo(run([{ type: 'openSend', user }], s).events, user)[0];

describe('emoji/rounds: 鏈的傳遞', () => {
  it('4 人的第 1 條鏈依序由 A、B、C、D 作答，emoji 和猜測交替', () => {
    let s = started(4).state;
    while (s.phase === 'play') s = stepAll(s);
    expect(s.chains[0].entries.map((e) => [e.by, e.kind])).toEqual([
      ['A', 'emoji'],
      ['B', 'guess'],
      ['C', 'emoji'],
      ['D', 'guess'],
    ]);
  });

  it('5 人不會傳回自己：A 的鏈由 A、B、C、D 作答，E 不會碰到', () => {
    let s = started(5).state;
    while (s.phase === 'play') s = stepAll(s);
    expect(s.chains[0].entries.map((e) => e.by)).toEqual(['A', 'B', 'C', 'D']);
    for (const ch of s.chains) expect(new Set(ch.entries.map((e) => e.by)).size).toBe(ch.entries.length);
  });

  it('emoji 步拿最近的文字、猜測步只看得到 emoji', () => {
    const s0 = started(4).state;
    expect(sees(s0, 'A')).toBe(`你拿到：${promptOf(s0, 'A')}，請只用 emoji 描述`);
    const s1 = stepAll(s0, { A: '🧋⚫⚫' });
    expect(sees(s1, 'B')).toBe('你拿到：🧋⚫⚫，請猜這是什麼');
    const s2 = stepAll(s1, { B: '黑糖珍奶' });
    expect(sees(s2, 'C')).toBe('你拿到：黑糖珍奶，請只用 emoji 描述');
    const s3 = stepAll(s2, { C: '🍬🟤🥛' });
    expect(sees(s3, 'D')).toBe('你拿到：🍬🟤🥛，請猜這是什麼');
  });
});

describe('emoji/rounds: 作答', () => {
  it('步驟公告：第幾步、類型、秒數、作答按鈕、已交 N/M', () => {
    const { state, events } = started(4);
    const board = boards(events).at(-1)!;
    expect(board.text).toMatch(/第 1／4 步：🎨[\s\S]*90 秒[\s\S]*已交 0\/4/);
    expect(board.options).toEqual([{ value: 'send', label: '✍️ 作答' }]);
    const { events: e2 } = run([send('A', '貓')], stepAll(state));
    expect(boards(e2).at(-1)!.text).toMatch(/第 2／4 步：🧠[\s\S]*60 秒[\s\S]*已交 1\/4/);
  });

  it('「✍️ 作答」私下顯示拿到的內容並打開視窗', () => {
    const { events } = run([{ type: 'openSend', user: 'B' }], started(4).state);
    expect(ephemeralTo(events, 'B')[0]).toContain('你拿到：');
    expect(events).toContainEqual(expect.objectContaining({ type: 'modal', to: 'B', kind: 'emojiSend' }));
    expect(boards(events)).toHaveLength(0);
  });

  it('交 emoji：私下看到已收到，頻道更新已交 1/4（同一則），沒有內容', () => {
    const first = started(4);
    const { state, events } = run([send('A', '🧋 ⚫⚫')], first.state);
    expect(ephemeralTo(events, 'A')[0]).toBe('已收到：🧋 ⚫⚫');
    expect(boards(events).at(-1)!.text).toContain('已交 1/4');
    expect(boards(events).at(-1)!.ref).toBe(boards(first.events).at(-1)!.ref);
    expect(channelText(events)).not.toContain('🧋');
    expect(state.pending).toEqual({ A: '🧋 ⚫⚫' });
  });

  it('改答案：作品是最後一次，已交人數不變', () => {
    const { state, events } = runAll([send('A', '🧋'), send('A', '🧋⚫⚫')], started(4).state);
    expect(state.pending.A).toBe('🧋⚫⚫');
    expect(channelText(events)).not.toContain('已交 2/4');
  });

  it('emoji 格式不對被拒，作品不變', () => {
    const s = run([send('A', '🐱')], started(4).state).state;
    for (const text of ['🧋奶茶', 'boba 🧋', '1 🧋', '<3', ':珍奶:', '  ', '🐱'.repeat(21)]) {
      const { state, events } = run([send('A', text)], s);
      expect(state.pending.A).toBe('🐱');
      expect(ephemeralTo(events, 'A')[0]).toMatch(/只能用 emoji[\s\S]*:shortcode:[\s\S]*最多 20 個/);
    }
  });

  it('猜測 1～30 字，太長或空白被拒', () => {
    const s = stepAll(started(4).state);
    const ok = run([send('B', '  黑糖珍奶 ')], s);
    expect(ephemeralTo(ok.events, 'B')[0]).toBe('已收到：黑糖珍奶');
    expect(ok.state.pending.B).toBe('黑糖珍奶');
    for (const text of ['猜'.repeat(31), '   ']) {
      const { state, events } = run([send('B', text)], s);
      expect(state).toBe(s);
      expect(ephemeralTo(events, 'B')[0]).toContain('1～30');
    }
  });

  it('作品去掉前後空白後照原樣保存', () => {
    const s = run([send('A', ' :bubble_tea: 🐻 ')], started(4).state).state;
    expect(s.pending.A).toBe(':bubble_tea: 🐻');
  });

  it('全員交完提前進下一步；時間到也進下一步', () => {
    const s = started(4).state;
    expect(runAll(['A', 'B', 'C', 'D'].map((u) => send(u, '🐱')), s).state.step).toBe(2);
    const one = run([send('A', '🐱')], s).state;
    expect(one.step).toBe(1);
    expect(run([timeout(one)], one).state.step).toBe(2);
  });

  it('公布之前頻道沒有任何題目或作品', () => {
    const s0 = started(4);
    const r = runAll(
      [...['A', 'B', 'C', 'D'].map((u) => send(u, '🧋')), ...['A', 'B', 'C', 'D'].map((u) => send(u, '黑糖珍奶')), ...['A', 'B', 'C'].map((u) => send(u, '🍬'))],
      s0.state,
    );
    const text = channelText([...s0.events, ...r.events]);
    for (const x of ['🧋', '黑糖珍奶', '🍬', ...s0.state.chains.map((ch) => EMOJI_PROMPTS[ch.prompt])]) expect(text).not.toContain(x);
  });

  it('不是玩家、不在作答時間被拒', () => {
    const s = started(4).state;
    expect(ephemeralTo(run([send('Z', '🐱')], s).events, 'Z')[0]).toContain('你不在這局遊戲裡');
    expect(ephemeralTo(run([{ type: 'openSend', user: 'Z' }], s).events, 'Z')[0]).toContain('你不在這局遊戲裡');
    expect(ephemeralTo(run([send('A', '🐱')], lobbyWith(4).state).events, 'A')[0]).toContain('現在不是作答的時間');
  });
});

describe('emoji/rounds: 沒交與跳過', () => {
  it('emoji 步沒交：下一位拿到最近的 emoji，記為沒交', () => {
    let s = stepAll(started(4).state, { A: '🧋⚫⚫' });
    s = stepAll(s, { B: '黑糖珍奶' });
    s = stepAll(s, { C: null });
    expect(s.chains[0].entries[2]).toEqual({ step: 3, by: 'C', kind: 'emoji' });
    expect(sees(s, 'D')).toBe('你拿到：🧋⚫⚫，請猜這是什麼');
  });

  it('猜測步沒交：下一位拿到最近的文字（起點題目）', () => {
    let s = stepAll(started(4).state);
    s = stepAll(s, { B: null });
    expect(sees(s, 'C')).toBe(`你拿到：${promptOf(s, 'A')}，請只用 emoji 描述`);
  });

  it('第 1 步就沒交：第 2 步這條鏈跳過，私下提示休息、送出被拒、分母少 1', () => {
    const s = runAll(['B', 'C', 'D'].map((u) => send(u, '🐱')), started(4).state).state;
    const { state, events } = run([timeout(s)], s);
    expect(boards(events).at(-1)!.text).toContain('已交 0/3');
    expect(sees(state, 'B')).toContain('上一位沒交，這一步你休息');
    const rejected = run([send('B', '貓')], state);
    expect(rejected.state).toBe(state);
    expect(ephemeralTo(rejected.events, 'B')[0]).toContain('這一步你休息');
    const done = runAll(['C', 'D', 'A'].map((u) => send(u, '貓')), state).state;
    expect(done.step).toBe(3);
    expect(done.chains[0].entries.map((e) => e.step)).toEqual([1]);
  });

  it('整步沒有人交：公告中止，沒有 result、沒有再來一局', () => {
    for (const s of [started(4).state, stepAll(stepAll(started(4).state))]) {
      const { state, events } = run([timeout(s)], s);
      expect(state.phase).toBe('ended');
      expect(announces(events).join('\n')).toContain('這一步沒有人交，遊戲中止');
      expect(events.some((e) => e.type === 'result')).toBe(false);
      expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
      expect(run([{ type: 'rematch', user: 'A', channel: 'C1' }], state).events).toEqual([]);
    }
  });

  it('舊計時器被忽略', () => {
    const s = started(4).state;
    const old = timeout(s);
    const next = runAll(['A', 'B', 'C', 'D'].map((u) => send(u, '🐱')), s).state;
    const { state, events } = run([old], next);
    expect(state).toBe(next);
    expect(events).toEqual([]);
  });
});
