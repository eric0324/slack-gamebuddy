import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyTaboo, contains, type TAction, type TState } from '../src/taboo.js';
import { TABOO_CARDS } from '../src/tabooCards.js';

// rng 接近 1 時 shuffle 不換位置：分隊 p1 紅、p2 藍、p3 紅、p4 藍…；藍隊先描述；抽卡依詞庫順序
const rng = () => 0.99999;

function run(actions: TAction[], start?: TState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyTaboo(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as TAction),
  ]);
const ephemeralTo = (events: GameEvent[], user: string) =>
  events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) =>
  events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const prompts = (events: GameEvent[], kind = 'taboo') =>
  events.filter((e) => e.type === 'prompt' && e.kind === kind) as Extract<GameEvent, { type: 'prompt' }>[];
const lastTimer = (events: GameEvent[]) => (events.filter((e) => e.type === 'startTimer') as { id: number; ms: number }[]).at(-1)!;
const teamOf = (s: TState, id: string) => s.players.find((p) => p.id === id)!.team;

const started = (n = 4) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state);
// 4 人局：藍隊 p2、p4 先描述，順序 p2 (藍)→ p1 (紅)→ p4 (藍)→ p3 (紅)
const describing = (n = 4) => run([{ type: 'go', user: 'p2' }], started(n).state);

describe('taboo/setup: 禁語的房間', () => {
  it('開房：公告標示禁語', () => {
    const { state, events } = run([{ type: 'new', user: 'A', channel: 'C1' }]);
    expect(state).toMatchObject({ game: 'taboo', host: 'A', phase: 'lobby' });
    expect(events[0]).toMatchObject({ type: 'lobby', title: '禁語', players: ['A'] });
  });

  it('人數不足：至少 4 人', () => {
    const { state, events } = run([{ type: 'start', user: 'p1' }], lobbyWith(3).state);
    expect(state.phase).toBe('lobby');
    expect(ephemeralTo(events, 'p1')!.text).toContain('至少需要 4 人');
  });

  it('房間已滿：最多 12 人', () => {
    const full = run([{ type: 'join', user: 'x' }], lobbyWith(12).state);
    expect(full.state.players).toHaveLength(12);
    expect(ephemeralTo(full.events, 'x')!.text).toContain('房間已滿');
  });

  it('不支援 bot', () => {
    const { events } = run([{ type: 'addBot', user: 'p1', count: 1 }], lobbyWith(4).state);
    expect(ephemeralTo(events, 'p1')!.text).toBe('禁語不支援 bot。');
  });

  it('加入、離開、房主離開取消；非房主不能開始', () => {
    const lobby = lobbyWith(4).state;
    expect(run([{ type: 'leave', user: 'p3' }], lobby).state.players).toHaveLength(3);
    expect(run([{ type: 'leave', user: 'p1' }], lobby).state.phase).toBe('ended');
    const notHost = run([{ type: 'start', user: 'p2' }], lobby);
    expect(notHost.state.phase).toBe('lobby');
    expect(ephemeralTo(notHost.events, 'p2')!.text).toContain('只有房主');
  });

  it('頻道已經有遊戲', () => {
    const { events } = run([{ type: 'new', user: 'x', channel: 'C1' }], started().state);
    expect(ephemeralTo(events, 'x')!.text).toContain('這個頻道已經有遊戲了');
  });
});

