## MODIFIED Requirements

### Requirement: 勝負與結束
第 3 回合結束後，3 回合累計金塊最多的玩家 SHALL 獲勝；同分時並列（包括全員 0 金）。頻道 SHALL 公告每位玩家的金塊、排名和獲勝者，送出 `{ type: 'result', players, winners }`（`players` 是所有玩家），並附「再來一局」按鈕：只有上一局的玩家可以按（其他人按只讓他看到「只有上一局的玩家可以開新的一局」），按下後開一個新房間，按的人是房主並自動加入，其他人要重新按「加入」。

房主 SHALL 可以用 `/game saboteur cancel` 取消遊戲：頻道公告取消，SHALL NOT 送出 `result`，SHALL NOT 附「再來一局」。非房主取消 SHALL 被拒絕。遊戲結束後按舊按鈕 SHALL 被忽略。

#### Scenario: 金塊最多的人贏
- **WHEN** 3 回合後 A 9 金、B 7 金、C 7 金
- **THEN** 頻道公告 A 獲勝，`result` 的 `winners` 是 A

#### Scenario: 同分並列
- **WHEN** 3 回合後 A 和 B 都是 8 金，其他人比較少
- **THEN** A 和 B 並列獲勝，`winners` 是 A 和 B

#### Scenario: 房主取消
- **WHEN** 房主在第 2 回合輸入 `/game saboteur cancel`
- **THEN** 頻道公告遊戲已取消，沒有 `result`，沒有「再來一局」

#### Scenario: 再來一局
- **WHEN** 遊戲結束後，上一局的玩家 A 按「再來一局」
- **THEN** 開一個新房間，A 是房主、名單只有 A，其他人要重新按「加入」；不是上一局玩家的人按會被拒絕
