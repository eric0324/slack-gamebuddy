# skull/bots Specification

## Purpose
TBD - created by archiving change add-skull-game. Update Purpose after archive.

## Requirements

### Requirement: bot 的蓋牌、喊數與翻牌
bot 的名字和顯示方式 SHALL 和其他遊戲相同，輪到 bot 時 (包含每輪一開始的蓋第一張牌) SHALL 立刻行動，走和真人一樣的規則和公告。bot 的「安全數」是：自己牌疊裡沒有骷髏時為「自己牌疊張數 + 1」，有骷髏時為 0。
- 蓋牌 (第一張或再蓋一張)：骷髏還在手上時 30% 機率蓋骷髏，否則蓋玫瑰
- 輪到時還沒人喊數：手上有牌，而且桌上總張數少於「還沒出局人數 × 2」或安全數是 0，就再蓋一張；否則開始挑戰，喊「安全數」和 1 較大的那個 (不超過桌上總張數)
- 喊數：目前喊數 + 1 不超過安全數就加注 1，否則放棄
- 翻牌：從可以選的玩家中隨機選一位

#### Scenario: bot 牌疊有骷髏時放棄
- **WHEN** bot 的牌疊裡有自己的骷髏，輪到 bot 喊數
- **THEN** bot 立刻放棄

#### Scenario: bot 加注
- **WHEN** bot 的牌疊有 2 朵玫瑰、沒有骷髏，目前喊數是 2，輪到 bot
- **THEN** bot 立刻喊 3

### Requirement: 一個人也能玩完整局
1 位真人加上 bot 時，即使真人完全不操作，遊戲 SHALL 一定會結束。

#### Scenario: 真人不操作也會結束
- **WHEN** 1 位真人加 2 個 bot 開始一局，真人什麼都不做
- **THEN** 遊戲靠計時和 bot 的行動推進，最後分出勝負
