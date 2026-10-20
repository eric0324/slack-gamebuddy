## Why

`i18n-game-kit` 定好了每款遊戲的翻譯寫法，接下來分批把遊戲翻成英文。批次 E 負責七款猜詞、找臥底類的遊戲：機密代號、一字千金、禁語、誰是臥底、間諜危機、變色龍、截碼戰。英文頻道開這幾款遊戲時，目前看到的還是中文。

## What Changes

- 七款遊戲各新增字典檔 `src/i18n/games/<代號>.ts` (用 `gameText()`)，engine 裡玩家看得到的字串改成依這局語系 (`s.lang`) 顯示；中文字串一字不差
- 詞庫依語系分開，英文版和中文版一對一翻譯、數量相同；台灣在地、翻不通的詞換成意思接近的英文常用詞
- 玩家輸入的詞 (提示、猜詞) 依這局語系比對，英文不分大小寫、忽略前後空白
- GameDef 填 `locales.en` (Codenames、Just One、Taboo、Undercover、Spyfall、The Chameleon、Decrypto)
- 每款遊戲 3 頁英文 wiki

## Capabilities

### New Capabilities

(無)

### Modified Capabilities

- `i18n`：新增七款遊戲的英文版 requirement

## Impact

- `src/codenames.ts`、`src/justone.ts`、`src/taboo.ts`、`src/undercover.ts`、`src/spyfall.ts`、`src/chameleon.ts`、`src/decrypto.ts` 和各自的詞庫檔、`src/games/<代號>.ts`
- 新增 `src/i18n/games/<代號>.ts`
- Tests：各遊戲的 `test/<代號>.test.ts` 新增英文 describe；既有測試不改
