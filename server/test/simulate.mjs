// Plays complete games against a real server with bot players and checks the
// rules hold. Run with: npm test   (after npm run build)
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { io } from 'socket.io-client';
import assert from 'node:assert/strict';

const PORT = 3977;
const here = dirname(fileURLToPath(import.meta.url));
const server = spawn('node', [join(here, '..', 'dist', 'main.js')], {
  env: { ...process.env, PORT: String(PORT), MAFIA_SPEED: '0.01' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((res) => server.stdout.on('data', (d) => String(d).includes('running') && res()));

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bot(name) {
  const socket = io(`http://localhost:${PORT}`, { transports: ['websocket'] });
  const b = { name, socket, view: null, narration: [], acted: '' };
  socket.on('state', (v) => (b.view = v));
  socket.on('narrate', ({ lines }) => b.narration.push(...lines));
  b.send = (ev, body = {}) => socket.emitWithAck(ev, body);
  return b;
}

async function playGame(size, mafiaSetting) {
  const bots = Array.from({ length: size }, (_, i) => bot(`P${i + 1}`));
  const host = bots[0];
  const created = await host.send('create', { name: host.name });
  assert.ok(created.ok);
  for (const b of bots.slice(1)) assert.ok((await b.send('join', { code: created.code, name: b.name })).ok);
  if (mafiaSetting) await host.send('configure', { mafiaCount: mafiaSetting });

  // Non-hosts may not run the game.
  assert.equal((await bots[1].send('start')).ok, false);
  assert.ok((await host.send('start')).ok);
  await sleep(50);

  // Secrecy: nobody is sent anyone else's role, and only Mafias know their mates.
  const roles = bots.map((b) => b.view.you.role);
  const mafias = roles.filter((r) => r === 'mafia').length;
  assert.equal(mafias, host.view.mafiaCount);
  assert.equal(roles.filter((r) => r === 'doctor').length, 1);
  assert.equal(roles.filter((r) => r === 'officer').length, 1);
  for (const b of bots) {
    assert.ok(b.view.players.every((p) => p.role === null), 'roles leaked before the end');
    assert.equal(b.view.mates.length, b.view.you.role === 'mafia' ? mafias - 1 : 0);
    assert.ok(!JSON.stringify(b.view).includes('token'));
  }

  for (const b of bots) await b.send('ready');

  let lastDeadCheck = 0;
  let ties = 0;
  for (let guard = 0; guard < 4000; guard++) {
    await sleep(10);
    const v = host.view;
    if (v.phase === 'ended') break;

    if (v.phase === 'night') {
      for (const b of bots) {
        const a = b.view.action;
        const key = `${b.view.round}:${b.view.nightStep}`;
        if (!a || a.done) continue;
        // Only the right role, alive, is ever offered an action.
        assert.ok(b.view.you.alive);
        assert.equal(a.type, { mafia: 'kill', doctor: 'save', officer: 'suspect' }[b.view.you.role]);
        if (a.type === 'kill') {
          // Mafias converge on whatever a teammate picked first.
          const target = a.picks[0]?.target ?? pick(a.targets);
          if (a.yourPick !== target) await b.send('nightAction', { targetId: target });
        } else if (b.acted !== key) {
          b.acted = key;
          await b.send('nightAction', { targetId: pick(a.targets) });
        }
      }
    } else if (v.phase === 'day') {
      // At most two players can leave in one night (one killed, one caught).
      const dead = v.players.filter((p) => !p.alive).length;
      assert.ok(dead - lastDeadCheck <= 2);
      const living = bots.filter((b) => b.view.you.alive);
      const before = living.length;
      for (const [i, b] of living.entries()) {
        const others = b.view.players.filter((p) => p.alive && p.id !== b.view.you.id);
        // Skipping is not allowed, neither is voting for yourself or confirming nothing.
        assert.equal((await b.send('confirmVote')).ok, false);
        assert.equal((await b.send('vote', { targetId: 'skip' })).ok, false);
        assert.equal((await b.send('vote', { targetId: b.view.you.id })).ok, false);
        assert.ok((await b.send('vote', { targetId: pick(others).id })).ok);
        if (i === 0) {
          // A confirmed vote can still be changed, which un-confirms it.
          assert.ok((await b.send('confirmVote')).ok);
          assert.ok((await b.send('vote', { targetId: pick(others).id })).ok);
          await sleep(15);
          assert.equal(b.view.vote.yourConfirmed, false);
        }
      }
      // Dead players cannot vote, and nothing closes until everyone has confirmed.
      const ghost = bots.find((b) => b.view.you.playing && !b.view.you.alive);
      if (ghost) assert.equal((await ghost.send('vote', { targetId: living[0].view.you.id })).ok, false);
      for (const b of living.slice(1)) assert.ok((await b.send('confirmVote')).ok);
      await sleep(15);
      assert.equal(host.view.phase, 'day', 'vote closed before everyone confirmed');
      assert.equal(host.view.players.filter((p) => p.alive).length, before);
      // The last confirmation closes the vote on its own.
      assert.ok((await living[0].send('confirmVote')).ok);
      await sleep(20);
      if (host.view.phase === 'day') {
        // Tie: nobody is out, votes are wiped, and everyone votes again.
        ties++;
        assert.equal(host.view.players.filter((p) => p.alive).length, before);
        assert.equal(host.view.vote.voted.length, 0);
        assert.ok(host.view.announcements[0].includes('tied'));
      }
    } else if (v.phase === 'result') {
      lastDeadCheck = v.players.filter((p) => !p.alive).length;
      const out = v.players.find((p) => p.id === v.vote.result.oustedId);
      assert.equal(out.alive, false);
      assert.ok(['mafia', 'innocent'].includes(out.reveal));
      // Nothing to press: the next night starts by itself.
    }
  }

  const end = host.view;
  assert.equal(end.phase, 'ended', 'game did not finish');
  const aliveMafia = end.players.filter((p) => p.alive && p.role === 'mafia').length;
  const aliveOthers = end.players.filter((p) => p.alive && p.role !== 'mafia').length;
  if (end.winner === 'village') assert.equal(aliveMafia, 0);
  else assert.ok(aliveMafia > 0 && aliveOthers <= 1);

  // Only the host device narrates, and it always asks for doctor and officer.
  assert.ok(bots.slice(1).every((b) => b.narration.length === 0));
  const said = (s) => host.narration.filter((l) => l.includes(s)).length;
  const nights = said('City sleeps');
  assert.equal(said('Doctor, open your eyes'), said('Mafia, open your eyes'));
  assert.equal(said('Officer, open your eyes'), said('Mafia, open your eyes'));
  assert.ok(nights >= 1);

  for (const b of bots) b.socket.close();
  return { size, mafias, winner: end.winner, rounds: end.round, revotes: ties };
}

let failed = false;
try {
  const games = [];
  for (const [size, setting] of [[4, 0], [6, 0], [8, 0], [9, 2], [14, 0], [19, 0], [7, 0], [10, 3]]) {
    games.push(await playGame(size, setting));
  }
  console.table(games);

  // Rejoin after a dropped connection keeps the seat and the role.
  const a = bot('A');
  const { code, token } = await a.send('create', { name: 'A' });
  const others = ['B', 'C', 'D'].map(bot);
  for (const b of others) await b.send('join', { code, name: b.name });
  assert.equal((await bot('Late').send('join', { code: 'ZZZZ', name: 'x' })).ok, false);
  await a.send('start');
  await sleep(50);
  const role = a.view.you.role;
  a.socket.close();
  const a2 = bot('A');
  assert.ok((await a2.send('rejoin', { code, token })).ok);
  await sleep(50);
  assert.equal(a2.view.you.role, role);
  assert.equal((await bot('E').send('join', { code, name: 'E' })).ok, false, 'joined a running game');
  console.log('All simulations passed.');
} catch (e) {
  failed = true;
  console.error(e);
} finally {
  server.kill();
  process.exit(failed ? 1 : 0);
}
