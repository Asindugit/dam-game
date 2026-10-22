# Dam Online

## Run the game
1. Install Node.js 18 or newer.
2. Extract this ZIP and open the `dam-game` folder in VS Code.
3. Open a terminal in the folder and run:
   ```bash
   npm install
   npm start
   ```
4. Open http://localhost:3000
5. For a multiplayer test, open the same URL in two browser windows and enter the same room code in both.

## Files
- `index.html` — game page
- `style.css` — responsive dark UI
- `game.js` — isometric board drawing and client-side draughts rules
- `server.js` — Express and Socket.IO room server
- `package.json` — dependencies and start command

## Prototype limitations
This is a learning prototype. The browser implements a substantial part of International Draughts movement and capture rules, including flying kings and maximum-capture selection, but the server currently checks only basic move properties and does not independently enforce every rule. Do not deploy it as a public competitive game until server-side move validation, complete multi-capture validation, draw/repetition rules, reconnect handling, and security checks are implemented and tested.
