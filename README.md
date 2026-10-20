# Slack GameBuddy

Play board games in your Slack channels, with the bot as the host.

Supported games:

- **Werewolf** (`/game werewolf`, or `/werewolf`): 6-12 players. Hidden roles: act secretly by DM at night, discuss and vote by day.
- **Undercover** (`/game undercover`): 4-12 players. Everyone gets a word; take turns describing it and vote out the one with a different word.
- **Spyfall** (`/game spyfall`): 4-10 players. Everyone but the spy knows the location; ask questions and vote to catch the spy.
- **Avalon** (`/game avalon`): 5-10 players. Good vs. evil: leaders pick teams for quests, and nobody is eliminated.
- **Codenames** (`/game codenames`): 4-12 players (no bots). Red vs. blue: spymasters give one-word clues to find their agents.
- **Liar's Dice** (`/game liarsdice`): 2-8 players. Roll in secret, then raise the bid or call liar. The loser loses a die.
- **Just One** (`/game justone`): 3-7 players (no bots). Co-op word guessing: everyone gives one clue, duplicates get removed.
- **Coup** (`/game coup`): 3-6 players. Bluff your way to power: claim any role, challenge or block.
- **Hanabi** (`/game hanabi`): 2-5 players (no bots). Co-op: see everyone's cards except your own.
- **Wavelength** (`/game wavelength`): 4-12 players (no bots). Two teams compete: the psychic gives one clue so teammates can find a spot on the spectrum.
- **Decrypto** (`/game decrypto`): 4-12 players (no bots). Team vs. team: pass a 3-digit code to your team with clues, and try to intercept theirs.
- **Wavelength co-op** (`/game wavecoop`): 2-12 players (no bots). Everyone on one team: take turns giving clues and guess spots on the spectrum together for a high score.
- **Insider** (`/game insider`): 4-8 players (no bots). Find the word with yes/no questions, then catch the Insider who knew it all along.
- **Skull** (`/game skull`): 3-6 players. Place discs face down and bid. Flip only Roses to succeed; hit a Skull and lose a disc.
- **6 nimmt!** (`/game nimmt`): 2-10 players. Everyone plays a card at once. The 6th card in a row, or a card too low, takes the whole row of bullheads.
- **Love Letter** (`/game loveletter`): 2-6 players. Hold one card, draw one and play one. Deduce the others' cards and deliver your letter.
- **Cockroach Poker** (`/game cockroach`): 2-6 players. Pass a critter card face down and claim "This is a Cockroach". Guess wrong and you keep it; 4 of a kind and you lose.
- **The Chameleon** (`/game chameleon`): 3-8 players (no bots). Everyone says a word related to the secret word; find the chameleon who doesn't know it.
- **No Thanks!** (`/game nothanks`): 3-7 players. Pay a chip to say no, or take the card and its chips. Runs only count their lowest card; lowest score wins.
- **Taboo** (`/game taboo`): 4-12 players (no bots). Team vs. team: describe the word in chat for your team without saying the taboo words.
- **Sushi Go!** (`/game sushigo`): 2-5 players. Pick a sushi card at the same time and pass your hand on; score the best combos over 3 rounds.
- **Meme Battle** (`/game meme`): 3-8 players. Each round shows a meme: play a card or write the funniest caption, then vote anonymously for points.
- **Herd Mentality** (`/game herd`): 4-12 players (no bots). Guess what most people will answer and score by matching the herd; the one odd answer gets the Pink Cow.
- **Exploding Kittens** (`/game kittens`): 2-5 players. Take turns playing and drawing cards; draw an Exploding Kitten without a Defuse and you are out.
- **Criminal Dance** (`/game criminal`): 3-8 players. Play 4 cards in turn: the Culprit tries to hold out to the last card, the Detectives try to catch them.
- **Wits & Wagers** (`/game wager`): 3-10 players (no bots). Everyone writes a number for each question, then bets on whose answer is closest; you can win by betting even if you have no idea.
- **Incan Gold** (`/game incan`): 3-8 players. Flip expedition cards and decide together whether to push deeper or head back to camp with your gems. A second matching hazard ruins the run; most gems after 5 temples wins.
- **Dixit** (`/game dixit`): 3-8 players (no bots). The storyteller gives a one-line clue for one of their memes, everyone slips in a decoy, then guesses which card is the storyteller's.
- **Citadels** (`/game citadels`): 4-7 players. Secretly pick a character each round, then assassinate, steal and destroy in a race to build a city of 8 districts.
- **Emoji Telephone** (`/game emoji`): 4-10 players (no bots). Act out text in emoji, guess emoji in words, pass it around to see how the prompt drifts, then vote for the best entries.
- **The Crew** (`/game crew`): 3-5 players (no bots). Co-op trick-taking: no talking about your hand. Use your plays and one communication to get each task won by the right player, mission by mission, on the way to Planet Nine.
- **Saboteur** (`/game saboteur`): 3-10 players. Dig toward the gold with path cards while hidden Saboteurs lay dead ends and break tools. Most gold after 3 rounds wins.
- **For Sale** (`/game forsale`): 3-6 players. Bid for properties (passing takes the cheapest one at half price), then secretly sell them for checks; most checks plus coins wins.
- **Machi Koro** (`/game machikoro`): 2-5 players. Roll the dice, collect from your establishments, expand your town and be the first to build all 6 landmarks.
- **Splendor** (`/game splendor`): 2-4 players. Collect gems, buy development cards for bonuses, attract nobles and race to 15 points.
- **Deception** (`/game deception`): 4-12 players (no bots). The Forensic Scientist knows the answer but can only hint with bullets; find which Means and Clue the Murderer used while the Murderer and Accomplice mislead you.

