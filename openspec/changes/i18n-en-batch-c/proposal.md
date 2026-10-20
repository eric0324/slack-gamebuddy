## Why

英文頻道玩花火、星際探險隊、阿瓦隆、矮人礦坑、圈內人、狼人殺時，遊戲訊息還是中文 (大廳標示「(中文)」)。這是英文翻譯的批次 C，照 `i18n-game-kit` 的 design 把這 6 款翻成英文。

## What Changes

- 花火 (Hanabi)、星際探險隊 (The Crew)、阿瓦隆 (Avalon)、矮人礦坑 (Saboteur)、圈內人 (Insider)：每款一個字典檔 `src/i18n/games/<代號>.ts`，engine 的公告、prompt、按鈕、私訊改成依這局語系；GameDef 加 `locales.en` (名稱、人數、介紹、英文指令說明)
- 星際探險隊的 40 關任務、矮人礦坑的卡名、阿瓦隆的 bot 台詞有英文版；圈內人的題目詞庫一對一翻成英文 (160 個詞，新增 `src/insiderWords.ts`，不動截碼戰共用的詞庫)
- 花火的 `hint` 指令也接受英文顏色 (red、yellow、green、blue、white)
- 狼人殺：engine state 記住開房時的語系；engine 訊息、bot 台詞 (`src/botLines.ts`)、頻道訊息解析 (`src/chatParser.ts`，英文局比對英文句型)、`/werewolf help`、`/werewolf stats` (`formatStats`) 依語系；大廳 `CATALOG` 的狼人殺那一列加英文名稱 Werewolf，英文房間的規則連結指向 `Werewolf-Rules`
- 中文頻道的輸出完全不變
- 每款遊戲 3 頁英文 wiki

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `i18n`：新增 6 款遊戲的英文版 requirement

## Impact

- 各遊戲：`src/<代號>.ts`、`src/games/<代號>.ts`、`src/i18n/games/<代號>.ts`、`src/crewMissions.ts`、`src/saboteurCards.ts`、`src/insiderWords.ts`
- 狼人殺：`src/engine.ts`、`src/botLines.ts`、`src/chatParser.ts`、`src/stats.ts` (`formatStats`)、`src/slack.ts` (只動狼人殺的部分)
- Tests：`test/<代號>.en.test.ts`、`test/werewolf.en.test.ts`；`test/i18n.test.ts` 裡用狼人殺、花火當「還沒翻譯的遊戲」的 3 個情境，改成測試中暫時拿掉翻譯 (預期的英文字串不變)
