import { describe, expect, it } from 'vitest';
import { isBot, type GameEvent } from '../src/engine.js';
import { applyMeme, type MemeAction, type MemeState } from '../src/meme.js';
import { MEME_CARDS } from '../src/memeCards.js';
import { MEME_IMAGES } from '../src/memeImages.js';

const rng = () => 0.99999; // 洗牌不動：牌庫照 MEME_CARDS 的順序，梗圖照 MEME_IMAGES 的順序

function run(actions: MemeAction[], start?: MemeState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyMeme(state, action, r);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1' },
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as MemeAction),
  ]);
const started = (n: number) => run([{ type: 'start', user: 'p1' }], lobbyWith(n).state);
const ephemeralTo = (events: GameEvent[], user: string) => events.find((e) => e.type === 'ephemeral' && e.to === user) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce') as Extract<GameEvent, { type: 'announce' }>[];
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const boards = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'meme' && p.audience === 'channel');
const menu = (events: GameEvent[], user: string) => prompts(events).find((p) => p.audience === 'ephemeral' && p.user === user);
const player = (s: MemeState, id: string) => s.players.find((p) => p.id === id)!;

// 每個人都出第 1 張手牌
const allPlay = (s: MemeState) => run(s.players.filter((p) => !isBot(p.id) && !p.answer).map((p) => ({ type: 'play', user: p.id, seq: s.seq, card: 0 }) as MemeAction), s);
// 投票：答案依玩家順序 (rng 不洗動)；votes[i] 是第 i 位玩家投的答案 index
const voteAll = (s: MemeState, votes: Record<string, number>) =>
  run(Object.entries(votes).map(([user, n]) => ({ type: 'vote', user, seq: s.seq, n }) as MemeAction), s);
// 每人投下一位玩家的答案，玩完一輪
const playRound = (s: MemeState) => {
  const a = allPlay(s);
  const n = a.state.players.length;
  return voteAll(a.state, Object.fromEntries(a.state.players.filter((p) => !isBot(p.id)).map((p) => [p.id, (a.state.answers.findIndex((x) => x.by === p.id) + 1) % n])));
};

describe('meme/setup: 房間與 bot', () => {
  it('3～8 人：人數不足、房間已滿', () => {
    const two = run([{ type: 'start', user: 'p1' }], lobbyWith(2).state);
    expect(ephemeralTo(two.events, 'p1')!.text).toContain('至少需要 3 人');
    const full = run([{ type: 'join', user: 'p9' }], lobbyWith(8).state);
    expect(ephemeralTo(full.events, 'p9')!.text).toContain('房間已滿');
  });

  it('房間公告標題是梗圖大亂鬥；房主離開就取消', () => {
    const lobby = lobbyWith(2);
    expect(lobby.events).toContainEqual(expect.objectContaining({ type: 'lobby', title: '梗圖大亂鬥' }));
    const left = run([{ type: 'leave', user: 'p1' }], lobby.state);
    expect(left.state.phase).toBe('ended');
    expect(announces(left.events)[0].text).toContain('取消');
  });

  it('addbot 超過 8 人只加到滿；非房主被拒', () => {
    const r = run([{ type: 'addBot', user: 'p1', count: 3 }], lobbyWith(7).state);
    expect(r.state.players).toHaveLength(8);
    expect(ephemeralTo(r.events, 'p1')!.text).toContain('房間已滿');
    const no = run([{ type: 'addBot', user: 'p2', count: 1 }], lobbyWith(2).state);
    expect(ephemeralTo(no.events, 'p2')!.text).toContain('只有房主');
  });
});

describe('meme/setup: 開局', () => {
  it('每人 7 張不重複的手牌，公告 6 輪和規則，貼第 1 輪梗圖和配圖訊息，計時 90 秒', () => {
    const { state, events } = started(4);
    const hands = state.players.flatMap((p) => p.hand);
    expect(state.players.every((p) => p.hand.length === 7)).toBe(true);
    expect(new Set(hands).size).toBe(28);
    expect(player(state, 'p1').hand).toEqual(MEME_CARDS.slice(0, 7));
    const texts = announces(events).map((a) => a.text);
    expect(texts[0]).toContain('6 輪');
    for (const s of ['手牌', '自己寫', '不能投自己', '1 票', '總分最高']) expect(texts[0]).toContain(s);
    expect(announces(events)[1]).toMatchObject({ image: { url: MEME_IMAGES[0].url, alt: MEME_IMAGES[0].name } });
    expect(announces(events)[1].text).toContain('第 1/6 輪');
    expect(announces(events)[1].text).toContain(MEME_IMAGES[0].name);
    const board = boards(events).at(-1)!;
    expect(board.options.map((o) => o.label)).toEqual(['🃏 我的手牌', '✍️ 自己寫']);
    expect(board.text).toContain('已送出 0/4');
    expect(events).toContainEqual(expect.objectContaining({ type: 'startTimer', ms: 90_000 }));
  });
});