Type `/game` to open the game lobby (only you can see it). Switch categories with the buttons at the top (Hidden Roles, Bluffing, Party, Team vs Team, Co-op, Strategy) and press "Start a room" next to a game — no commands to memorize. The room announcement links to that game's rules. For games that support bots, the host can press "🤖 +" / "🤖 -" on the room announcement to add or remove bots.

🌐 Language: every game is available in Traditional Chinese and English. Switch a channel with `/game lang en` (`/game lang zh-TW` to switch back, `/game lang` to see the current language); it applies from the next room.

💬 Want a new game, have a rules question or found a bug? Chat with us on [GitHub Discussions](https://github.com/eric0324/slack-gamebuddy/discussions); if you're sure it's a bug, [open an issue](https://github.com/eric0324/slack-gamebuddy/issues/new/choose). The lobby also links to the discussions at the bottom ("💬 Community").

Type `/game stats [@someone]` for everyone's stats in the channel, and `/game rank [code]` for the leaderboard (by wins; co-op games by best score). Games with bots and cancelled games are not recorded.

Rules and commands for every game are in the [wiki](https://github.com/eric0324/slack-gamebuddy/wiki) — [English](https://github.com/eric0324/slack-gamebuddy/wiki/English) / [繁體中文](https://github.com/eric0324/slack-gamebuddy/wiki/%E7%B9%81%E9%AB%94%E4%B8%AD%E6%96%87).

## Create the Slack app

1. Go to <https://api.slack.com/apps>, press **Create New App → From an app manifest**, choose your workspace and paste this manifest:

   ```yaml
   display_information:
     name: GameBuddy
   features:
     bot_user:
       display_name: gamebuddy
       always_online: true
     slash_commands:
       - command: /game
         description: Board games (Werewolf, Undercover, Spyfall, Avalon, Codenames, Liar's Dice, Just One, Coup, Hanabi, Wavelength, Decrypto, Wavelength co-op, Insider, Skull, 6 nimmt!, Love Letter, Cockroach Poker, The Chameleon, No Thanks!, Taboo, Sushi Go!, Meme Battle, Herd Mentality, Exploding Kittens, Criminal Dance, Wits & Wagers, Incan Gold, Dixit, Citadels, Emoji Telephone, The Crew, Saboteur, For Sale, Machi Koro, Splendor, Deception)
         usage_hint: werewolf new | undercover new | spyfall new | avalon new | codenames new | liarsdice new | justone new | coup new | hanabi new | wavelength new | decrypto new | wavecoop new | insider new | skull new | nimmt new | loveletter new | cockroach new | chameleon new | nothanks new | taboo new | sushigo new | meme new | herd new | kittens new | criminal new | wager new | incan new | dixit new | citadels new | emoji new | crew new | saboteur new | forsale new | machikoro new | splendor new | deception new | stats | rank | help
         should_escape: true
       - command: /werewolf
         description: Werewolf
         usage_hint: new | addbot [n] | removebot [n] | start | next | vote | cancel | stats [@someone]
         should_escape: true
   oauth_config:
     scopes:
       bot:
         - commands
         - chat:write
         - im:write
         - mpim:write
         - channels:history
         - groups:history
   settings:
     event_subscriptions:
       bot_events:
         - message.channels
         - message.groups
     interactivity:
       is_enabled: true
     socket_mode_enabled: true
   ```

2. **Basic Information → App-Level Tokens**: press **Generate Token and Scopes**, add the `connections:write` scope and generate a token starting with `xapp-`
3. **Install App**: install it to your workspace and copy the Bot User OAuth Token starting with `xoxb-`
4. Create `.env` in the project root:

   ```sh
   cp .env.example .env
   # fill in SLACK_BOT_TOKEN (xoxb-...) and SLACK_APP_TOKEN (xapp-...)
   ```

## Run

```sh
npm install
npm start      # connects to Slack with Socket Mode; no public URL needed
npm test       # run the tests
```

The bot reads what human players type in the game channel (e.g. "I'm the seer, @someone is a wolf") so bot players can react to it; that's why it needs the `channels:history` and `groups:history` scopes and the `message.*` events. Insider uses the same permissions: messages typed during the Q&A are treated as questions, and only the host sees the answer buttons. Taboo too: what the describer and teammates type is checked for correct guesses and fouls (no extra scopes or events needed). Messages are only matched inside the bot and are never sent to any external service.

Stats are stored in `data/stats.db` (SQLite); set the `STATS_DB` environment variable to change the location. Move it along if you run the bot on another machine.

The language for channels that haven't run `/game lang` is set by `DEFAULT_LANG` in `.env` (`en` or `zh-TW`; defaults to `en`). When the bot first starts with this setting, channels that already have game history (stats, submitted memes or The Crew progress) are kept in Traditional Chinese, so existing channels don't suddenly switch languages.

Finally, invite the bot to the channel you want to play in (`/invite @gamebuddy`) and type `/game` to see the games.

## Deploy to Google Cloud (free e2-micro)

The bot connects to Slack with Socket Mode, so it doesn't need a public URL — just a small machine that stays on. Google Cloud's Always Free tier includes one e2-micro.

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/) and link billing (the free tier still needs a credit card)
2. **Compute Engine → VM instances → Create instance**:
   - Region: `us-west1`, `us-central1` or `us-east1` (only these three are free)
   - Machine type: `e2-micro`
   - Boot disk: Ubuntu 24.04 LTS (x86/64), **standard persistent disk**, 30 GB or less
   - Firewall: no need to allow HTTP/HTTPS
3. Once it's created, press **SSH** to connect and run:

   ```sh
   curl -fsSL https://raw.githubusercontent.com/eric0324/slack-gamebuddy/main/deploy/setup.sh | bash
   ```

4. Fill in the tokens and start the bot:

   ```sh
   sudo -u werewolf nano /opt/werewolf/app/.env
   sudo systemctl start werewolf
   sudo journalctl -u werewolf -f   # you're done when you see [werewolf] Bot is running
   ```

To update to the latest version later: `sudo bash /opt/werewolf/app/deploy/update.sh`

⚠️ Once the bot is running on the server, **stop the bot on your own computer** — two bots connected to Slack at once will handle every command twice. Stats live on the server at `/opt/werewolf/app/data/stats.db`.
