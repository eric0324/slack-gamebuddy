## Purpose

骰子街怎麼分出勝負：先蓋好 6 個地標的人立刻獲勝，到輪數上限時改比地標數和現金；以及結束公告、`result` 事件、再來一局和房主取消。

## ADDED Requirements

### Requirement: 蓋完地標立刻獲勝
玩家蓋好最後一個還沒蓋的地標（港口、火車站、購物中心、遊樂園、廣播塔、機場全部蓋好，市政廳本來就有）的當下 SHALL 立刻獲勝，遊戲結束；SHALL NOT 等這一輪打完，也 SHALL NOT 進行遊樂園的額外回合。

#### Scenario: 蓋好機場獲勝
- **WHEN** B 已經有其他 5 個地標，用 30 元蓋好機場
- **THEN** 頻道公告 B 獲勝，遊戲結束，`result` 的 `winners` 是 B

#### Scenario: 擲出相同點數時獲勝
- **WHEN** B 擲出 5 + 5（有遊樂園），這回合蓋好最後一個地標
- **THEN** B 獲勝，沒有額外回合

### Requirement: 輪數上限的勝負
因為到達 30 輪上限而結束時（見 `machikoro/turns`），已蓋地標（不含市政廳）最多的玩家 SHALL 獲勝；地標一樣多時比現金，現金最多的獲勝；都一樣時並列。

#### Scenario: 比地標數
- **WHEN** 30 輪上限時 A 有 5 個地標、B 有 4 個地標但現金比較多
- **THEN** A 獲勝

#### Scenario: 地標一樣多比現金
- **WHEN** 30 輪上限時 A 和 B 都有 4 個地標，A 12 元、B 20 元
- **THEN** B 獲勝

#### Scenario: 完全同分並列
- **WHEN** 30 輪上限時 A 和 B 都有 4 個地標、都是 20 元，其他人比較少
- **THEN** A 和 B 並列獲勝，`winners` 是 A 和 B

### Requirement: 結束公告與再來一局
遊戲結束時，頻道 SHALL 公告獲勝者和結束原因（蓋完地標或到達 30 輪上限），以及每位玩家的地標數、現金、建築張數；送出 `{ type: 'result', players, winners }`（`players` 是所有玩家）；並附「再來一局」按鈕：只有上一局的玩家可以按（其他人按只讓他看到「只有上一局的玩家可以開新的一局」），按下後開一個新房間，按的人是房主並自動加入，其他人要重新按「加入」。遊戲結束後按舊按鈕 SHALL 被忽略。

#### Scenario: 公告結果
- **WHEN** C 蓋完 6 個地標
- **THEN** 頻道公告 C 獲勝和每位玩家的地標、現金、建築張數，送出 `result`，附「再來一局」

#### Scenario: 結束後按舊按鈕
- **WHEN** 遊戲已經結束，有人按舊面板的「🏘️ 行動」
- **THEN** 系統忽略，state 不變

### Requirement: 房主取消
房主 SHALL 可以用 `/game machikoro cancel` 取消遊戲：頻道公告取消，SHALL NOT 送出 `result`，SHALL NOT 附「再來一局」。非房主取消 SHALL 被拒絕，只讓他看到「只有房主可以取消遊戲」。

#### Scenario: 房主取消
- **WHEN** 房主在第 5 輪輸入 `/game machikoro cancel`
- **THEN** 頻道公告遊戲已取消，沒有 `result`，沒有「再來一局」

#### Scenario: 非房主取消
- **WHEN** 不是房主的玩家輸入 `/game machikoro cancel`
- **THEN** 系統拒絕，遊戲繼續
