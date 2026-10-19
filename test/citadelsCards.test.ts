import { describe, expect, it } from 'vitest';
import { CHARS, DECK, DISTRICTS, districtScore, RANKS } from '../src/citadelsCards.js';

describe('citadels/setup: 角色與建築牌組', () => {
  it('角色編號：8 張，1～8 依序是刺客到軍閥', () => {
    expect(RANKS).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(RANKS.map((r) => CHARS[r].name)).toEqual([
      '🗡️ 刺客', '🦹 盜賊', '🔮 魔術師', '👑 國王', '⛪ 主教', '💰 商人', '📐 建築師', '⚔️ 軍閥',
    ]);
    expect(RANKS.map((r) => CHARS[r].tax)).toEqual([undefined, undefined, undefined, 'noble', 'religious', 'trade', undefined, 'military']);
    for (const r of RANKS) expect(CHARS[r].desc.length).toBeGreaterThan(0);
  });

  it('牌組張數：66 張，各顏色張數正確', () => {
    expect(DECK).toHaveLength(66);
    const byColor = (color: string) => DECK.filter((d) => DISTRICTS[d].color === color).length;
    expect([byColor('noble'), byColor('religious'), byColor('trade'), byColor('military'), byColor('special')]).toEqual([12, 11, 20, 11, 12]);
  });

  it('每種建築的名稱、費用、張數和規格表一致', () => {
    const table: [string, string, number, number][] = [
      ['manor', '莊園', 3, 5], ['castle', '城堡', 4, 4], ['palace', '宮殿', 5, 3],
      ['temple', '神殿', 1, 3], ['church', '教堂', 2, 3], ['monastery', '修道院', 3, 3], ['cathedral', '大教堂', 5, 2],
      ['tavern', '酒館', 1, 5], ['market', '市集', 2, 4], ['tradingPost', '貿易站', 2, 3], ['docks', '碼頭', 3, 3], ['harbor', '港口', 4, 3], ['townHall', '市政廳', 5, 2],
      ['watchtower', '瞭望塔', 1, 3], ['prison', '監獄', 2, 3], ['battlefield', '戰場', 3, 3], ['fortress', '堡壘', 5, 2],
      ['hauntedCity', '鬼城', 2, 1], ['keep', '要塞', 3, 2], ['laboratory', '實驗室', 5, 1], ['smithy', '鐵匠鋪', 5, 1],
      ['observatory', '天文台', 5, 1], ['graveyard', '墓地', 5, 1], ['schoolOfMagic', '魔法學校', 6, 1], ['library', '圖書館', 6, 1],
      ['greatWall', '城牆', 6, 1], ['university', '大學', 6, 1], ['dragonGate', '龍門', 6, 1],
    ];
    expect(Object.keys(DISTRICTS).sort()).toEqual(table.map((t) => t[0]).sort());
    for (const [id, name, cost, copies] of table) {
      expect(DISTRICTS[id]).toMatchObject({ name, cost });
      expect(DECK.filter((d) => d === id)).toHaveLength(copies);
    }
  });

  it('大學、龍門計分 8，其他照費用', () => {
    expect(districtScore('university')).toBe(8);
    expect(districtScore('dragonGate')).toBe(8);
    expect(districtScore('palace')).toBe(5);
    expect(districtScore('library')).toBe(6);
  });

  it('每張紫卡都有效果說明', () => {
    for (const [id, d] of Object.entries(DISTRICTS)) {
      if (d.color === 'special') expect(d.desc, id).toBeTruthy();
      else expect(d.desc, id).toBeUndefined();
    }
    expect(DISTRICTS.library.desc).toContain('抽牌時全部留下');
  });
});
