import { describe, expect, it } from 'vitest';
import { type GameEvent } from '../src/engine.js';
import { applyDixit, type DixitAction, type DixitState } from '../src/dixit.js';
import { MEME_IMAGES } from '../src/memeImages.js';
import { dixit } from '../src/games/dixit.js';

const rng = () => 0.99999; // 洗牌不動：牌庫照 MEME_IMAGES 的順序；桌上的牌是說書人的牌在前，其他人照加入順序

function run(actions: DixitAction[], start?: DixitState, r: () => number = rng) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyDixit(state, action, r);
    state = result.state;
    events = [...events, ...result.events];
  }
  return { state: state!, events };
}

const lobbyWith = (n: number) =>
  run([{ type: 'new', user: 'p1', channel: 'C1' }, ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as DixitAction)]);
const started = (n: number, custom?: { url: string; name: string; by: string }[]) => run([{ type: 'start', user: 'p1', custom }], lobbyWith(n).state);
const ephemeralTo = (events: GameEvent[], user: string) => events.filter((e) => e.type === 'ephemeral' && e.to === user).at(-1) as { text: string } | undefined;
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce') as Extract<GameEvent, { type: 'announce' }>[];
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const boards = (events: GameEvent[]) => prompts(events).filter((p) => p.kind === 'dixit' && p.audience === 'channel');
const menu = (events: GameEvent[], user: string) => prompts(events).find((p) => p.audience === 'ephemeral' && p.user === user);
const player = (s: DixitState, id: string) => s.players.find((p) => p.id === id)!;
const urls = (s: DixitState) => [...s.deck, ...s.players.flatMap((p) => p.hand)].map((c) => c.url);

describe('dixit/setup: 房間', () => {
  it('3～8 人：人數不足、房間已滿', () => {
    const two = run([{ type: 'start', user: 'p1' }], lobbyWith(2).state);
    expect(ephemeralTo(two.events, 'p1')!.text).toContain('至少需要 3 人');
    expect(two.state.phase).toBe('lobby');
    const full = run([{ type: 'join', user: 'p9' }], lobbyWith(8).state);
    expect(ephemeralTo(full.events, 'p9')!.text).toContain('房間已滿');
  });

  it('不支援 bot', () => {
    const r = run([{ type: 'addBot', user: 'p1', count: 1 }], lobbyWith(2).state);
    expect(ephemeralTo(r.events, 'p1')!.text).toContain('妙語說書人不支援 bot');
    expect(r.state.players).toHaveLength(2);
  });

  it('房間公告標題是妙語說書人；頻道已經有遊戲；房主開始前離開就取消', () => {
    const lobby = lobbyWith(2);
    expect(lobby.events).toContainEqual(expect.objectContaining({ type: 'lobby', title: '妙語說書人' }));
    const busy = run([{ type: 'new', user: 'p3', channel: 'C1' }], lobby.state);
    expect(ephemeralTo(busy.events, 'p3')!.text).toContain('這個頻道已經有遊戲了');
    const left = run([{ type: 'leave', user: 'p1' }], lobby.state);
    expect(left.state.phase).toBe('ended');
    expect(announces(left.events)[0].text).toContain('取消');
  });
});

describe('dixit/setup: 牌庫與發牌', () => {
  it('合併內建與投稿，網址重複只算一張', () => {
    const custom = [
      { url: 'https://x.com/a.png', name: '老闆', by: 'U9' },
      { url: 'https://x.com/b.png', name: '同事', by: 'U8' },
      { url: MEME_IMAGES[3].url, name: '重複', by: 'U7' },
    ];
    const { state } = started(4, custom);
    expect(urls(state)).toHaveLength(MEME_IMAGES.length + 2);
    expect(new Set(urls(state)).size).toBe(MEME_IMAGES.length + 2);
    expect(state.deck.find((c) => c.url === 'https://x.com/a.png')).toEqual({ url: 'https://x.com/a.png', by: 'U9' });
  });

  it('沒有投稿：牌庫只有內建梗圖，牌不帶名稱', () => {
    const { state } = started(4);
    expect(new Set(urls(state))).toEqual(new Set(MEME_IMAGES.map((m) => m.url)));
    expect(state.deck[0]).toEqual({ url: MEME_IMAGES[24].url });
  });

  it('4 人每人 6 張、3 人每人 7 張，所有手牌不重複', () => {
    const four = started(4).state;
    expect(four.players.every((p) => p.hand.length === 6)).toBe(true);
    expect(new Set(four.players.flatMap((p) => p.hand.map((c) => c.url))).size).toBe(24);
    expect(player(four, 'p1').hand.map((c) => c.url)).toEqual(MEME_IMAGES.slice(0, 6).map((m) => m.url));
    const three = started(3).state;
    expect(three.players.every((p) => p.hand.length === 7)).toBe(true);
  });

  it('開局公告玩家、說書人順序和規則摘要，第 1 輪說書人是房主，計時 120 秒', () => {
    const { state, events } = started(4);
    const rules = announces(events)[0].text;
    expect(rules).toContain('<@p1> → <@p2> → <@p3> → <@p4>');
    for (const s of ['提示', '0 分', '2 分', '3 分', '1 票', '20 分', '牌庫']) expect(rules).toContain(s);
    expect(rules).not.toContain('出 2 張');
    expect(state.phase).toBe('clue');
    expect(state.round).toBe(1);
    expect(state.teller).toBe(0);
    const board = boards(events).at(-1)!;
    expect(board.text).toContain('第 1 輪，說書人是 <@p1>');
    expect(board.text).toContain('120 秒');
    expect(board.options).toEqual([{ value: 'hand', label: '🃏 我的手牌' }]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'startTimer', ms: 120_000 }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'lobby', open: false }));
  });

  it('3 人局說明每人每輪出 2 張', () => {
    expect(announces(started(3).events)[0].text).toContain('出 2 張');
  });

  it('非房主不能開始', () => {
    const r = run([{ type: 'start', user: 'p2' }], lobbyWith(3).state);
    expect(ephemeralTo(r.events, 'p2')!.text).toContain('只有房主');
  });
});

