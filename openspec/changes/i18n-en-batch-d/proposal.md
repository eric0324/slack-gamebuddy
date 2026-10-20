## Why

英文頻道開這幾款遊戲時，遊戲訊息還是繁體中文、大廳也標著「(中文)」。批次 D 把富饒之城、骰子街、璀璨寶石、詭影神探翻成英文，讓英文頻道可以完整用英文玩。

## What Changes

- 富饒之城 (Citadels)、骰子街 (Machi Koro)、璀璨寶石 (Splendor)、詭影神探 (Deception) 各新增一個字典檔 `src/i18n/games/<代號>.ts`，engine 裡玩家看得到的字串改成依這局語系查字典
- 角色、建築、地標、卡牌名稱依語系：英文用原版英文名稱 (例如 Assassin、Thieves' Guild、Wheat Field、Train Station)
- 詭影神探的手段／線索詞庫和提示板直接翻成英文，數量和中文版相同
- 各 GameDef 填 `locales.en` (名稱、人數、介紹、指令說明)
- 中文輸出完全不變
- 每款遊戲 3 頁英文 wiki (遊戲介紹、Rules、Commands)

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `i18n`：新增四款遊戲的英文版 requirement

## Impact

- `src/citadels.ts`、`src/citadelsCards.ts`、`src/games/citadels.ts`
- `src/machikoro.ts`、`src/machikoroCards.ts`、`src/games/machikoro.ts`
- `src/splendor.ts`、`src/splendorCards.ts`、`src/games/splendor.ts`
- `src/deception.ts`、`src/deceptionCards.ts`、`src/games/deception.ts`
- 新增 `src/i18n/games/{citadels,machikoro,splendor,deception}.ts`
- Tests：各遊戲新增英文測試 (`test/<代號>.en.test.ts`)
