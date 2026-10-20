## Context

動機見 proposal.md，行為見 `specs/i18n/spec.md`。

- engine 都是純函式，訊息文字由 engine 產生後交給 `src/slack.ts` 送出；大部分遊戲的房間邏輯走 `src/common.ts` (`runGame`、`joinRoom`…)，狼人殺 (`src/engine.ts`) 自己一套
- 房間公告由 engine 送出結構化的 `lobby` 事件，文字和按鈕在 `src/slack.ts` 組
- 戰績和頻道戰役進度已經用同一個 SQLite 檔案 (`StatsStore`、`CrewStore`)
- 現有 2200 多個測試都寫死繁體中文

## Goals / Non-Goals

**Goals:**
- 加新語言只需要新增一個字典檔，不用改程式邏輯
- `zh-TW` 頻道的行為和輸出完全不變 (既有測試不用改)
- 遊戲可以一款一款翻譯，沒翻的照樣可以玩

**Non-Goals:**
- 不翻譯任何遊戲本身的訊息、詞庫或 help (之後的 change)
- 不做每個玩家各自的語系 (頻道訊息大家一起看，只能一種語言)
- 不做 wiki 的英文版

## Decisions

1. **語系清單**：`src/i18n/index.ts` 定義 `LANGS = [{ code: 'zh-TW', name: '繁體中文' }, { code: 'en', name: 'English' }]` 和 `type Lang`。`/game lang` 的輸入不分大小寫比對 `code`。
2. **字典**：`src/i18n/zh-TW.ts` 是來源 (key → 字串)，`src/i18n/en.ts` 型別是 `Partial<Record<Key, string>>`，缺的 key 退回 `zh-TW`。參數用 `{name}` 佔位。`t(lang, key, params?)` 一個函式就好，不引入 i18n 套件 (需要的功能很少：佔位、退回)。第 0 階段的英文用不分單複數的句型 (例如「3 played」「2/5 wins」)，先不做單複數 helper，等翻譯遊戲時真的需要再加。加新語言＝新增一個字典檔並加進 `LANGS`。
3. **頻道語系保存**：`src/langStore.ts`，SQLite table `channel_lang (channel, lang, updated_at)`，照 `CrewStore` 的寫法，和戰績同一個檔案。沒有資料時回傳 `zh-TW`。
4. **語系怎麼傳進 engine**：`src/slack.ts` 送 `new`／`rematch` action 時帶上 `lang` (當下的頻道語系)。`runGame` 在 `createLobby` 之後把 `lang` 存進新 state (`S & { lang?: Lang }`，泛型處理，不用改 36 個 `createLobby`)。`common.ts` 的共用回覆用 `t(c.s.lang ?? 'zh-TW', …)`。進行中的 state 不會被改，所以「進行中改語系不影響這一局」自然成立。
5. **「再來一局」**：34 款遊戲的再來一局 prompt 文字完全相同 (`要再來一局嗎？`／`再來一局`)，由 `src/slack.ts` 送出時依這局的語系翻譯，不用改 34 個 engine；星際探險隊的「要繼續嗎？」是遊戲自己的文字，跟著星際探險隊翻譯。
6. **房間公告**：`lobbyEvent` 多帶 `lang` (從 state)，`src/slack.ts` 組房間公告時照它翻譯標題、按鈕；遊戲名稱用該語系的翻譯，沒有就顯示中文名加「(中文)」。狼人殺的 `lobby` 事件沒有 `lang` 時，用頻道目前的語系。
7. **遊戲的翻譯狀態**：GameDef 加 `locales?: Partial<Record<Lang, { name: string; players: string; desc: string }>>`。`zh-TW` 用既有欄位；有填某語系才算翻譯好。大廳和清單依頻道語系選字串，沒有就用中文並加「(中文)」。狼人殺在 `CATALOG` 裡一樣處理。
8. **戰績和排行榜**：`src/stats.ts` 的格式化函式多收一個 `lang`，遊戲名稱一樣照翻譯狀態顯示。
9. **測試**：新增 `test/i18n.test.ts` 測 `t()` 退回、`LangStore`、`/game lang`、英文大廳、英文房間公告和回覆、英文戰績。既有測試都在沒設定語系的頻道，維持 `zh-TW`。

## Risks / Trade-offs

- [英文頻道裡同一局會混著英文 (房間、共用回覆) 和中文 (遊戲本身)] → spec 已定案：還沒翻譯的遊戲標示「(中文)」，玩家開房前就知道
- [字典 key 散落、翻譯漏掉] → `en.ts` 用 `Partial<Record<Key, string>>` 型別，key 打錯 typecheck 會擋；缺的退回中文，不會壞
- [之後每款遊戲翻譯時要改大量字串] → 每款遊戲一個 change，engine 裡的字串改成 `t(s.lang, 'saboteur.xxx')`，字典放 `src/i18n/<lang>/<遊戲>.ts`，現在先不決定細節