// 說書人 (目前輪) 用手牌第 card 張 (index) 給提示
const clueBy = (s: DixitState, text = '週一早上', card = 0) => run([{ type: 'clue', user: s.players[s.teller].id, text, card }], s);
const timeoutNow = (s: DixitState) => run([{ type: 'timeout', id: s.timers.phase! }], s);

describe('dixit/rounds: 查看手牌', () => {
  it('說書人在說書階段：只有本人看到手牌圖片 (編號 1～6) 和 6 顆編號按鈕，不顯示名稱', () => {
    const s = started(4).state;
    const r = run([{ type: 'hand', user: 'p1' }], s);
    const m = menu(r.events, 'p1')!;
    expect(m.images).toEqual(player(s, 'p1').hand.map((c, i) => ({ url: c.url, title: String(i + 1) })));
    expect(m.options).toEqual(player(s, 'p1').hand.map((_, i) => ({ value: `pick:${s.seq}:${i}`, label: String(i + 1) })));
    expect(m.text).not.toContain(MEME_IMAGES[0].name);
    expect(r.state).toBe(s);
  });

  it('非說書人在說書階段只看到圖片、沒有按鈕；非玩家被拒', () => {
    const s = started(4).state;
    const m = menu(run([{ type: 'hand', user: 'p2' }], s).events, 'p2')!;
    expect(m.images).toHaveLength(6);
    expect(m.options).toEqual([]);
    expect(ephemeralTo(run([{ type: 'hand', user: 'x' }], s).events, 'x')!.text).toContain('不在');
  });

  it('舊選單 (不是這一輪) 的按鈕被拒，提示重新按我的手牌', () => {
    const s = started(4).state;
    const r = run([{ type: 'pick', user: 'p1', seq: s.seq - 1, card: 0 }], s);
    expect(ephemeralTo(r.events, 'p1')!.text).toContain('🃏 我的手牌');
    expect(r.state.pick).toBeUndefined();
  });
});

describe('dixit/rounds: 說書', () => {
  it('按手牌開提示視窗；改選以最後為準；視窗送出成立', () => {
    const s = started(4).state;
    const picked = run([{ type: 'pick', user: 'p1', seq: s.seq, card: 0 }, { type: 'pick', user: 'p1', seq: s.seq, card: 2 }], s);
    expect(picked.events).toContainEqual(expect.objectContaining({ type: 'modal', to: 'p1', kind: 'dixitClue' }));
    expect(picked.state.pick).toBe(2);
    const r = run([{ type: 'clue', user: 'p1', text: '  週一早上 ' }], picked.state);
    expect(r.state.tellerCard).toEqual(player(s, 'p1').hand[2]);
    expect(r.state.clue).toBe('週一早上');
    expect(r.state.phase).toBe('play');
    const a = announces(r.events).at(-1)!;
    expect(a.text).toContain('💬 <@p1> 的提示：週一早上');
    expect(a.text).not.toContain(player(s, 'p1').hand[2].url);
    expect(a.image).toBeUndefined();
  });

  it('用指令給提示：手牌第 2 張成為說書人的牌', () => {
    const s = started(4).state;
    const r = clueBy(s, '薛丁格的貓', 1);
    expect(r.state.tellerCard).toEqual(player(s, 'p1').hand[1]);
    expect(r.state.clue).toBe('薛丁格的貓');
  });

  it('編號不存在、沒選牌、不是說書人、空白和超過 50 字被拒', () => {
    const s = started(4).state;
    const bad = clueBy(s, '好累', 8);
    expect(ephemeralTo(bad.events, 'p1')!.text).toContain('1～6');
    const none = run([{ type: 'clue', user: 'p1', text: '好累' }], s);
    expect(ephemeralTo(none.events, 'p1')!.text).toContain('🃏 我的手牌');
    const other = run([{ type: 'clue', user: 'p2', text: '好累', card: 0 }], s);
    expect(ephemeralTo(other.events, 'p2')!.text).toContain('這輪的說書人是 <@p1>');
    for (const text of ['   ', '字'.repeat(51)]) {
      const r = clueBy(s, text);
      expect(ephemeralTo(r.events, 'p1')!.text).toContain('50');
      expect(r.state.phase).toBe('clue');
    }
    expect(clueBy(s, '字'.repeat(50)).state.phase).toBe('play');
  });

  it('提示送出後不能改；不在說書階段被拒', () => {
    const s = clueBy(started(4).state).state;
    const r = clueBy(s, '別的');
    expect(r.state.clue).toBe('週一早上');
    expect(ephemeralTo(r.events, 'p1')!.text).toContain('不是說書的時間');
  });
});

