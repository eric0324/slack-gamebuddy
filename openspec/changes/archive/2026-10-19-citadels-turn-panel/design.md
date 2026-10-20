## Context

engine 是純邏輯，只產生事件；Slack adapter 決定怎麼送。私下選單是 `prompt` (`audience: 'ephemeral'`)，私下文字是 `ephemeral`。Slack 的私下訊息不能用 `chat.update` 改，只能用按鈕附帶的 `response_url` 送 `replace_original: true` 取代；遊戲大廳的分類切換已經這樣做 (`switchLobby`)。

## Goals / Non-Goals

**Goals:** 富饒之城每回合的私下互動收斂成一則面板。

**Non-Goals:** 其他遊戲不變；逾時後不主動收掉面板 (沒有 `response_url` 可用)；墓地 DM 不變。

## Decisions

- **事件加 `replace?: boolean`**：engine 在「回應這位玩家按的按鈕」的私下事件上標 `replace`。只有富饒之城會標，所以其他遊戲不受影響。
  - 替代方案：adapter 對所有遊戲一律取代 → 使用者選擇只改富饒之城。
- **adapter 只在按鈕來自私下訊息時取代**：`index.ts` 把 `body.container.is_ephemeral` 傳進 `button()`；是私下訊息才把 `response_url` 交給 `deliver`。這樣從牌桌按「🏰 我的回合」不會把牌桌換掉。同一次按鈕只取代一次 (第一則給按鈕主人、帶 `replace` 的事件)，其他照常送；`respond` 失敗時退回 `postEphemeral`。
- **engine 動作後自動送下一步**：在 `handle()` 外包一層，列出的回合動作成功後呼叫「面板下一步」，依狀態送留牌選單、墓地等待訊息或回合選單；回合選單的主體從 `turnMenu()` 抽成函式共用。
- **私下資訊併進選單**：回合動作中原本 `tell()` 給自己的資訊改存到 `Ctx` 的 `notice` 陣列，下一步選單把它放在文字開頭；交換手牌時給對方的仍然 `tell()`。

## Risks / Trade-offs

- [`response_url` 只能用 5 次、30 分鐘內有效] → 每次按鈕都有新的 `response_url`，一次只用一次，不會超過。
- [`respond` 失敗 (例如網路)] → 退回發新的私下訊息，最差就是回到現在的行為。
