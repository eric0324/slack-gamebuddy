// 頻道語系：每個頻道設定的語言，存在 SQLite (和戰績同一個檔案)
import Database from 'better-sqlite3';
import { parseLang, type Lang } from './i18n/index.js';

export class LangStore {
  private db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS channel_lang (
        channel TEXT PRIMARY KEY,
        lang TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  // 沒有設定過是 zh-TW
  get(channel: string): Lang {
    const row = this.db.prepare('SELECT lang FROM channel_lang WHERE channel = ?').get(channel) as { lang: string } | undefined;
    return (row && parseLang(row.lang)) ?? 'zh-TW';
  }

  set(channel: string, lang: Lang): void {
    this.db
      .prepare('INSERT INTO channel_lang (channel, lang, updated_at) VALUES (?, ?, ?) ON CONFLICT(channel) DO UPDATE SET lang = excluded.lang, updated_at = excluded.updated_at')
      .run(channel, lang, Date.now());
  }
}