describe('taboo/setup: 分隊與描述順序', () => {
  it('隨機分隊，人數相差最多 1 人', () => {
    for (const n of [4, 5, 7, 12]) {
      const s = started(n).state;
      const red = s.players.filter((p) => p.team === 'red').length;
      expect(Math.abs(red * 2 - n)).toBeLessThanOrEqual(1);
    }
  });

  it('4 人：每隊 2 輪，每個人描述一次，兩隊輪流', () => {
    const s = started(4).state;
    expect(s.order).toHaveLength(4);
    expect(new Set(s.order).size).toBe(4);
    expect(s.order.map((id) => teamOf(s, id))).toEqual(['blue', 'red', 'blue', 'red']);
  });

  it('5 人：每隊 3 輪，小隊有人描述兩次', () => {
    const s = started(5).state;
    expect(s.order).toHaveLength(6);
    const teams = s.order.map((id) => teamOf(s, id));
    expect(teams.filter((t) => t === 'red')).toHaveLength(3);
    expect(teams.filter((t) => t === 'blue')).toHaveLength(3);
    for (let i = 1; i < teams.length; i++) expect(teams[i]).not.toBe(teams[i - 1]);
    const reds = s.players.filter((p) => p.team === 'red').map((p) => p.id);
    for (const id of reds) expect(s.order).toContain(id);
  });

  it('開局公告兩隊成員、總輪數和玩法', () => {
    const text = announces(started(4).events).join('\n');
    expect(text).toContain('🔴紅隊');
    expect(text).toContain('🔵藍隊');
    expect(text).toContain('<@p1>');
    expect(text).toContain('共 4 輪');
    expect(text).toContain('90 秒');
  });
});

const cardPrompt = (events: GameEvent[]) => prompts(events).find((p) => p.audience === 'ephemeral');
const C0 = TABOO_CARDS[0];
const C1 = TABOO_CARDS[1];

describe('taboo/rounds: 準備', () => {
  it('每輪公告描述者、隊友和「▶️ 開始」按鈕，60 秒計時', () => {
    const { state, events } = started(4);
    expect(state.phase).toBe('ready');
    const text = announces(events).join('\n');
    expect(text).toContain('第 1／4 輪');
    expect(text).toContain('🔵藍隊 <@p2>');
    expect(text).toContain('<@p4>');
    const go = prompts(events).find((p) => p.audience === 'channel')!;
    expect(go.options).toEqual([{ value: 'go', label: '▶️ 開始' }]);
    expect(lastTimer(events).ms).toBe(60_000);
  });

  it('描述者按開始：90 秒計時，只有描述者看到題目卡，頻道沒有題目詞', () => {
    const { state, events } = describing();
    expect(state.phase).toBe('describe');
    expect(lastTimer(events).ms).toBe(90_000);
    const card = cardPrompt(events)!;
    expect(card.user).toBe('p2');
    expect(card.text).toContain(C0.word);
    for (const t of C0.taboo) expect(card.text).toContain(t);
    expect(card.options).toEqual([{ value: `skip:${state.cardSeq}`, label: '⏭️ 跳過' }]);
    expect(announces(events).join('\n')).not.toContain(C0.word);
  });

  it('不是描述者按開始被拒', () => {
    const { state, events } = run([{ type: 'go', user: 'p1' }], started().state);
    expect(state.phase).toBe('ready');
    expect(ephemeralTo(events, 'p1')!.text).toBe('只有描述者可以開始。');
  });

  it('60 秒沒按：這輪跳過，分數不變，進下一輪', () => {
    const s = started().state;
    const { state, events } = run([{ type: 'timeout', id: s.timers.phase! }], s);
    expect(state.round).toBe(1);
    expect(state.phase).toBe('ready');
    expect(state.scores).toEqual({ red: 0, blue: 0 });
    expect(announces(events).join('\n')).toContain('這輪跳過');
  });

  it('準備階段的頻道訊息忽略', () => {
    const s = started().state;
    const { state, events } = run([{ type: 'chat', user: 'p4', text: C0.word }], s);
    expect(state).toBe(s);
    expect(events).toEqual([]);
  });
});

