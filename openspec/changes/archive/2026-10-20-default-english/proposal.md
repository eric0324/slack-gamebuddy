## Why

希望 bot 加進新頻道時預設用英文，方便外國團隊直接使用；但現在已經在玩的中文頻道不應該部署後突然變成英文。

## What Changes

- 沒設定過語系的頻道使用「預設語系」，由環境變數 `DEFAULT_LANG` 設定，正式部署沒設定時是 `en`；程式沒指定時 (測試) 維持 `zh-TW`，既有測試不用改
- 第一次啟動時 (只做一次)，把已經有戰績、投稿梗圖或星際探險隊進度、而且還沒設定過語系的頻道設成 `zh-TW`，讓原本在玩的頻道維持中文
- README 說明 `DEFAULT_LANG`；`.env.example` 加上這個變數

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `i18n`：「支援的語系」的預設語系改成可設定 (正式環境英文)；新增「玩過的頻道保留中文」

## Impact

- `src/langStore.ts`：預設語系、一次性的既有頻道設定 (SQLite 記錄已經做過)
- `src/index.ts`：讀 `DEFAULT_LANG`
- Tests：`test/i18n.test.ts`
- Docs：README、`.env.example`
