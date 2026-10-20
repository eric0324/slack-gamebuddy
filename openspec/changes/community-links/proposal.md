## Why

想讓玩家更容易參與社群：許願新遊戲、問規則、回報問題。GitHub 已經開了 Issues 和 Discussions，但玩家在 Slack 裡看不到入口。

## What Changes

- 遊戲大廳最下方那一行加一個「💬 社群討論」連結，連到 GitHub Discussions；只放這一個，許願、問答、回報問題都從 Discussions 分流
- README 加上社群討論的連結
- 新增 issue 表單模板 (`.github/ISSUE_TEMPLATE/`)：
  - 「🐛 回報問題」：哪款遊戲 (下拉選單)、發生什麼、預期怎樣、怎麼重現、大概時間、截圖，自動加 `bug` 標籤
  - 「✨ 改進建議」：哪款遊戲、想改什麼、為什麼，自動加 `enhancement` 標籤
  - `config.yml`：關掉空白 issue；新遊戲許願和規則問題導到 Discussions
- wiki 側邊欄和首頁加上社群討論連結
- Discussions 的分類設定由使用者在 GitHub 網頁上手動調整 (API 不能改)，不在這個 change 的程式範圍

## Capabilities

### New Capabilities

（無）

### Modified Capabilities

- `game-commands`：「遊戲大廳與分類」的大廳底部提示加上社群討論連結

## Impact

- Code：`src/slack.ts` 大廳底部那一行
- Tests：`test/slack.test.ts` 大廳底部連結、characterization snapshot
- Repo：`.github/ISSUE_TEMPLATE/bug.yml`、`improvement.yml`、`config.yml`
- Docs：README、wiki 首頁和側邊欄
