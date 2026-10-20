import { describe, expect, it } from 'vitest';
import type { GameEvent } from '../src/engine.js';
import { applyCrew, type CAction, type CState } from '../src/crew.js';
import { CREW_MISSIONS, MISSIONS_EN } from '../src/crewMissions.js';
import { crew } from '../src/games/crew.js';

const rng = () => 0.99999;

function run(actions: CAction[], start?: CState) {
  let state = start;
  let events: GameEvent[] = [];
  for (const action of actions) {
    const result = applyCrew(state, action, rng);
    state = result.state;
    events = result.events;
  }
  return { state: state!, events };
}

const lobbyEn = (n: number, unlocked?: number) =>
  run([
    { type: 'new', user: 'p1', channel: 'C1', unlocked, lang: 'en' } as CAction,
    ...Array.from({ length: n - 1 }, (_, i) => ({ type: 'join', user: `p${i + 2}` }) as CAction),
  ]);
const prompts = (events: GameEvent[]) => events.filter((e) => e.type === 'prompt') as Extract<GameEvent, { type: 'prompt' }>[];
const announces = (events: GameEvent[]) => events.filter((e) => e.type === 'announce').map((e) => (e as { text: string }).text);
const CJK = /[一-鿿]/;

describe('crew/en: The Crew 的英文版', () => {
  it('英文房間：關卡資訊用英文關卡名稱和規則', () => {
    const { state, events } = lobbyEn(1, 7);
    expect(state.lang).toBe('en');
    const info = prompts(events)[0].text;
    expect(info).toContain('Mission 7');
    expect(info).toContain(MISSIONS_EN[6].name);
    expect(info).toContain('🔇 Dead zone');
    expect(info).not.toMatch(CJK);
  });

  it('英文局開始：公告、私訊手牌、挑任務 prompt 和按鈕是英文', () => {
    const { events } = run([{ type: 'start', user: 'p1' }], lobbyEn(3).state);
    const start = announces(events)[0];
    expect(start).toContain('The Crew');
    expect(start).toContain('commander');
    expect(start).not.toMatch(CJK);
    const dm = events.find((e) => e.type === 'dm') as { text: string };
    expect(dm.text).toContain('your hand');
    const pick = prompts(events).at(-1)!;
    expect(pick.text).toContain('Pick a task');
    expect(pick.text).not.toMatch(CJK);
    expect(pick.options.map((o) => o.label)).toContain('🃏 Hand');
  });

  it('英文局的手牌選單和錯誤訊息是英文', () => {
    const lobby = run([{ type: 'start', user: 'p1' }], lobbyEn(3).state).state;
    const { events } = run([{ type: 'hand', user: 'p2' }], lobby);
    expect(prompts(events)[0].text).toContain('Your hand');
    const stranger = run([{ type: 'hand', user: 'x' }], lobby).events[0] as { text: string };
    expect(stranger.text).toBe("You're not in this game.");
  });

  it('英文局查看已解鎖關卡用英文', () => {
    const { events } = run([{ type: 'level', user: 'p1' }], lobbyEn(1, 3).state);
    const text = (events[0] as { text: string }).text;
    expect(text).toContain('Unlocked missions');
    expect(text).not.toMatch(CJK);
  });

  it('英文關卡表：40 關一對一，名稱不重複', () => {
    expect(MISSIONS_EN).toHaveLength(CREW_MISSIONS.length);
    expect(new Set(MISSIONS_EN.map((m) => m.name)).size).toBe(40);
    for (const m of MISSIONS_EN) expect(`${m.name}${m.story}`).not.toMatch(CJK);
  });

  it('GameDef 有英文名稱、人數、介紹和說明', () => {
    expect(crew.locales?.en).toMatchObject({ name: 'The Crew', players: '3-5 players' });
    expect(crew.locales!.en!.desc).not.toMatch(CJK);
    expect(crew.locales!.en!.help).toContain('/game crew new');
    expect(crew.locales!.en!.help).toContain('The-Crew-Rules');
    expect(crew.locales!.en!.help).not.toMatch(CJK);
  });
});