describe('dixit/rounds: 說書逾時', () => {
  it('說書人沒出提示 (只選了牌也算)：公告跳過、分數和手牌不變、換下一位說書人', () => {
    const s = started(4).state;
    const picked = run([{ type: 'pick', user: 'p1', seq: s.seq, card: 0 }], s).state;
    const r = timeoutNow(picked);
    expect(announces(r.events).at(-1)!.text).toContain('⌛ <@p1> 沒出提示，這輪跳過');
    expect(r.state.players.map((p) => p.hand)).toEqual(s.players.map((p) => p.hand));
    expect(r.state.players.every((p) => p.score === 0)).toBe(true);
    expect(r.state.round).toBe(2);
    expect(r.state.teller).toBe(1);
    expect(r.state.skips).toBe(1);
    expect(boards(r.events).at(-1)!.text).toContain('第 2 輪，說書人是 <@p2>');
  });

  it('3 人局連續 3 輪逾時：遊戲結束、公告目前分數，沒有 result、沒有再來一局', () => {
    let s = started(3).state;
    let events: GameEvent[] = [];
    for (let i = 0; i < 3; i++) ({ state: s, events } = timeoutNow(s));
    expect(s.phase).toBe('ended');
    expect(announces(events).at(-1)!.text).toContain('大家好像都不在了');
    expect(announces(events).at(-1)!.text).toContain('<@p1> 0');
    expect(events.some((e) => e.type === 'result')).toBe(false);
    expect(prompts(events).some((p) => p.kind === 'rematch')).toBe(false);
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], s).state).toBe(s);
  });

  it('成功出提示後跳過次數歸零', () => {
    const s = timeoutNow(started(3).state).state;
    expect(clueBy(s).state.skips).toBe(0);
  });

  it('說書人已經出提示，說書階段的計時器才觸發：被忽略', () => {
    const s = started(4).state;
    const old = s.timers.phase!;
    const r = run([{ type: 'timeout', id: old }], clueBy(s).state);
    expect(r.state.phase).toBe('play');
    expect(r.events).toEqual([]);
  });
});

// 每位非說書人出手牌前幾張 (3 人局 2 張)
const playAll = (s: DixitState) =>
  run(
    s.players
      .filter((_, i) => i !== s.teller)
      .flatMap((p) => Array.from({ length: s.players.length === 3 ? 2 : 1 }, (_, k) => ({ type: 'play', user: p.id, seq: s.seq, card: k }) as DixitAction)),
    s,
  );
// 進入投票：說書人出提示、所有人出牌。rng 不洗動，桌上的牌是說書人的在前，其他人照加入順序
const voting = (n: number) => playAll(clueBy(started(n).state).state);
const voteAll = (s: DixitState, votes: Record<string, number>) => run(Object.entries(votes).map(([user, n]) => ({ type: 'vote', user, seq: s.seq, n }) as DixitAction), s);

