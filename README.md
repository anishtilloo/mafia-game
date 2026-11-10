# Mafia — automated narrator

A mobile web app that does the god's job in a game of Mafia. One person hosts, everyone else joins
from their phone with a room code or QR scan, roles are dealt at random, and the host's device
speaks the narration out loud.

Stack: NestJS + Socket.IO (server), Vue 3 + Vite (client), TypeScript throughout. Game state lives
in memory, so there is no database to set up.

## Run it

```bash
npm install
npm run build
npm start          # serves the app and the API on http://localhost:3000
```

The terminal prints the address phones on the same Wi-Fi should open, for example
`http://192.168.1.20:8004`. Open that address on the host device too (not `localhost`), so the QR
code in the lobby points somewhere the other phones can reach.

For development, `npm run dev` runs the Nest server on :8004 and Vite on :5173 with hot reload.

`npm test` (after a build) plays complete games with bot players and checks the rules.

## How a game runs

Nobody plays god. Once the game is started, the app runs every step by itself and the person who
created the room is an ordinary player with no extra buttons.

1. **Lobby.** The host creates a game and shares the 4-letter code or QR. At least 4 players.
2. **Roles.** Each phone shows its role only while the card is pressed and held. Everyone taps ready.
3. **Night.** The host device says "City sleeps", then calls Mafia, Doctor and Officer in turn.
   The player whose turn it is opens their eyes and picks on their own phone.
   - Mafias must all pick the same person.
   - The Doctor may save anyone, including themself.
   - The Officer points at a suspect. If it is a Mafia, that Mafia is caught and removed.
   - Doctor and Officer are always called, even when dead; the app waits a random 6–12 seconds so
     the pause gives nothing away.
4. **Morning.** "City awakens", then who was killed (or that no one was), and any Mafia caught.
5. **Discussion and vote.** Voting is open throughout the discussion: everyone alive picks a
   name on their phone and confirms it. Picking a different name changes the vote, even after
   confirming. Nobody can skip. The vote closes by itself the moment the last living player
   confirms. The player with the most votes is out and is announced as Mafia or innocent (Doctor
   and Officer are never revealed). A tie for first place wipes the votes and everyone discusses
   and votes again. The next night then starts on its own.
6. Dead players stay in the room as spectators.

**Winning.** The village wins when every Mafia is gone. The Mafia wins when at most one non-Mafia
player is left alive.

**Mafia count.** Automatic: 1 Mafia up to 13 players, 2 for 14–18, then one more for every 5
players (19–23 → 3, 24–28 → 4). The host can override it in the lobby. The rule lives in
`autoMafiaCount()` in `server/src/game/room.ts`.

## Practical notes

- **Voice** uses the browser's built-in speech synthesis on the host device. Use the "Test the
  narrator voice" button in the lobby and turn the volume up.
- **Screen lock.** Phones that lock drop their connection; they take their seat back automatically
  when reopened. The app asks the browser to keep the screen awake, but browsers only allow that
  over HTTPS, so on plain `http://` LAN addresses set the host phone's auto-lock to "never" for the
  game, or deploy behind HTTPS.
- **Deploying.** It is a single Node process: `npm run build && npm start` with `PORT` set. Any
  host that supports WebSockets works (Render, Railway, Fly, a VPS). Run one instance, since rooms
  are held in memory. For a VPS, see [Deploying to a VPS](#deploying-to-a-vps) below.
- Acting is mandatory. The night waits for as long as it takes for the Mafia, a living Doctor and
  a living Officer to choose, and the vote cannot close until every living player has confirmed a vote. If a
  phone drops out, that player reopens the app to take their seat back.

## Deploying to a VPS

These steps assume Ubuntu or Debian, a domain (for example `mafia.example.com`) whose DNS A
record points at the server, and ports 80 and 443 open. The app runs under systemd on
`127.0.0.1:8004`, and Caddy serves it publicly over HTTPS. HTTPS also lets phones keep their
screens awake during the game.

1. **Install Node 20+, git and Caddy:**

   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs git caddy
   ```

   If `caddy` is not in your distribution's packages, follow
   <https://caddyserver.com/docs/install>.

2. **Create a user and fetch the code:**

   ```bash
   sudo useradd --system --create-home --shell /bin/bash mafia
   sudo mkdir -p /opt/mafia && sudo chown mafia:mafia /opt/mafia
   sudo -u mafia git clone <your-repo-url> /opt/mafia
   cd /opt/mafia && sudo -u mafia npm ci && sudo -u mafia npm run build
   ```

3. **Run it as a service:**

   ```bash
   sudo cp deploy/mafia.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now mafia
   curl -I http://127.0.0.1:8004      # should answer 200
   ```

4. **Put it on your domain with HTTPS.** Edit `deploy/Caddyfile` and replace `mafia.example.com`
   with your domain, then:

   ```bash
   sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

   Open `https://your-domain` and Caddy obtains the certificate on the first request.

5. **Ship updates:** run `deploy/update.sh` on the server. It pulls, rebuilds and restarts the
   service. A restart ends any game in progress, so deploy between games. To let the `mafia` user
   restart the service, either run the script as an admin user or add a sudoers rule for
   `systemctl restart mafia`.

Logs: `journalctl -u mafia -f`. Firewall (if you use `ufw`): `sudo ufw allow 80,443/tcp`. Port
8004 does not need to be opened.

## Where things are

```
server/src/game/room.ts          game rules and the per-player view (all secrets stay here)
server/src/game/game.gateway.ts  Socket.IO events
server/src/game/game.service.ts  room registry
server/test/simulate.mjs         bot-driven full-game simulation
client/src/game.ts               socket connection and session restore
client/src/narrator.ts           speech and wake lock
client/src/components/           one component per screen
```