describe('taboo/rounds: 題目卡', () => {
  it('card 指令：描述者再看一次，其他人被拒', () => {
    const s = describing().state;
    const again = run([{ type: 'card', user: 'p2' }], s);
    expect(cardPrompt(again.events)!.text).toContain(C0.word);
    const other = run([{ type: 'card', user: 'p4' }], s);
    expect(ephemeralTo(other.events, 'p4')!.text).toBe('只有描述者可以看題目卡。');
  });

  it('同一局抽卡不重複，全部用完才重洗', () => {
    let s = describing().state;
    const seen: string[] = [];
    for (let i = 0; i < TABOO_CARDS.length + 3; i++) {
      seen.push(TABOO_CARDS[s.card!].word);
      s = run([{ type: 'skip', user: 'p2' }], s).state;
    }
    expect(new Set(seen.slice(0, TABOO_CARDS.length)).size).toBe(TABOO_CARDS.length);
    expect(seen).toHaveLength(TABOO_CARDS.length + 3);
    expect(s.card).toBeDefined();
  });

  it('連續幾局也不重複：新的一局接著上一局剩下的牌堆抽', () => {
    const first = playGame().state;
    const used = TABOO_CARDS.map((_, i) => i).filter((i) => !first.deck.includes(i));
    expect(used.length).toBeGreaterThan(0);
    for (const action of [{ type: 'rematch' }, { type: 'new' }] as const) {
      const lobby = run([{ ...action, user: 'p3', channel: 'C1' }], first).state;
      expect(lobby.deck).toEqual(first.deck);
      const s = run([...['p1', 'p2', 'p4'].map((u) => ({ type: 'join', user: u }) as TAction), { type: 'start', user: 'p3' }], lobby).state;
      expect(used).not.toContain(run([{ type: 'go', user: s.order[0] }], s).state.card);
    }
  });
});

describe('taboo/rounds: 文字比對', () => {
  it('忽略空白、標點、大小寫和全形；子字串算包含', () => {
    expect(contains('珍珠 奶茶！', '珍珠奶茶')).toBe(true);
    expect(contains('西.瓜', '西瓜')).toBe(true);
    expect(contains('ＩＰＨＯＮＥ', 'iPhone')).toBe(true);
    expect(contains('是火車站嗎', '火車')).toBe(true);
  });

  it('同音字和不相干的字不算', () => {
    expect(contains('下天', '夏天')).toBe(false);
    expect(contains('哈密瓜？', '西瓜')).toBe(false);
  });
});

// 4 人局第 1 輪：藍隊 p2 描述、p4 猜；紅隊 p1、p3 是對手。第一張卡是 C0 (西瓜)
describe('taboo/rounds: 猜中', () => {
  it('隊友的訊息包含題目詞：本隊 +1，公告，換下一張卡', () => {
    const { state, events } = run([{ type: 'chat', user: 'p4', text: `是${C0.word}嗎` }], describing().state);
    expect(state.scores).toEqual({ red: 0, blue: 1 });
    expect(announces(events)).toContain(`✅ <@p4> 猜中「${C0.word}」！🔵藍隊 +1`);
    expect(cardPrompt(events)!.text).toContain(C1.word);
    expect(state.log).toEqual([{ word: C0.word, result: 'correct' }]);
  });

  it('沒猜中：沒有任何回應', () => {
    const s = describing().state;
    const { state, events } = run([{ type: 'chat', user: 'p4', text: '哈密瓜？' }], s);
    expect(state).toBe(s);
    expect(events).toEqual([]);
  });
});

describe('taboo/rounds: 犯規', () => {
  it('描述者說到禁語：對手 +1，公告說到的詞和題目詞，換下一張卡', () => {
    const { state, events } = run([{ type: 'chat', user: 'p2', text: `一種${C0.taboo[0]}` }], describing().state);
    expect(state.scores).toEqual({ red: 1, blue: 0 });
    expect(announces(events)).toContain(`🚨 <@p2> 犯規！說了「${C0.taboo[0]}」，題目是「${C0.word}」。🔴紅隊 +1`);
    expect(cardPrompt(events)!.text).toContain(C1.word);
  });

  it('描述者說到題目詞也算犯規，不算猜中', () => {
    const { state } = run([{ type: 'chat', user: 'p2', text: `${C0.word}啦` }], describing().state);
    expect(state.scores).toEqual({ red: 1, blue: 0 });
    expect(state.log).toEqual([{ word: C0.word, result: 'foul' }]);
  });

  it('沒有犯規：沒有任何回應', () => {
    const s = describing().state;
    const { state, events } = run([{ type: 'chat', user: 'p2', text: '外皮有條紋' }], s);
    expect(state).toBe(s);
    expect(events).toEqual([]);
  });
});