describe('dixit/rounds: 出牌', () => {
  it('出牌：牌到桌上、只有本人看到已出牌、進度用 ref 更新「已出 1/3」，列出還沒出的人', () => {
    const s = clueBy(started(4).state);
    const board0 = boards(s.events).at(-1)!;
    expect(board0.text).toContain('週一早上');
    expect(board0.text).toContain('90 秒');
    expect(board0.options).toEqual([{ value: 'hand', label: '🃏 我的手牌' }]);
    expect(s.events).toContainEqual(expect.objectContaining({ type: 'startTimer', ms: 90_000 }));
    const r = run([{ type: 'play', user: 'p2', seq: s.state.seq, card: 3 }], s.state);
    expect(player(r.state, 'p2').played).toEqual([player(s.state, 'p2').hand[3]]);
    expect(ephemeralTo(r.events, 'p2')!.text).toContain('✅ 已出牌');
    const board = boards(r.events).at(-1)!;
    expect(board.ref).toBe(board0.ref);
    expect(board.text).toContain('已出 1/3');
    expect(board.text).toContain('<@p3> <@p4>');
    expect(board.text).not.toContain('<@p2> <@p3>');
  });

  it('出牌選單：非說書人有按鈕；說書人只看到圖片 (說書人的牌不在裡面)', () => {
    const s = clueBy(started(4).state).state;
    const m = menu(run([{ type: 'hand', user: 'p2' }], s).events, 'p2')!;
    expect(m.options[0]).toEqual({ value: `play:${s.seq}:0`, label: '1' });
    const t = menu(run([{ type: 'hand', user: 'p1' }], s).events, 'p1')!;
    expect(t.options).toEqual([]);
    expect(t.images).toHaveLength(5);
  });

  it('出了不能改；說書人、非玩家、舊選單被拒', () => {
    const base = clueBy(started(4).state).state;
    const stale = run([{ type: 'play', user: 'p2', seq: base.seq - 1, card: 0 }], base);
    expect(ephemeralTo(stale.events, 'p2')!.text).toContain('🃏 我的手牌');
    const s = run([{ type: 'play', user: 'p2', seq: base.seq, card: 0 }], base);
    const again = run([{ type: 'play', user: 'p2', seq: s.state.seq, card: 1 }], s.state);
    expect(ephemeralTo(again.events, 'p2')!.text).toContain('你這輪已經出過牌了');
    const teller = run([{ type: 'play', user: 'p1', seq: s.state.seq, card: 1 }], s.state);
    expect(ephemeralTo(teller.events, 'p1')!.text).toContain('說書人不用再出牌');
    expect(ephemeralTo(run([{ type: 'play', user: 'x', seq: s.state.seq, card: 1 }], s.state).events, 'x')!.text).toContain('不在');
  });

  it('不在出牌時間被拒', () => {
    const s = started(4).state;
    const r = run([{ type: 'play', user: 'p2', seq: s.seq, card: 0 }], s);
    expect(ephemeralTo(r.events, 'p2')!.text).toContain('不是出牌的時間');
  });

  it('3 人局出 2 張：第一張後「再出一張」，同一張不能出兩次，出完 2 張才算完成', () => {
    const s = clueBy(started(3).state).state;
    const one = run([{ type: 'play', user: 'p2', seq: s.seq, card: 0 }], s);
    expect(ephemeralTo(one.events, 'p2')!.text).toContain('再出一張');
    expect(boards(one.events).at(-1)!.text).toContain('已出 0/2');
    const same = run([{ type: 'play', user: 'p2', seq: s.seq, card: 0 }], one.state);
    expect(ephemeralTo(same.events, 'p2')!.text).toContain('🃏 我的手牌');
    const m = menu(run([{ type: 'hand', user: 'p2' }], one.state).events, 'p2')!;
    expect(m.images).toHaveLength(6);
    expect(m.options.map((o) => o.value)).not.toContain(`play:${s.seq}:0`);
    const two = run([{ type: 'play', user: 'p2', seq: s.seq, card: 4 }], one.state);
    expect(player(two.state, 'p2').played).toEqual([player(s, 'p2').hand[0], player(s, 'p2').hand[4]]);
    expect(ephemeralTo(two.events, 'p2')!.text).toContain('✅ 已出牌');
    expect(boards(two.events).at(-1)!.text).toContain('已出 1/2');
  });

  it('全部出完立刻進投票', () => {
    expect(voting(4).state.phase).toBe('vote');
  });

  it('出牌逾時：沒出的人從手牌隨機出、3 人局補到 2 張，公告後進投票', () => {
    const s = clueBy(started(4).state).state;
    const r = timeoutNow(run([{ type: 'play', user: 'p2', seq: s.seq, card: 0 }], s).state);
    expect(player(r.state, 'p3').played).toEqual([player(s, 'p3').hand[5]]);
    expect(announces(r.events).at(-1)!.text).toContain('⌛ <@p3> <@p4> 沒出牌，系統幫他出了');
    expect(r.state.phase).toBe('vote');
    const t = clueBy(started(3).state).state;
    const r3 = timeoutNow(run([{ type: 'play', user: 'p2', seq: t.seq, card: 6 }], t).state);
    expect(player(r3.state, 'p2').played).toEqual([player(t, 'p2').hand[6], player(t, 'p2').hand[5]]);
    expect(player(r3.state, 'p3').played).toHaveLength(2);
    expect(r3.state.table).toHaveLength(5);
  });
});

