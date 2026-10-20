# splendor/scoring Specification

## Purpose
TBD - created by archiving change add-splendor-game. Update Purpose after archive.

## Requirements

### Requirement: 分數
玩家的分數 SHALL 是已買發展卡的分數總和加上來訪貴族的分數 (每位 3 分)。保留的卡和手上的籌碼 SHALL NOT 算分。

#### Scenario: 計算分數
- **WHEN** A 買了 2 分、1 分、0 分的卡各一張，有 1 位貴族來訪
- **THEN** A 的分數是 6 分

### Requirement: 15 分觸發最後一輪
一位玩家的回合結束 (貴族來訪之後) 時分數達到 15 分以上，而且還沒觸發過，頻道 SHALL 公告「@玩家 達到 15 分！這一輪打完後遊戲結束」，並在回合面板標示「最後一輪」。這一輪 SHALL 繼續打到第一位玩家的前一位 (座位上最後一位) 做完，讓每個人的回合數相同，然後進入計分。觸發的人剛好是座位上最後一位時 SHALL 立刻計分。

#### Scenario: 中間的人達到 15 分
- **WHEN** 座位 A、B、C，第一位是 A，B 在第 12 輪達到 15 分
- **THEN** 頻道公告最後一輪，C 照常進行回合，C 結束後計分，A 不再進行第 13 輪

#### Scenario: 最後一位達到 15 分
- **WHEN** 第一位是 A，座位上最後一位 C 達到 15 分
- **THEN** C 的回合結束後立刻計分

### Requirement: 防卡死的提前計分
為了保證遊戲一定會結束，系統 SHALL 在以下情況直接進入計分，並公告原因：
1. 所有玩家連續跳過 (包括逾時跳過和「沒有能做的動作」自動跳過) 達到玩家人數，也就是一整輪沒有任何人做動作 → 公告「一整輪沒有人能行動，直接計分」
2. 第 50 輪結束時還沒有人達到 15 分 → 公告「已達 50 輪上限，直接計分」

任何玩家做了動作 (拿籌碼、保留、買卡) 時，連續跳過的計數 SHALL 歸零。

#### Scenario: 一整輪都跳過
- **WHEN** 3 人局，A、B、C 連續三次都是跳過
- **THEN** 頻道公告一整輪沒有人能行動，直接計分

#### Scenario: 50 輪上限
- **WHEN** 第 50 輪最後一位玩家結束回合，沒有人達到 15 分
- **THEN** 頻道公告已達 50 輪上限，直接計分

### Requirement: 勝負與結束
計分時，分數最高的玩家 SHALL 獲勝；同分時比已買發展卡的張數，張數少的獲勝；張數也相同時並列獲勝 (包括全員 0 分)。頻道 SHALL 公告每位玩家的分數、已買卡張數、貴族數、名次和獲勝者，送出 `{ type: 'result', players, winners }` (`players` 是所有玩家)，並附「再來一局」按鈕：只有上一局的玩家可以按 (其他人按只讓他看到「只有上一局的玩家可以開新的一局」)，按下後開一個新房間，按的人是房主並自動加入，其他人要重新按「加入」。

房主 SHALL 可以用 `/game splendor cancel` 取消遊戲：頻道公告取消，SHALL NOT 送出 `result`，SHALL NOT 附「再來一局」。非房主取消 SHALL 被拒絕。遊戲結束後按舊按鈕 SHALL 被忽略。

#### Scenario: 分數最高的人贏
- **WHEN** 計分時 A 16 分、B 15 分、C 9 分
- **THEN** 頻道公告 A 獲勝，`result` 的 `winners` 是 A

#### Scenario: 同分比卡少
- **WHEN** 計分時 A 和 B 都是 16 分，A 買了 12 張卡、B 買了 10 張
- **THEN** B 獲勝，`winners` 是 B

#### Scenario: 同分同張數並列
- **WHEN** 計分時 A 和 B 都是 15 分、都買了 11 張卡，其他人比較少分
- **THEN** A 和 B 並列獲勝，`winners` 是 A 和 B

#### Scenario: 再來一局
- **WHEN** 遊戲結束後上一局的玩家按「再來一局」
- **THEN** 頻道出現新的璀璨寶石房間，按的人是房主、名單只有他，其他人要重新按「加入」

#### Scenario: 房主取消
- **WHEN** 房主在第 5 輪輸入 `/game splendor cancel`
- **THEN** 頻道公告遊戲已取消，沒有 `result`，沒有「再來一局」

#### Scenario: 非房主取消
- **WHEN** 不是房主的玩家輸入 `/game splendor cancel`
- **THEN** 系統拒絕，只讓他看到「只有房主可以取消遊戲」
