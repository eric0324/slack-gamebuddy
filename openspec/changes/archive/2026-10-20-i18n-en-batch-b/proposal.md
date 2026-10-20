## Why

`i18n-game-kit` 已經定好每款遊戲的翻譯寫法，36 款遊戲分批平行翻成英文。這是批次 B：蟑螂撲克、炸彈貓、壽司派對、印加寶藏、地產大亨、犯人在跳舞。英文頻道開這幾款遊戲時，目前還是顯示中文。

## What Changes

- 6 款遊戲各新增字典檔 `src/i18n/games/<代號>.ts` (`gameText()`)，engine 玩家看得到的字串改成 `tx(s.lang, key, params)`，state 加 `lang`
- 卡牌名稱依語系，英文用原版英文卡名
- GameDef 填 `locales.en` (官方英文名、人數、介紹、英文指令說明)：Cockroach Poker、Exploding Kittens、Sushi Go!、Incan Gold、For Sale、Criminal Dance
- 中文頻道的輸出完全不變 (既有測試預期值不改)
- 每款遊戲 3 頁英文 wiki (不在 repo 裡)

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `i18n`：新增 6 款遊戲的英文版 requirement

## Impact

- `src/cockroach.ts`、`src/kittens.ts`、`src/sushigo.ts`、`src/incan.ts`、`src/forsale.ts`、`src/criminal.ts` 和對應的 `src/games/<代號>.ts`
- 新增 `src/i18n/games/<代號>.ts` 6 個字典檔
- Tests：`test/<代號>.test.ts` 新增英文 describe