describe('taboo/rounds: 禁用替代字', () => {
  const say = (text: string, user = 'p2') => run([{ type: 'chat', user, text }], describing().state);

  it('描述者用 x 代替文字：犯規，公告用了哪個替代字，換下一張卡', () => {
    const { state, events } = say('老x');
    expect(state.scores).toEqual({ red: 1, blue: 0 });
    expect(announces(events)).toContain(`🚨 <@p2> 犯規！用了「x」代替文字，題目是「${C0.word}」。🔴紅隊 +1`);
    expect(cardPrompt(events)!.text).toContain(C1.word);
    expect(state.log).toEqual([{ word: C0.word, result: 'foul' }]);
  });

  it('大寫或全形也算', () => {
    for (const text of ['失Ｘ', '失X', '失ｘ']) expect(say(text).state.scores, text).toEqual({ red: 1, blue: 0 });
  });

  it('佔位符號也算', () => {
    for (const text of ['老○', '老〇', '老●', '老*', '老＊', '老×', '老✕', '老✖']) expect(say(text).state.scores, text).toEqual({ red: 1, blue: 0 });
  });

  it('英文單字裡的 x 也算', () => {
    expect(say('Netflix 上面有').state.scores).toEqual({ red: 1, blue: 0 });
  });

  it('同時說到禁語：以說到禁語公告', () => {
    expect(announces(say(`x${C0.taboo[0]}`).events).join('\n')).toContain(`說了「${C0.taboo[0]}」`);
  });

  it('隊友不受限制：不算犯規也不算猜中', () => {
    const s = describing().state;
    expect(run([{ type: 'chat', user: 'p4', text: 'x' }], s).state).toBe(s);
  });
});

describe('taboo/rounds: 忽略的訊息', () => {
  it('對手隊和旁觀者說出題目詞也沒有回應', () => {
    const s = describing().state;
    for (const user of ['p1', 'p3', 'Z']) {
      const { state, events } = run([{ type: 'chat', user, text: C0.word }], s);
      expect(state).toBe(s);
      expect(events).toEqual([]);
    }
  });
});

describe('taboo/rounds: 跳過', () => {
  it('按鈕跳過：對手 +1，公告題目詞，換下一張卡', () => {
    const s = describing().state;
    const { state, events } = run([{ type: 'skip', user: 'p2', seq: s.cardSeq }], s);
    expect(state.scores).toEqual({ red: 1, blue: 0 });
    expect(announces(events)).toContain(`⏭️ 跳過「${C0.word}」。🔴紅隊 +1`);
    expect(cardPrompt(events)!.text).toContain(C1.word);
  });

  it('指令跳過 (沒有流水號) 跳目前的卡', () => {
    const { state } = run([{ type: 'skip', user: 'p2' }], describing().state);
    expect(state.log).toEqual([{ word: C0.word, result: 'skip' }]);
  });

  it('按到舊卡的跳過被拒，目前的卡不變', () => {
    const first = describing().state;
    const s = run([{ type: 'chat', user: 'p4', text: C0.word }], first).state;
    const { state, events } = run([{ type: 'skip', user: 'p2', seq: first.cardSeq }], s);
    expect(state).toBe(s);
    expect(ephemeralTo(events, 'p2')!.text).toBe('這張卡已經結束了。');
  });

  it('不是描述者被拒', () => {
    const s = describing().state;
    const { state, events } = run([{ type: 'skip', user: 'p4' }], s);
    expect(state).toBe(s);
    expect(ephemeralTo(events, 'p4')!.text).toBe('只有描述者可以跳過。');
  });
});

const timeout = (s: TState): TAction => ({ type: 'timeout', id: s.timers.phase! });

// 從準備階段玩完一輪：描述者按開始、做 actions (拿到目前的 state 決定)、時間到
function playRound(s: TState, actions: (s: TState) => TAction[] = () => []) {
  let r = run([{ type: 'go', user: s.order[s.round] }], s);
  for (const a of actions(r.state)) r = run([a], r.state);
  return run([timeout(r.state)], r.state);
}

