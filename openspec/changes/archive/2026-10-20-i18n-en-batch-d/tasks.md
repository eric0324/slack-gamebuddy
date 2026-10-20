## 1. 富饒之城 (Citadels)

- [x] 1.1 先寫失敗的英文測試：英文局的主要公告、prompt、按鈕是英文，角色和建築用英文名稱，help 和 GameDef `locales.en` 是英文
- [x] 1.2 新增 `src/i18n/games/citadels.ts`，engine、卡表和 GameDef 依語系，讓 1.1 綠燈且既有測試不變
- [x] 1.3 寫英文 wiki 3 頁 (Citadels、Citadels-Rules、Citadels-Commands)

## 2. 骰子街 (Machi Koro)

- [x] 2.1 先寫失敗的英文測試：英文局的主要公告、prompt、按鈕是英文，建築和地標用英文名稱，help 和 GameDef `locales.en` 是英文
- [x] 2.2 新增 `src/i18n/games/machikoro.ts`，engine、卡表和 GameDef 依語系，讓 2.1 綠燈且既有測試不變
- [x] 2.3 寫英文 wiki 3 頁 (Machi Koro、Machi-Koro-Rules、Machi-Koro-Commands)

## 3. 璀璨寶石 (Splendor)

- [x] 3.1 先寫失敗的英文測試：英文局的主要公告、prompt、按鈕是英文，寶石顏色用英文，help 和 GameDef `locales.en` 是英文
- [x] 3.2 新增 `src/i18n/games/splendor.ts`，engine、卡表和 GameDef 依語系，讓 3.1 綠燈且既有測試不變
- [x] 3.3 寫英文 wiki 3 頁 (Splendor、Splendor-Rules、Splendor-Commands)

## 4. 詭影神探 (Deception)

- [x] 4.1 先寫失敗的英文測試：英文局的主要公告、prompt、按鈕是英文，手段／線索詞庫和提示板取英文版，help 和 GameDef `locales.en` 是英文
- [x] 4.2 新增 `src/i18n/games/deception.ts`，engine、詞庫和 GameDef 依語系，讓 4.1 綠燈且既有測試不變
- [x] 4.3 寫英文 wiki 3 頁 (Deception、Deception-Rules、Deception-Commands)

## 5. 驗證

- [x] 5.1 跑 `npm test` 全部綠燈、既有測試預期值沒改
- [x] 5.2 跑 `npm run typecheck` 通過、`openspec validate i18n-en-batch-d --strict` 通過
