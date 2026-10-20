// 富饒之城的英文版：英文局的訊息、按鈕、角色和建築名稱和 GameDef 的英文翻譯
import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/engine.js';
import { applyCitadels, type CAction, type CState } from '../src/citadels.js';
import { charName, districtInfo, districtLabel, RANKS, type Rank } from '../src/citadelsCards.js';
import { citadels } from '../src/games/citadels.js';

const rng = () => 0.99999; // 洗牌不動；王冠給最後一位
const han = /[一-鿿]/u;

function run(actions: CAction[], start?: CState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) ({ state, events } = applyCitadels(state, action, rng));
  return { state: state!, events };
}
const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const startedEn = (n = 4) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1', lang: 'en' } as CAction,
    ...ids(n).slice(1).map((user) => ({ type: 'join', user }) as CAction),
    { type: 'start', user: 'p1' },
  ]);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const ephemeralTo = (events: GameEvent[], user: string) => events.filter((e) => e.type === 'ephemeral' && e.to === user).map((e) => (e as { text: string }).text);
const menuOf = (events: GameEvent[], user: string) => prompts(events).filter((p) => p.audience === 'ephemeral' && p.user === user).at(-1)!;

// 英文局：跳到選角最後一位選完，開始叫號 (chars[i] 是 p(i+1) 的角色)
function callingEn(chars: Rank[]) {
  const n = chars.length;
  const s = structuredClone(startedEn(n).state);
  s.players.forEach((p, i) => {
    p.hand = ['castle', 'tavern'];
    p.char = i < n - 1 ? chars[i] : undefined;
  });
  s.crown = 0;
  const rest = RANKS.filter((x) => !chars.includes(x));
  s.draft = { pool: [chars[n - 1], ...rest.slice(1)], faceUp: [], faceDown: rest[0], order: chars.map((_, i) => i), at: n - 1 };
  return run([{ type: 'pick', user: `p${n}`, rank: chars[n - 1] }], s);
}

describe('citadels/en: 角色和建築名稱', () => {
  it('用原版英文名稱', () => {
    expect(RANKS.map((r) => charName(r, 'en'))).toEqual(['🗡️ Assassin', '🦹 Thief', '🔮 Magician', '👑 King', '⛪ Bishop', '💰 Merchant', '📐 Architect', '⚔️ Warlord']);
    expect(districtLabel('castle', 'en')).toBe('🟡 Castle (4)');
    expect(districtLabel('greatWall', 'en')).toBe('🟣 Great Wall (6)');
    expect(districtInfo('keep', 'en')).toBe('🟣 Keep (3): Cannot be destroyed by the Warlord');
    expect(districtLabel('castle')).toBe('🟡 城堡 (4)');
  });
});

describe('citadels/en: 英文局', () => {
  it('開局公告、規則私訊和選角訊息是英文', () => {
    const { events } = startedEn();
    const text = announces(events).join('\n');
    expect(text).toContain('🏛️ Citadels begins! Seats: <@p1> → <@p2> → <@p3> → <@p4>');
    expect(text).toContain('1 🗡️ Assassin: ');
    expect(text).toContain('🎭 Round 1 begins!');
    expect(text).not.toMatch(han);
    const dm = events.find((e) => e.type === 'dm' && e.to === 'p1') as { text: string };
    expect(dm.text).toContain('🃏 Your hand:');
    expect(dm.text).not.toMatch(han);
    const draft = prompts(events).find((p) => p.ref?.startsWith('citadels:draft:'))!;
    expect(draft.text).toContain("🎭 Round 1 picks: <@p4>'s turn (45s)");
    expect(draft.options.map((o) => o.label)).toEqual(['🎭 Pick character']);
  });

  it('選角選單的角色按鈕是英文', () => {
    const { state } = startedEn();
    const m = menuOf(run([{ type: 'pickMenu', user: 'p4' }], state).events, 'p4');
    expect(m.text).toContain('🎭 Pick a character (only you will know):');
    expect(m.options.map((o) => o.label).every((l) => !han.test(l))).toBe(true);
    expect(ephemeralTo(run([{ type: 'pickMenu', user: 'p1' }], state).events, 'p1')).toEqual(["It's not your turn yet."]);
  });

  it('叫號、牌桌和回合選單是英文', () => {
    const { state, events } = callingEn([1, 2, 3, 4]);
    expect(announces(events)).toContain('🎭 No. 1 🗡️ Assassin is <@p1>');
    const board = prompts(events).filter((p) => p.audience === 'channel').at(-1)!;
    expect(board.text).toContain('*👉 Now: <@p1> (No. 1 🗡️ Assassin) ⏳ 90s*');
    expect(board.options.map((o) => o.label)).toEqual(['🏰 Action', '📜 My status']);
    expect(board.text).not.toMatch(han);
    const gather = menuOf(run([{ type: 'turnMenu', user: 'p1', seq: state.seq }], state).events, 'p1');
    expect(gather.text).toContain('🏰 Gather resources first:');
    expect(gather.options.map((o) => o.label)).toEqual(['💰 Take 2 gold', '🃏 Draw cards']);
    const after = run([{ type: 'gather', user: 'p1', seq: state.seq, kind: 'gold' }], state);
    expect(announces(after.events)).toContain('💰 <@p1> took 2 gold');
    const menu = menuOf(after.events, 'p1');
    expect(menu.text).toContain('🏰 Your turn (🗡️ Assassin) | 💰 4 gold | 🃏 2 cards');
    expect(menu.options.map((o) => o.label)).toEqual(['🗡️ Assassinate', '🔨 Build', '✅ End turn']);
  });

  it('我的狀態和刺殺公告是英文', () => {
    const { state } = callingEn([1, 2, 3, 4]);
    const status = ephemeralTo(run([{ type: 'status', user: 'p2' }], state).events, 'p2').join();
    expect(status).toContain('📜 Your status | 💰 2 gold | Character: 🦹 Thief');
    expect(status).toContain('🟡 Castle (4)');
    expect(status).not.toMatch(han);
    const gathered = run([{ type: 'gather', user: 'p1', seq: state.seq, kind: 'gold' }], state).state;
    const killed = run([{ type: 'kill', user: 'p1', seq: gathered.seq, rank: 4 }], gathered);
    expect(announces(killed.events)).toContain('🗡️ The Assassin killed No. 4 👑 King!');
  });
});

describe('citadels/en: GameDef', () => {
  it('locales.en 有英文名稱、人數、介紹和指令說明', () => {
    expect(citadels.locales.en.name).toBe('Citadels');
    expect(citadels.locales.en.players).toBe('4-7 players');
    expect(citadels.locales.en.desc).not.toMatch(han);
    const help = citadels.locales.en.help;
    for (const cmd of ['new', 'addbot', 'removebot', 'start', 'cancel']) expect(help).toContain(`/game citadels ${cmd}`);
    for (const label of ['🎭 Pick character', '🏰 Action', '📜 My status']) expect(help).toContain(label);
    expect(help).not.toMatch(han);
  });
});
