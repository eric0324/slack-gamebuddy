import { describe, expect, it } from 'vitest';
import { CREW_MISSIONS } from '../src/crewMissions.js';

const ARROWS = ['>', '>>', '>>>', '>>>>'];

describe('crew/missions: 關卡表', () => {
  it('剛好 40 關，名稱、劇情不空白，名稱不重複', () => {
    expect(CREW_MISSIONS).toHaveLength(40);
    for (const m of CREW_MISSIONS) {
      expect(m.name.trim()).not.toBe('');
      expect(m.story.trim()).not.toBe('');
    }
    expect(new Set(CREW_MISSIONS.map((m) => m.name)).size).toBe(40);
  });

  it('任務數 1～10，標記數不超過任務數', () => {
    for (const m of CREW_MISSIONS) {
      expect(m.tasks).toBeGreaterThanOrEqual(1);
      expect(m.tasks).toBeLessThanOrEqual(10);
      expect(m.tokens.length).toBeLessThanOrEqual(m.tasks);
    }
  });

  it('數字標記從 1 連續、箭頭從 > 連續、Ω 最多一個', () => {
    for (const m of CREW_MISSIONS) {
      const nums = m.tokens.filter((t) => /^\d$/.test(t)).map(Number);
      expect(nums).toEqual(nums.map((_, i) => i + 1));
      const arrows = m.tokens.filter((t) => t.startsWith('>'));
      expect(arrows).toEqual(ARROWS.slice(0, arrows.length));
      expect(m.tokens.filter((t) => t === 'Ω').length).toBeLessThanOrEqual(1);
    }
  });

  it('特殊規則只用允許的六種，延遲 N ≥ 2', () => {
    for (const m of CREW_MISSIONS) {
      for (const r of m.rules) {
        if (r.startsWith('delay:')) expect(Number(r.slice(6))).toBeGreaterThanOrEqual(2);
        else expect(['deadZone', 'silence', 'commanderPick', 'solo', 'sick']).toContain(r);
      }
    }
  });

  it('🎯 單人任務不和 🎖️ 指揮官指派、🤒 隊員失能同時出現', () => {
    for (const m of CREW_MISSIONS) {
      if (m.rules.includes('solo')) {
        expect(m.rules).not.toContain('commanderPick');
        expect(m.rules).not.toContain('sick');
      }
    }
  });

  it('難度遞增：每 10 關的平均任務數比前 10 關多', () => {
    const avg = [0, 1, 2, 3].map((g) => CREW_MISSIONS.slice(g * 10, g * 10 + 10).reduce((n, m) => n + m.tasks, 0) / 10);
    for (let i = 1; i < 4; i++) expect(avg[i]).toBeGreaterThan(avg[i - 1]);
  });

  it('第 7 關是月背通訊站、3 個任務、🔇 通訊干擾', () => {
    expect(CREW_MISSIONS[6]).toMatchObject({ name: '月背通訊站', tasks: 3, rules: ['deadZone'] });
  });
});
