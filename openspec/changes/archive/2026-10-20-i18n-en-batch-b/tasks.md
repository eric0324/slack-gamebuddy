## 1. 蟑螂撲克 (cockroach)

- [x] 1.1 先寫失敗的英文測試 (`test/cockroach.test.ts`)：英文局的主要公告、prompt、按鈕、私下訊息是英文，GameDef `locales.en` 和英文 help
- [x] 1.2 新增 `src/i18n/games/cockroach.ts`，engine 改用 `tx()`、state 加 `lang`、GameDef 填 `locales.en`
- [x] 1.3 跑 `test/cockroach.test.ts` 綠燈 (既有測試預期值不改)，寫 3 頁英文 wiki

## 2. 炸彈貓 (kittens)

- [x] 2.1 先寫失敗的英文測試 (`test/kittens.test.ts`)：英文局的主要公告、prompt、按鈕、私下訊息是英文，GameDef `locales.en` 和英文 help
- [x] 2.2 新增 `src/i18n/games/kittens.ts`，engine 改用 `tx()`、state 加 `lang`、GameDef 填 `locales.en`
- [x] 2.3 跑 `test/kittens.test.ts` 綠燈 (既有測試預期值不改)，寫 3 頁英文 wiki

## 3. 壽司派對 (sushigo)

- [x] 3.1 先寫失敗的英文測試 (`test/sushigo.test.ts`)：英文局的主要公告、prompt、按鈕、私下訊息是英文，GameDef `locales.en` 和英文 help
- [x] 3.2 新增 `src/i18n/games/sushigo.ts`，engine 改用 `tx()`、state 加 `lang`、GameDef 填 `locales.en`
- [x] 3.3 跑 `test/sushigo.test.ts` 綠燈 (既有測試預期值不改)，寫 3 頁英文 wiki

## 4. 印加寶藏 (incan)

- [x] 4.1 先寫失敗的英文測試 (`test/incan.test.ts`)：英文局的主要公告、prompt、按鈕、私下訊息是英文，GameDef `locales.en` 和英文 help
- [x] 4.2 新增 `src/i18n/games/incan.ts`，engine 改用 `tx()`、state 加 `lang`、GameDef 填 `locales.en`
- [x] 4.3 跑 `test/incan.test.ts` 綠燈 (既有測試預期值不改)，寫 3 頁英文 wiki

## 5. 地產大亨 (forsale)

- [x] 5.1 先寫失敗的英文測試 (`test/forsale.test.ts`)：英文局的主要公告、prompt、按鈕、私下訊息是英文，GameDef `locales.en` 和英文 help
- [x] 5.2 新增 `src/i18n/games/forsale.ts`，engine 改用 `tx()`、state 加 `lang`、GameDef 填 `locales.en`
- [x] 5.3 跑 `test/forsale.test.ts` 綠燈 (既有測試預期值不改)，寫 3 頁英文 wiki

## 6. 犯人在跳舞 (criminal)

- [x] 6.1 先寫失敗的英文測試 (`test/criminal.test.ts`)：英文局的主要公告、prompt、按鈕、私下訊息是英文，GameDef `locales.en` 和英文 help
- [x] 6.2 新增 `src/i18n/games/criminal.ts`，engine 改用 `tx()`、state 加 `lang`、GameDef 填 `locales.en`
- [x] 6.3 跑 `test/criminal.test.ts` 綠燈 (既有測試預期值不改)，寫 3 頁英文 wiki

## 7. 全部驗證

- [x] 7.1 跑 `npm test` 和 `npm run typecheck`，全部綠燈
- [x] 7.2 `openspec validate i18n-en-batch-b --strict` 通過
