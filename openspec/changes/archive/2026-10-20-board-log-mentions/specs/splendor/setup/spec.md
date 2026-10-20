## MODIFIED Requirements

### Requirement: 回合面板以 @ 標記顯示玩家
回合面板裡每位玩家那一行 SHALL 用 @ 標記顯示玩家 (bot 照常顯示「🤖<名字>」)。輪到下一位、面板收成回合結束那一行時，那一行的玩家 SHALL 也用 @ 標記。面板裡的上一步提到的玩家 SHALL 也用 @ 標記。

#### Scenario: 玩家清單用 @ 標記
- **WHEN** 輪到 B，A 是真人玩家
- **THEN** 回合面板的玩家清單裡，A 那一行以 @A 開頭，用的是 @ 標記而不是純文字名字

#### Scenario: bot 照常顯示名字
- **WHEN** 房間裡有 bot Sam
- **THEN** 玩家清單裡 Sam 那一行顯示「🤖Sam」

#### Scenario: 回合結束那行用 @ 標記
- **WHEN** A 的回合結束、輪到 B
- **THEN** A 的面板收成的回合結束那行用 @ 標記顯示 A

#### Scenario: 上一步用 @ 標記
- **WHEN** A 拿了白藍綠各 1 個，面板更新
- **THEN** 面板寫「上一步：@A 拿了 白1 藍1 綠1」，A、B 都是 @ 標記
