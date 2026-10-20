import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Role } from '../src/engine.js';
import { formatLeaderboard, formatStats, formatSummary, StatsStore } from '../src/stats.js';

// A 在 C1 玩了 4 場：好人 3 場贏 2 場 (預言家贏、村民贏、女巫輸)，狼人 1 場贏
function seed(store: StatsStore) {
  const game = (channel: string, winner: 'good' | 'wolves', roleOfA: Role) =>
    store.record(channel, winner, [
      { id: 'A', role: roleOfA },
      { id: 'B', role: roleOfA === 'werewolf' ? 'villager' : 'werewolf' },
    ]);
  game('C1', 'good', 'seer');
  game('C1', 'good', 'villager');
  game('C1', 'wolves', 'witch');
  game('C1', 'wolves', 'werewolf');
  game('C2', 'good', 'villager');
}

describe('player-stats: 查詢戰績', () => {
  it('計算總計、陣營、角色的場數和勝場', () => {
    const store = new StatsStore(':memory:');
    seed(store);
    expect(store.stats('C1', 'A')).toEqual({
      total: { games: 4, wins: 3 },
      factions: { good: { games: 3, wins: 2 }, wolves: { games: 1, wins: 1 } },
      roles: {
        seer: { games: 1, wins: 1 },
        villager: { games: 1, wins: 1 },
        witch: { games: 1, wins: 0 },
        werewolf: { games: 1, wins: 1 },
      },
    });
  });

  it('每個頻道分開統計', () => {
    const store = new StatsStore(':memory:');
    seed(store);
    expect(store.stats('C2', 'A')!.total).toEqual({ games: 1, wins: 1 });
  });

  it('沒有戰績時回傳 null', () => {
    const store = new StatsStore(':memory:');
    seed(store);
    expect(store.stats('C1', 'Z')).toBeNull();
    expect(store.stats('C3', 'A')).toBeNull();
  });

  it('狼王算狼人陣營', () => {
    const store = new StatsStore(':memory:');
    store.record('C1', 'wolves', [{ id: 'A', role: 'wolfKing' }]);
    expect(store.stats('C1', 'A')!.factions).toEqual({ wolves: { games: 1, wins: 1 } });
  });

  it('格式化：百分比四捨五入，沒玩過的陣營不列出，依角色列出', () => {
    const store = new StatsStore(':memory:');
    seed(store);
    const text = formatStats('<@A>', store.stats('C1', 'A'));
    expect(text).toContain('📊 <@A> 在這個頻道的戰績');
    expect(text).toContain('總計：4 場 3 勝 (75%)');
    expect(text).toContain('好人陣營：3 場 2 勝 (67%)');
    expect(text).toContain('狼人陣營：1 場 1 勝 (100%)');
    expect(text).toContain('預言家 1 場 1 勝 (100%)');
    expect(text).toContain('女巫 1 場 0 勝 (0%)');

    const onlyGood = new StatsStore(':memory:');
    onlyGood.record('C1', 'good', [{ id: 'A', role: 'seer' }]);
    expect(formatStats('<@A>', onlyGood.stats('C1', 'A'))).not.toContain('狼人陣營');
  });

  it('沒有戰績時的訊息', () => {
    expect(formatStats('<@Z>', null)).toBe('這個頻道還沒有 <@Z> 的戰績。');
  });
});