describe('meme/rounds: 配圖', () => {
  it('我的手牌：只給本人 7 張按鈕', () => {
    const s = started(3).state;
    const r = run([{ type: 'hand', user: 'p2' }], s);
    const m = menu(r.events, 'p2')!;
    expect(m.options.map((o) => o.label)).toEqual(player(s, 'p2').hand);
    expect(m.options[0].value).toBe(`play:${s.seq}:0`);
    expect(ephemeralTo(run([{ type: 'hand', user: 'x' }], s).events, 'x')!.text).toContain('不在');
  });

  it('出手牌：成為答案、補回 7 張、只有本人看到已送出、進度用同一個 ref 更新', () => {
    const s = started(3).state;
    const card = player(s, 'p2').hand[2];
    const r = run([{ type: 'play', user: 'p2', seq: s.seq, card: 2 }], s);
    const me = player(r.state, 'p2');
    expect(me.answer).toEqual({ text: card, own: false });
    expect(me.hand).toHaveLength(7);
    expect(me.hand).not.toContain(card);
    expect(ephemeralTo(r.events, 'p2')!.text).toContain('✅ 已送出');
    const board = boards(r.events)[0];
    expect(board.ref).toBe(boards(started(3).events).at(-1)!.ref);
    expect(board.text).toContain('已送出 1/3');
  });

  it('自己寫：去掉前後空白、手牌不變；按鈕會開視窗', () => {
    const s = started(3).state;
    const r = run([{ type: 'write', user: 'p2', text: '  當 PM 說需求不會再改 ' }], s);
    expect(player(r.state, 'p2').answer).toEqual({ text: '當 PM 說需求不會再改', own: true });
    expect(player(r.state, 'p2').hand).toEqual(player(s, 'p2').hand);
    const open = run([{ type: 'openWrite', user: 'p2' }], s);
    expect(open.events).toContainEqual(expect.objectContaining({ type: 'modal', to: 'p2', kind: 'memeWrite' }));
  });

  it('重複送出、空白、41 字、手上沒有的牌、過期的選單、不在遊戲都被拒，state 不變', () => {
    const s = run([{ type: 'write', user: 'p2', text: '哈哈' }], started(3).state).state;
    const cases: [MemeAction, string, string][] = [
      [{ type: 'play', user: 'p2', seq: s.seq, card: 0 }, 'p2', '已經送出'],
      [{ type: 'write', user: 'p3', text: '   ' }, 'p3', '40'],
      [{ type: 'write', user: 'p3', text: '字'.repeat(41) }, 'p3', '40'],
      [{ type: 'play', user: 'p3', seq: s.seq, card: 7 }, 'p3', '沒有這張'],
      [{ type: 'play', user: 'p3', seq: s.seq - 1, card: 0 }, 'p3', '過期'],
      [{ type: 'write', user: 'x', text: '哈' }, 'x', '不在'],
    ];
    for (const [action, user, text] of cases) {
      const r = run([action], s);
      expect(r.state, text).toBe(s);
      expect(ephemeralTo(r.events, user)!.text, text).toContain(text);
    }
  });

  it('最後一位送出就立刻投票', () => {
    const r = allPlay(started(3).state);
    expect(r.state.phase).toBe('vote');
  });

  it('時間到：沒送出的人系統從手牌隨機出一張並公告，進入投票', () => {
    const s = run([{ type: 'write', user: 'p1', text: '哈' }], started(3).state).state;
    const r = run([{ type: 'timeout', id: s.timers.phase! }], s);
    expect(r.state.phase).toBe('vote');
    expect(player(r.state, 'p2').answer).toEqual({ text: player(s, 'p2').hand[6], own: false });
    expect(player(r.state, 'p2').hand).toHaveLength(7);
    const text = announces(r.events).map((a) => a.text).join('\n');
    expect(text).toContain('⌛ <@p2>');
    expect(text).toContain('<@p3>');
    expect(text).not.toContain('<@p1> 沒送出');
  });

  it('牌庫用完時把出過的牌洗回牌庫', () => {
    const s = started(3).state;
    const used = [...s.deck];
    const r = run([{ type: 'play', user: 'p1', seq: s.seq, card: 0 }], { ...s, deck: [], used });
    expect(player(r.state, 'p1').hand).toHaveLength(7);
    expect(r.state.deck.length + r.state.used.length).toBe(used.length); // 抽走一張、出的那張進 used
  });
});