describe('dixit/rounds: 匿名投票', () => {
  it('4 人局：4 張圖片編號 1～4、各一顆按鈕、看不出是誰出的，計時 60 秒', () => {
    const { state, events } = voting(4);
    const board = boards(events).at(-1)!;
    expect(board.images).toEqual(state.table.map((t, i) => ({ url: t.card.url, title: String(i + 1) })));
    expect(board.options.filter((o) => o.value.startsWith('vote:'))).toEqual(['1', '2', '3', '4'].map((label, i) => ({ value: `vote:${state.seq}:${i}`, label })));
    expect(board.options).toContainEqual({ value: 'hand', label: '🃏 我的手牌' });
    for (const p of ['p2', 'p3', 'p4']) expect(board.text).not.toContain(`<@${p}>`);
    expect(board.text).toContain('週一早上');
    expect(board.text).toContain('已投 0/3');
    expect(events).toContainEqual(expect.objectContaining({ type: 'startTimer', ms: 60_000 }));
  });

  it('桌上的牌會打亂', () => {
    const a = clueBy(started(4).state).state;
    const r = run(a.players.slice(1).map((p) => ({ type: 'play', user: p.id, seq: a.seq, card: 0 }) as DixitAction), a, () => 0);
    expect(r.state.table.map((t) => t.by)).not.toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('3 人局 5 張、8 人局 8 張', () => {
    expect(boards(voting(3).events).at(-1)!.images).toHaveLength(5);
    const eight = boards(voting(8).events).at(-1)!;
    expect(eight.images).toHaveLength(8);
    expect(eight.options.filter((o) => o.value.startsWith('vote:'))).toHaveLength(8);
  });

  it('投票：只有本人看到「你投了 1」、進度 +1；改票不改進度', () => {
    const s = voting(4).state;
    const r = run([{ type: 'vote', user: 'p2', seq: s.seq, n: 0 }], s);
    expect(ephemeralTo(r.events, 'p2')!.text).toContain('你投了 1');
    expect(boards(r.events).at(-1)!.text).toContain('已投 1/3');
    const again = run([{ type: 'vote', user: 'p2', seq: s.seq, n: 2 }], r.state);
    expect(player(again.state, 'p2').vote).toBe(2);
    expect(boards(again.events).at(-1)!.text).toContain('已投 1/3');
    expect(boards(again.events).at(-1)!.text).not.toContain('<@p2>');
  });

  it('不能投自己的牌 (3 人局兩張都不能)；說書人不投票', () => {
    const s = voting(4).state;
    const own = run([{ type: 'vote', user: 'p2', seq: s.seq, n: 1 }], s);
    expect(ephemeralTo(own.events, 'p2')!.text).toContain('不能投自己的牌');
    expect(player(own.state, 'p2').vote).toBeUndefined();
    const t = run([{ type: 'vote', user: 'p1', seq: s.seq, n: 1 }], s);
    expect(ephemeralTo(t.events, 'p1')!.text).toContain('說書人不投票');
    const three = voting(3).state;
    for (const n of [1, 2]) expect(ephemeralTo(run([{ type: 'vote', user: 'p2', seq: three.seq, n }], three).events, 'p2')!.text).toContain('不能投自己的牌');
  });

  it('全部投完提前揭曉；60 秒到沒投的人棄權', () => {
    const s = voting(4).state;
    expect(voteAll(s, { p2: 0, p3: 0, p4: 0 }).state.round).toBe(2);
    const late = timeoutNow(voteAll(s, { p2: 0, p3: 0 }).state);
    expect(late.state.round).toBe(2);
    expect(player(late.state, 'p4').score).toBe(0);
  });
});

const scoreOf = (s: DixitState) => Object.fromEntries(s.players.map((p) => [p.id, p.score]));
// 先把總分設好再進投票
const votingWith = (n: number, preset: Record<string, number>, deck?: number) => {
  const s = structuredClone(voting(n).state);
  for (const p of s.players) p.score = preset[p.id] ?? 0;
  if (deck !== undefined) s.deck = s.deck.slice(0, deck);
  return s;
};

describe('dixit/rounds: 揭曉與計分 (4 人局說書人 p1，桌上依序是 p1、p2、p3、p4 的牌)', () => {
  it('部分猜對：說書人和猜對的人 +3，被投的牌每票 +1，說書人的牌得票不加分', () => {
    expect(scoreOf(voteAll(voting(4).state, { p2: 0, p3: 1, p4: 1 }).state)).toEqual({ p1: 3, p2: 5, p3: 0, p4: 0 });
  });

  it('全部猜對：說書人 0，其他人各 +2', () => {
    expect(scoreOf(voteAll(voting(4).state, { p2: 0, p3: 0, p4: 0 }).state)).toEqual({ p1: 0, p2: 2, p3: 2, p4: 2 });
  });

  it('全部沒猜對：說書人 0，其他人各 +2 再加票數分', () => {
    expect(scoreOf(voteAll(voting(4).state, { p2: 2, p3: 1, p4: 1 }).state)).toEqual({ p1: 0, p2: 4, p3: 3, p4: 2 });
  });

  it('全員棄權：算全部沒猜對', () => {
    expect(scoreOf(timeoutNow(voting(4).state).state)).toEqual({ p1: 0, p2: 2, p3: 2, p4: 2 });
  });

  it('3 人局：兩張分開算票', () => {
    // 桌上：p1、p2 的 2 張、p3 的 2 張
    expect(scoreOf(voteAll(voting(3).state, { p2: 0, p3: 1 }).state)).toEqual({ p1: 3, p2: 4, p3: 0 });
  });

  it('揭曉公告：說書人的牌編號、每張牌的出牌者與投票者、本輪得分和總分；投票訊息改成已結束', () => {
    const s = voting(4);
    const r = voteAll(s.state, { p2: 0, p3: 1, p4: 1 });
    const text = announces(r.events).find((a) => a.text.includes('揭曉'))!.text;
    expect(text).toContain('說書人 <@p1> 的牌是第 1 號');
    expect(text).toContain('1. <@p1> (說書人) ← <@p2>');
    expect(text).toContain('2. <@p2> ← <@p3> <@p4>');
    expect(text).toContain('3. <@p3> ← 沒有人');
    expect(text).toContain('本輪得分：<@p1> +3、<@p2> +5、<@p3> +0、<@p4> +0');
    expect(text).toContain('目前總分：<@p2> 5、<@p1> 3、<@p3> 0、<@p4> 0');
    const ended = boards(r.events).find((b) => b.ref === boards(s.events).at(-1)!.ref && b.text.includes('已結束'))!;
    expect(ended.options).toEqual([]);
    expect(ended.images).toHaveLength(4);
  });
});

describe('dixit/rounds: 補牌、勝負與結束', () => {
  it('補牌：出過的牌拿掉、每人補回 6 張、換下一位說書人', () => {
    const s = voting(4).state;
    const table = s.table.map((t) => t.card.url);
    const r = voteAll(s, { p2: 0, p3: 1, p4: 1 }).state;
    expect(r.players.every((p) => p.hand.length === 6)).toBe(true);
    expect(r.players.flatMap((p) => p.hand.map((c) => c.url)).some((u) => table.includes(u))).toBe(false);
    expect(r.deck).toHaveLength(s.deck.length - 4);
    expect(r.teller).toBe(1);
    expect(r.phase).toBe('clue');
  });

  it('說書人照加入順序輪流：A、B、C、A', () => {
    let g = started(3).state;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(g.players[g.teller].id);
      const v = playAll(clueBy(g).state).state;
      g = timeoutNow(v).state;
    }
    expect(seen).toEqual(['p1', 'p2', 'p3', 'p1']);
  });

  it('有人達到 20 分：遊戲結束不補牌，最高分獲勝，送出 result 並貼再來一局', () => {
    const r = voteAll(votingWith(4, { p2: 18, p3: 10 }), { p2: 0, p3: 1, p4: 1 });
    expect(r.state.phase).toBe('ended');
    expect(player(r.state, 'p2').score).toBe(23);
    expect(player(r.state, 'p2').hand).toHaveLength(5);
    expect(r.events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3', 'p4'], winners: ['p2'] });
    const end = announces(r.events).at(-1)!.text;
    expect(end).toContain('20 分');
    expect(end).toContain('<@p2> 獲勝');
    expect(end.indexOf('<@p2> 23')).toBeLessThan(end.indexOf('<@p3> 10'));
    expect(prompts(r.events).some((p) => p.kind === 'rematch')).toBe(true);
  });

  it('同分並列獲勝', () => {
    const r = voteAll(votingWith(4, { p2: 18, p3: 18, p4: 16 }), { p2: 0, p3: 0, p4: 0 });
    expect(r.events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3', 'p4'], winners: ['p2', 'p3'] });
  });

  it('牌庫不夠補滿：遊戲結束', () => {
    const r = voteAll(votingWith(4, {}, 3), { p2: 0, p3: 1, p4: 1 });
    expect(r.state.phase).toBe('ended');
    expect(announces(r.events).at(-1)!.text).toContain('牌庫');
    expect(r.events).toContainEqual({ type: 'result', players: ['p1', 'p2', 'p3', 'p4'], winners: ['p2'] });
  });

  it('再來一局：上一局的玩家才能按，按的人是新房主', () => {
    const ended = voteAll(votingWith(4, { p2: 18 }), { p2: 0, p3: 1, p4: 1 }).state;
    expect(ephemeralTo(run([{ type: 'rematch', user: 'x', channel: 'C1' }], ended).events, 'x')!.text).toContain('上一局的玩家');
    const r = run([{ type: 'rematch', user: 'p3', channel: 'C1' }], ended);
    expect(r.state.phase).toBe('lobby');
    expect(r.state.host).toBe('p3');
  });

  it('房主取消：公告已取消和目前分數，沒有 result、沒有再來一局；非房主被拒', () => {
    const s = votingWith(4, { p2: 7 });
    const no = run([{ type: 'cancel', user: 'p2' }], s);
    expect(ephemeralTo(no.events, 'p2')!.text).toContain('只有房主');
    const r = run([{ type: 'cancel', user: 'p1' }], s);
    expect(r.state.phase).toBe('ended');
    expect(announces(r.events)[0].text).toContain('取消');
    expect(announces(r.events)[0].text).toContain('<@p2> 7');
    expect(r.events.some((e) => e.type === 'result')).toBe(false);
    expect(prompts(r.events).some((p) => p.kind === 'rematch')).toBe(false);
    expect(run([{ type: 'rematch', user: 'p1', channel: 'C1' }], r.state).state).toBe(r.state);
  });

  it('舊的投票計時器被忽略', () => {
    const s = voting(4).state;
    const old = s.timers.phase!;
    const r = run([{ type: 'timeout', id: old }], voteAll(s, { p2: 0, p3: 0, p4: 0 }).state);
    expect(r.events).toEqual([]);
    expect(r.state.phase).toBe('clue');
  });
});

describe('dixit/setup: Slack 設定 (GameDef)', () => {
  it('大廳資訊', () => {
    expect(dixit).toMatchObject({ kind: 'dixit', emoji: '🎨', name: '妙語說書人', players: '3～8 人', category: 'party', noBots: true });
    expect(dixit.apply).toBe(applyDixit);
  });

  it('指令解析：new、start、cancel、addbot、clue <編號> <提示>', () => {
    expect(dixit.parse('new', 'U1', 'C1')).toEqual({ type: 'new', user: 'U1', channel: 'C1' });
    expect(dixit.parse('start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(dixit.parse('cancel', 'U1', 'C1')).toEqual({ type: 'cancel', user: 'U1' });
    expect(dixit.parse('addbot', 'U1', 'C1')).toEqual({ type: 'addBot', user: 'U1', count: 1 });
    expect(dixit.parse('clue 2 薛丁格的 貓 ', 'U1', 'C1')).toEqual({ type: 'clue', user: 'U1', card: 1, text: '薛丁格的 貓' });
    expect(dixit.parse('clue 9 好累', 'U1', 'C1')).toEqual({ type: 'clue', user: 'U1', card: 8, text: '好累' });
  });

  it('help 與不認識的子指令回傳 null (adapter 顯示說明)；說明列出指令、我的手牌和投稿', () => {
    expect(dixit.parse('help', 'U1', 'C1')).toBeNull();
    expect(dixit.parse('foo', 'U1', 'C1')).toBeNull();
    for (const s of ['/game dixit new', '/game dixit start', '/game dixit cancel', '/game dixit clue <編號> <提示>', '🃏 我的手牌', '/game meme add', '3～8']) expect(dixit.help).toContain(s);
  });

  it('按鈕路由', () => {
    expect(dixit.button('join', 'join', 'U1', 'C1')).toEqual({ type: 'join', user: 'U1' });
    expect(dixit.button('leave', 'leave', 'U1', 'C1')).toEqual({ type: 'leave', user: 'U1' });
    expect(dixit.button('start', 'start', 'U1', 'C1')).toEqual({ type: 'start', user: 'U1' });
    expect(dixit.button('rematch', 'rematch', 'U1', 'C1')).toEqual({ type: 'rematch', user: 'U1', channel: 'C1' });
    expect(dixit.button('dixit', 'hand', 'U1', 'C1')).toEqual({ type: 'hand', user: 'U1' });
    expect(dixit.button('dixit', 'pick:3:2', 'U1', 'C1')).toEqual({ type: 'pick', user: 'U1', seq: 3, card: 2 });
    expect(dixit.button('dixit', 'play:4:1', 'U1', 'C1')).toEqual({ type: 'play', user: 'U1', seq: 4, card: 1 });
    expect(dixit.button('dixit', 'vote:5:0', 'U1', 'C1')).toEqual({ type: 'vote', user: 'U1', seq: 5, n: 0 });
    expect(dixit.button('other', 'x', 'U1', 'C1')).toBeNull();
  });

  it('dixitClue 視窗送出交給 engine，打不開時提示改用指令', () => {
    expect(dixit.modals.dixitClue.action('U1', ['週一早上'])).toEqual({ type: 'clue', user: 'U1', text: '週一早上' });
    expect(dixit.modals.dixitClue.fallback).toContain('/game dixit clue <編號> <提示>');
  });
});

describe('dixit/i18n: 英文局', () => {
  const enLobby = (n: number) =>
    run([{ type: 'new', user: 'p1', channel: 'C1', lang: 'en' }, ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as DixitAction)]);
  const enStarted = (n: number) => run([{ type: 'start', user: 'p1' }], enLobby(n).state);
  const enPlayed = () => {
    const s = enStarted(4).state;
    const clued = run([{ type: 'clue', user: 'p1', text: 'Monday', card: 0 }], s);
    const seq = clued.state.seq;
    return run([2, 3, 4].map((n) => ({ type: 'play', user: `p${n}`, seq, card: 0 }) as DixitAction), clued.state);
  };

  it('開局規則、說書人看板和手牌按鈕是英文', () => {
    const { state, events } = enStarted(4);
    expect(state.lang).toBe('en');
    expect(announces(events)[0].text).toContain('🎨 Dixit begins!');
    const board = boards(events).at(-1)!;
    expect(board.text).toContain('🎨 Round 1, the storyteller is <@p1>');
    expect(board.options[0].label).toBe('🃏 My hand');
  });

  it('手牌選單、視窗、提示公告和私下回覆是英文', () => {
    const s = enStarted(4).state;
    expect(menu(run([{ type: 'hand', user: 'p1' }], s).events, 'p1')!.text).toContain("🃏 You're the storyteller");
    expect(menu(run([{ type: 'hand', user: 'p2' }], s).events, 'p2')!.text).toBe('🃏 Your hand (no need to play right now)');
    const picked = run([{ type: 'pick', user: 'p1', seq: s.seq, card: 0 }], s);
    expect(picked.events).toContainEqual(expect.objectContaining({ type: 'modal', title: "Storyteller's clue", label: 'Clue (1-50 characters)' }));
    expect(ephemeralTo(run([{ type: 'clue', user: 'p2', text: 'x', card: 0 }], s).events, 'p2')!.text).toBe('The storyteller this round is <@p1>.');
    const clued = run([{ type: 'clue', user: 'p1', text: 'Monday', card: 0 }], s);
    expect(announces(clued.events)[0].text).toBe("💬 <@p1>'s clue: Monday");
    expect(boards(clued.events).at(-1)!.text).toContain('🃏 Round 1 play: <@p1>\'s clue is "Monday"');
  });

  it('投票看板、揭曉和計分是英文', () => {
    const played = enPlayed();
    expect(boards(played.events).at(-1)!.text).toContain("🗳️ Round 1: which card is storyteller <@p1>'s?");
    const seq = played.state.seq;
    expect(ephemeralTo(run([{ type: 'vote', user: 'p2', seq, n: 1 }], played.state).events, 'p2')!.text).toBe("You can't vote for your own card.");
    const { events } = run(
      [
        { type: 'vote', user: 'p2', seq, n: 0 },
        { type: 'vote', user: 'p3', seq, n: 0 },
        { type: 'vote', user: 'p4', seq, n: 1 },
      ],
      played.state,
    );
    expect(ephemeralTo(events, 'p2')!.text).toBe('You voted for 1');
    const text = announces(events).at(-1)!.text;
    expect(text).toContain("🎉 Round 1 reveal: storyteller <@p1>'s card was #1");
    expect(text).toContain('1. <@p1> (storyteller) ← <@p2> <@p3>');
    expect(text).toContain('3. <@p3> ← nobody');
    expect(text).toContain('Points this round: <@p1> +3, <@p2> +4');
  });

  it('結束公告和再來一局按鈕是英文', () => {
    const played = enPlayed();
    played.state.players[0].score = 19;
    const seq = played.state.seq;
    const { events } = run([2, 3, 4].map((n) => ({ type: 'vote', user: `p${n}`, seq, n: n === 2 ? 0 : 1 }) as DixitAction), played.state);
    expect(announces(events).at(-1)!.text).toContain('🏆 Game over (someone reached 20 points), <@p1> wins!');
    expect(announces(events).at(-1)!.text).toContain('1. <@p1> 22 pts 🏆');
    const rematch = prompts(events).find((p) => p.kind === 'rematch')!;
    expect(rematch.options[0].label).toBe('Play again');
  });

  it('人數不足、不支援 bot 的回覆和 GameDef 英文', () => {
    expect(ephemeralTo(run([{ type: 'start', user: 'p1' }], enLobby(2).state).events, 'p1')!.text).toBe('There are 2 players; you need at least 3 to start.');
    expect(ephemeralTo(run([{ type: 'addBot', user: 'p1', count: 1 }], enLobby(2).state).events, 'p1')!.text).toBe("Dixit doesn't support bots.");
    expect(dixit.locales.en).toMatchObject({ name: 'Dixit', players: '3-8 players' });
    for (const s of ['/game dixit new', '/game dixit clue <number> <clue>', '🃏 My hand', '/game meme add']) expect(dixit.locales.en.help).toContain(s);
  });
});