describe('taboo/rounds: 一輪結束', () => {
  it('時間到：進行中的卡不計分，公告這輪結果和總分，進下一輪準備', () => {
    const s = started().state;
    const { state, events } = playRound(s, (x) => [
      { type: 'chat', user: 'p4', text: TABOO_CARDS[x.card!].word },
      { type: 'skip', user: 'p2' },
      { type: 'chat', user: 'p2', text: TABOO_CARDS[x.card! + 2].taboo[1] },
    ]);
    expect(state.scores).toEqual({ red: 2, blue: 1 });
    expect(state.round).toBe(1);
    expect(state.phase).toBe('ready');
    const text = announces(events).join('\n');
    expect(text).toContain(`✅ 猜中：${C0.word}`);
    expect(text).toContain(`🚨 犯規：${TABOO_CARDS[2].word}`);
    expect(text).toContain(`⏭️ 跳過：${C1.word}`);
    expect(text).toContain('這輪：🔴紅隊 +2、🔵藍隊 +1');
    expect(text).toContain('總分：🔴紅隊 2｜🔵藍隊 1');
    expect(text).not.toContain(TABOO_CARDS[3].word);
    expect(text).toContain('第 2／4 輪');
  });

  it('舊的計時器被忽略', () => {
    const ready = started().state;
    const desc = run([{ type: 'go', user: 'p2' }], ready).state;
    const { state, events } = run([{ type: 'timeout', id: ready.timers.phase! }], desc);
    expect(state).toBe(desc);
    expect(events).toEqual([]);
  });
});

function playGame(scorer?: string) {
  let r = started(4);
  while (r.state.phase !== 'ended') {
    r = playRound(r.state, (x) => (scorer && x.order[x.round] === 'p1' ? [{ type: 'chat', user: scorer, text: TABOO_CARDS[x.card!].word }] : []));
  }
  return r;
}

describe('taboo/rounds: 勝負與結束', () => {
  it('分數高的隊伍獲勝：公告比分和兩隊成員，送出 result，有再來一局', () => {
    const { state, events } = playGame('p3');
    expect(state.phase).toBe('ended');
    expect(state.winner).toBe('red');
    const text = announces(events).join('\n');
    expect(text).toContain('🎉 🔴紅隊獲勝！');
    expect(text).toContain('🔴紅隊 1｜🔵藍隊 0');
    expect(text).toContain('<@p2>');
    const result = events.find((e) => e.type === 'result') as { players: string[]; winners: string[] };
    expect([...result.players].sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect([...result.winners].sort()).toEqual(['p1', 'p3']);
    expect(prompts(events, 'rematch')).toHaveLength(1);
  });

  it('同分平手：winners 是空的', () => {
    const { state, events } = playGame();
    expect(state.winner).toBe('tie');
    expect(announces(events).join('\n')).toContain('🤝 平手！');
    expect(events.find((e) => e.type === 'result')).toMatchObject({ winners: [] });
  });

  it('再來一局：上一局玩家才能按，新房主是按的人', () => {
    const ended = playGame().state;
    const outsider = run([{ type: 'rematch', user: 'Z', channel: 'C1' }], ended);
    expect(ephemeralTo(outsider.events, 'Z')!.text).toContain('只有上一局的玩家');
    const again = run([{ type: 'rematch', user: 'p3', channel: 'C1' }], ended);
    expect(again.state).toMatchObject({ phase: 'lobby', host: 'p3', players: [{ id: 'p3' }] });
  });

  it('房主取消：公告目前比分，沒有 result 也沒有再來一局', () => {
    const s = run([{ type: 'chat', user: 'p4', text: C0.word }], describing().state).state;
    const { state, events } = run([{ type: 'cancel', user: 'p1' }], s);
    expect(state.phase).toBe('ended');
    expect(announces(events).join('\n')).toContain('🔴紅隊 0｜🔵藍隊 1');
    expect(events.some((e) => e.type === 'result')).toBe(false);
    expect(prompts(events, 'rematch')).toHaveLength(0);
    expect(run([{ type: 'rematch', user: 'p2', channel: 'C1' }], state).state).toBe(state);
  });

  it('非房主取消被拒', () => {
    const s = describing().state;
    const { state, events } = run([{ type: 'cancel', user: 'p2' }], s);
    expect(state).toBe(s);
    expect(ephemeralTo(events, 'p2')!.text).toContain('只有房主');
  });
});
