// 頻道語系：每個頻道設定的語言，存在 SQLite (和戰績同一個檔案)；沒設定過的頻道用預設語系
import Database from 'better-sqlite3';
import { parseLang, type Lang } from './i18n/index.js';

// 環境變數 DEFAULT_LANG：沒設定或不支援的值都當成英文
export const parseDefaultLang = (value: string | undefined): Lang => parseLang(value ?? '') ?? 'en';

// 有遊戲紀錄的頻道：戰績 (狼人殺、其他遊戲)、投稿梗圖、星際探險隊進度
const HISTORY = [
  { table: 'games', sql: 'SELECT channel FROM games' },
  { table: 'matches', sql: 'SELECT channel FROM matches' },
  { table: 'meme_images', sql: 'SELECT channel FROM meme_images' },
  { table: 'crew_progress', sql: 'SELECT channel FROM crew_progress' },
];

export class LangStore {
  private db: Database.Database;

  // defaultLang：沒設定過語系的頻道用的語言 (沒給就是 zh-TW，測試用)
  constructor(
    file: string,
    private defaultLang: Lang = 'zh-TW',
  ) {
    this.db = new Database(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channel_lang (
        channel TEXT PRIMARY KEY,
        lang TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS lang_meta (key TEXT PRIMARY KEY);
    `);
    this.keepExistingChannelsChinese();
  }

  // 只做一次：已經有遊戲紀錄、還沒設定過語系的頻道設成中文，原本在玩的頻道不會因為預設改成英文而變
  private keepExistingChannelsChinese() {
    const KEY = 'existing-channels-zh';
    if (this.db.prepare('SELECT 1 FROM lang_meta WHERE key = ?').get(KEY)) return;
    const tables = new Set((this.db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((r) => r.name));
    const sources = HISTORY.filter((h) => tables.has(h.table)).map((h) => h.sql);
    const insert = this.db.prepare('INSERT OR IGNORE INTO channel_lang (channel, lang, updated_at) VALUES (?, ?, ?)');
    this.db.transaction(() => {
      if (sources.length) {
        const channels = this.db.prepare(sources.join(' UNION ')).all() as { channel: string }[];
        for (const { channel } of channels) insert.run(channel, 'zh-TW', Date.now());
      }
      this.db.prepare('INSERT INTO lang_meta (key) VALUES (?)').run(KEY);
    })();
  }

  get(channel: string): Lang {
    const row = this.db.prepare('SELECT lang FROM channel_lang WHERE channel = ?').get(channel) as { lang: string } | undefined;
    return (row && parseLang(row.lang)) ?? this.defaultLang;
  }

  set(channel: string, lang: Lang): void {
    this.db
      .prepare('INSERT INTO channel_lang (channel, lang, updated_at) VALUES (?, ?, ?) ON CONFLICT(channel) DO UPDATE SET lang = excluded.lang, updated_at = excluded.updated_at')
      .run(channel, lang, Date.now());
  }
}