describe('meme/rounds: 投票與揭曉', () => {
  it('投票訊息：字母列出答案，不顯示作者和 ✍️，進度只算真人', () => {
    const s = run([{ type: 'addBot', user: 'p1', count: 1 }, { type: 'start', user: 'p1' }], lobbyWith(3).state).state;
    const a = run([{ type: 'write', user: 'p1', text: '我寫的梗' }, { type: 'play', user: 'p2', seq: s.seq, card: 0 }, { type: 'play', user: 'p3', seq: s.seq, card: 0 }], s);
    const board = boards(a.events).at(-1)!;
    expect(board.text).toContain('A. 我寫的梗');
    expect(board.text).not.toContain('<@p1>');
    expect(board.text).not.toContain('✍️');
    expect(board.text).toContain('已投 0/3');
    expect(board.options.map((o) => o.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(board.ref).not.toBe(boards(started(3).events).at(-1)!.ref);
    expect(a.events).toContainEqual(expect.objectContaining({ type: 'startTimer', ms: 60_000 }));
  });

  it('投票只讓本人看到、不能投自己、可以改票且不改進度', () => {
    const s = allPlay(started(3).state).state;
    const v = run([{ type: 'vote', user: 'p1', seq: s.seq, n: 1 }], s);
    expect(ephemeralTo(v.events, 'p1')!.text).toContain('你投了 B');
    expect(boards(v.events)[0].text).toContain('已投 1/3');
    const self = run([{ type: 'vote', user: 'p1', seq: s.seq, n: 0 }], s);
    expect(self.state).toBe(s);
    expect(ephemeralTo(self.events, 'p1')!.text).toContain('不能投自己');
    const again = run([{ type: 'vote', user: 'p1', seq: s.seq, n: 2 }], v.state);
    expect(player(again.state, 'p1').vote).toBe(2);
    expect(boards(again.events)[0].text).toContain('已投 1/3');
  });

  it('全部真人投完就揭曉：依票數排序、標作者和 ✍️、每票 +1、投票訊息沒有按鈕', () => {
    let s = started(4).state;
    s = run([
      { type: 'write', user: 'p2', text: '自己寫的' },
      { type: 'play', user: 'p1', seq: s.seq, card: 0 },
      { type: 'play', user: 'p3', seq: s.seq, card: 0 },
      { type: 'play', user: 'p4', seq: s.seq, card: 0 },
    ], s).state;
    // 答案順序：p1、p2、p3、p4。p1 得 2 票、p2 得 1 票、p4 得 1 票
    const r = voteAll(s, { p1: 3, p2: 0, p3: 0, p4: 1 });
    expect(boards(r.events)[0]).toMatchObject({ ref: `meme:${s.seq}`, options: [] });
    const text = announces(r.events)[0].text;
    const order = ['<@p1>', '<@p2>', '<@p4>', '<@p3>'].map((m) => text.indexOf(m));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(text).toMatch(/自己寫的.*✍️/);
    expect(text).toContain('2 票');
    expect(r.state.players.map((p) => p.score)).toEqual([2, 1, 0, 1]);
    expect(r.state.round).toBe(2);
    expect(announces(r.events)[1].image?.url).toBe(MEME_IMAGES[1].url);
  });

  it('60 秒到就揭曉，沒投的人當棄權', () => {
    const s = allPlay(started(3).state).state;
    const v = run([{ type: 'vote', user: 'p1', seq: s.seq, n: 1 }], s);
    const r = run([{ type: 'timeout', id: v.state.timers.phase! }], v.state);
    expect(r.state.players.map((p) => p.score)).toEqual([0, 1, 0]);
  });
});

describe('meme/rounds: 結束', () => {
  const playAll = (s: MemeState) => {
    let r = { state: s, events: [] as GameEvent[] };
    const images: string[] = [];
    for (let i = 0; i < 6; i++) {
      images.push(r.state.images[r.state.round - 1].url);
      r = playRound(r.state);
    }
    return { ...r, images };
  };

  it('6 輪後結束：排名、同分並列、result、再來一局；整局梗圖不重複', () => {
    const r = playAll(started(3).state); // 每人都投下一位，每輪各 +1：三人同分
    expect(r.state.phase).toBe('ended');
    expect(new Set(r.images).size).toBe(6);
    expect(r.state.players.map((p) => p.score)).toEqual([6, 6, 6]);
    expect(r.events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3'], winners: ['p1', 'p2', 'p3'] });
    expect(announces(r.events).at(-1)!.text).toContain('獲勝');
    expect(prompts(r.events).at(-1)!.kind).toBe('rematch');
  });

  it('最高分的人獲勝', () => {
    let s = started(3).state;
    for (let i = 0; i < 6; i++) s = voteAll(allPlay(s).state, { p1: 1, p2: 0, p3: 0 }).state;
    expect(s.winners).toEqual(['p1']);
  });

  it('房主取消不送 result', () => {
    const r = run([{ type: 'cancel', user: 'p1' }], started(3).state);
    expect(r.state.phase).toBe('ended');
    expect(r.events.some((e) => e.type === 'result')).toBe(false);
  });
});

describe('meme/bots: bot 出牌與投票', () => {
  const withBots = () => run([{ type: 'addBot', user: 'p1', count: 2 }, { type: 'start', user: 'p1' }], lobbyWith(1).state);

  it('配圖開始時 bot 已經出了手牌，進度包含 bot', () => {
    const { state, events } = withBots();
    for (const p of state.players.filter((x) => isBot(x.id))) {
      expect(p.answer?.own).toBe(false);
      expect(p.hand).toHaveLength(7);
    }
    expect(boards(events).at(-1)!.text).toContain('已送出 2/3');
  });

  it('投票開始時每個 bot 都投了不是自己的答案；一個真人加兩個 bot 能玩完 6 輪', () => {
    let s = withBots().state;
    const a = run([{ type: 'play', user: 'p1', seq: s.seq, card: 0 }], s);
    for (const p of a.state.players.filter((x) => isBot(x.id))) {
      expect(p.vote).toBeDefined();
      expect(a.state.answers[p.vote!].by).not.toBe(p.id);
    }
    s = withBots().state;
    for (let i = 0; i < 6; i++) {
      const v = run([{ type: 'play', user: 'p1', seq: s.seq, card: 0 }], s).state;
      s = run([{ type: 'vote', user: 'p1', seq: v.seq, n: 1 }], v).state;
    }
    expect(s.phase).toBe('ended');
    expect(s.winners!.length).toBeGreaterThan(0);
  });
});

describe('meme/setup: 每局最多 2 張投稿梗圖', () => {
  const custom = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, url: `https://x/${i + 1}.png`, name: `投稿${i + 1}`, by: `u${i + 1}` }));
  const startWith = (n: number) => run([{ type: 'start', user: 'p1', custom: custom(n) }], lobbyWith(3).state);
  const fromCustom = (s: MemeState) => s.images.filter((m) => m.by).length;

  it('5 張投稿：剛好 2 輪；1 張：1 輪；沒有：0 輪；6 輪都不重複', () => {
    expect(fromCustom(startWith(5).state)).toBe(2);
    expect(fromCustom(startWith(1).state)).toBe(1);
    expect(fromCustom(startWith(0).state)).toBe(0);
    expect(fromCustom(started(3).state)).toBe(0);
    for (const n of [0, 1, 5]) {
      const imgs = startWith(n).state.images;
      expect(imgs).toHaveLength(6);
      expect(new Set(imgs.map((m) => m.url)).size).toBe(6);
    }
  });

  it('投稿的位置是隨機的', () => {
    const seqs = [0.1, 0.5, 0.9].map((x) => {
      let i = 0;
      const r = () => [x, 0.3, 0.7, 0.2, 0.99999][i++ % 5];
      return run([{ type: 'start', user: 'p1', custom: custom(2) }], lobbyWith(3).state, r).state.images.map((m) => !!m.by).join();
    });
    expect(new Set(seqs).size).toBeGreaterThan(1);
  });

  it('投稿那一輪的公告標示投稿者並顯示圖片', () => {
    const { state, events } = startWith(2); // rng 不洗動：投稿排在前面
    expect(state.images[0]).toEqual({ name: '投稿1', url: 'https://x/1.png', by: 'u1' });
    const round = announces(events)[1];
    expect(round.text).toContain('投稿1 (<@u1> 投稿)');
    expect(round.image).toEqual({ url: 'https://x/1.png', alt: '投稿1' });
  });
});