describe('player-stats: bot 重新啟動後戰績還在', () => {
  it('關掉再重新開啟同一個資料庫檔，紀錄還在', () => {
    const dir = mkdtempSync(join(tmpdir(), 'werewolf-stats-'));
    const file = join(dir, 'stats.db');
    try {
      const first = new StatsStore(file);
      seed(first);
      first.close();
      const reopened = new StatsStore(file);
      expect(reopened.stats('C1', 'A')!.total).toEqual({ games: 4, wins: 3 });
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const LABEL: Record<string, string> = { werewolf: '🐺 狼人殺', skull: '💀 骷髏與玫瑰', hanabi: '🎆 花火', coup: '👑 政變' };
const label = (k: string) => LABEL[k] ?? k;

// A 在 C1：狼人殺 4 場 3 勝、骷髏與玫瑰 2 場 1 勝、花火 1 場 18 分
function seedAll(store: StatsStore) {
  const ww = (winner: 'good' | 'wolves', roleOfA: Role) =>
    store.record('C1', winner, [{ id: 'A', role: roleOfA }, { id: 'B', role: roleOfA === 'werewolf' ? 'villager' : 'werewolf' }]);
  ww('good', 'seer');
  ww('good', 'villager');
  ww('wolves', 'witch');
  ww('wolves', 'werewolf');
  store.recordMatch('C1', 'skull', ['A', 'B', 'C'], ['A']);
  store.recordMatch('C1', 'skull', ['A', 'B', 'C'], ['B']);
  store.recordMatch('C1', 'hanabi', ['A', 'B'], [], 18);
  store.recordMatch('C2', 'skull', ['A', 'B', 'C'], ['A']);
}

describe('player-stats: 跨遊戲戰績', () => {
  it('含舊的狼人殺紀錄，每款遊戲一行依場數排，合作遊戲記最高分，只算這個頻道', () => {
    const store = new StatsStore(':memory:');
    seedAll(store);
    expect(store.summary('C1', 'A')).toEqual([
      { kind: 'werewolf', games: 4, wins: 3, best: null },
      { kind: 'skull', games: 2, wins: 1, best: null },
      { kind: 'hanabi', games: 1, wins: null, best: 18 },
    ]);
    expect(store.summary('C2', 'A')).toEqual([{ kind: 'skull', games: 1, wins: 1, best: null }]);
    expect(store.summary('C1', 'Z')).toEqual([]);
  });

  it('格式：總計、對戰勝率、每款遊戲一行', () => {
    const store = new StatsStore(':memory:');
    seedAll(store);
    expect(formatSummary('<@A>', store.summary('C1', 'A'), label)).toBe(
      ['📊 <@A> 在這個頻道的戰績', '總計 7 場，對戰 6 場 4 勝 (67%)', '🐺 狼人殺 4 場 3 勝 (75%)', '💀 骷髏與玫瑰 2 場 1 勝 (50%)', '🎆 花火 1 場，最高 18 分'].join('\n'),
    );
    expect(formatSummary('<@Z>', [], label)).toBe('這個頻道還沒有 <@Z> 的戰績。');
  });
});

describe('player-stats: 排行榜', () => {
  // B 5 勝／6 場、A 5 勝／8 場、C 2 勝／3 場
  function seedRank(store: StatsStore) {
    const m = (winners: string[], players = ['A', 'B', 'C']) => store.recordMatch('C1', 'coup', players, winners);
    for (let i = 0; i < 5; i++) m(['A', 'B'], ['A', 'B']);
    m([], ['A', 'B']);
    m(['C'], ['A', 'C']);
    m(['C'], ['A', 'C']);
    m([], ['C']);
  }

  it('依勝場、勝率、場數排序', () => {
    const store = new StatsStore(':memory:');
    seedRank(store);
    expect(store.leaderboard('C1')).toEqual({
      by: 'wins',
      rows: [
        { user: 'B', wins: 5, games: 6 },
        { user: 'A', wins: 5, games: 8 },
        { user: 'C', wins: 2, games: 3 },
      ],
    });
    expect(store.leaderboard('C2')).toEqual({ by: 'wins', rows: [] });
  });

  it('最多前 10 名；含狼人殺；合作遊戲不算進總排行', () => {
    const store = new StatsStore(':memory:');
    for (let i = 0; i < 12; i++) store.recordMatch('C1', 'skull', [`U${i}`], [`U${i}`]);
    store.record('C1', 'good', [{ id: 'U0', role: 'seer' }]);
    store.recordMatch('C1', 'hanabi', ['U1'], [], 25);
    const { rows } = store.leaderboard('C1');
    expect(rows).toHaveLength(10);
    expect(rows[0]).toEqual({ user: 'U0', wins: 2, games: 2 });
  });

  it('單一遊戲；合作遊戲依最高分排', () => {
    const store = new StatsStore(':memory:');
    seedAll(store);
    store.recordMatch('C1', 'hanabi', ['C'], [], 22);
    store.recordMatch('C1', 'hanabi', ['C'], [], 5);
    expect(store.leaderboard('C1', 'skull').rows.map((r) => r.user)).toEqual(['A', 'B', 'C']);
    expect(store.leaderboard('C1', 'hanabi')).toEqual({
      by: 'score',
      rows: [
        { user: 'C', best: 22, games: 2 },
        { user: 'A', best: 18, games: 1 },
        { user: 'B', best: 18, games: 1 },
      ],
    });
  });

  it('格式：名次、勝場／場數、勝率；合作遊戲顯示最高分；沒有紀錄', () => {
    const store = new StatsStore(':memory:');
    seedRank(store);
    expect(formatLeaderboard(store.leaderboard('C1'), '這個頻道的排行榜')).toBe(
      ['🏆 這個頻道的排行榜', '🥇 <@B> 5 勝／6 場 (83%)', '🥈 <@A> 5 勝／8 場 (63%)', '🥉 <@C> 2 勝／3 場 (67%)'].join('\n'),
    );
    expect(formatLeaderboard({ by: 'score', rows: [{ user: 'C', best: 22, games: 2 }] }, '🎆 花火排行榜')).toBe('🏆 🎆 花火排行榜\n🥇 <@C> 最高 22 分 (2 場)');
    expect(formatLeaderboard({ by: 'wins', rows: [] }, '這個頻道的排行榜')).toBe('這個頻道還沒有戰績。');
  });
});
