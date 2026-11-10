import { randomInt, randomUUID } from 'crypto';

export type Role = 'mafia' | 'doctor' | 'officer' | 'villager';
export type Phase = 'lobby' | 'roles' | 'night' | 'day' | 'result' | 'ended';
export type NightStep = 'sleep' | 'mafia' | 'doctor' | 'officer';
export type Fate = 'killed' | 'caught' | 'ousted';

export interface Player {
  id: string;
  token: string; // secret, lets a phone rejoin after a refresh or screen lock
  name: string;
  socketId: string | null;
  playing: boolean; // false = narrator-only host device
  role: Role | null;
  alive: boolean;
  ready: boolean;
  fate: Fate | null;
}

export interface RoomHooks {
  /** State changed: push a fresh private view to every player. */
  onChange(room: Room): void;
  /** Lines the god should say out loud on the host device. */
  onNarrate(room: Room, lines: string[]): void;
}

export class GameError extends Error {}

/** MAFIA_SPEED < 1 shrinks every wait (used by the automated simulation). */
const SPEED = Number(process.env.MAFIA_SPEED ?? 1) || 1;
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 30;

/** 1 Mafia up to 13 players, 2 for 14-18, then one more for every 5 players. */
export function autoMafiaCount(players: number): number {
  if (players < 14) return 1;
  return 2 + Math.floor((players - 14) / 5);
}

/** Rough time the voice needs to say these lines. */
function speechMs(lines: string[]): number {
  return lines.reduce((ms, l) => ms + 900 + l.split(/\s+/).length * 400, 0);
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface NightState {
  mafiaPicks: Map<string, string>; // mafia id -> target id
  kill: string | null;
  save: string | null;
  suspect: string | null;
  stepDone: boolean;
}

export class Room {
  players: Player[] = [];
  hostId = '';
  phase: Phase = 'lobby';
  nightStep: NightStep | null = null;
  round = 0;
  /** 0 = automatic by player count. */
  mafiaSetting = 0;
  winner: 'village' | 'mafia' | null = null;
  announcements: string[] = [];
  log: { round: number; text: string }[] = [];
  lastActivity = Date.now();

  private night: NightState = this.freshNight();
  private votes = new Map<string, string>(); // voter id -> target id
  private confirmed = new Set<string>(); // voters who have locked their vote in
  private lastVote: {
    tally: { id: string; voters: string[] }[];
    oustedId: string | null;
    wasMafia: boolean;
  } | null = null;
  private officerNote: string | null = null;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    public readonly code: string,
    private readonly hooks: RoomHooks,
  ) {}

  // ---------------------------------------------------------------- helpers

  private freshNight(): NightState {
    return { mafiaPicks: new Map(), kill: null, save: null, suspect: null, stepDone: false };
  }

  get(id: string | null | undefined): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  byToken(token: string): Player | undefined {
    return this.players.find((p) => p.token === token);
  }

  private alive(): Player[] {
    return this.players.filter((p) => p.alive);
  }

  private aliveWith(role: Role): Player[] {
    return this.players.filter((p) => p.alive && p.role === role);
  }

  private change() {
    this.lastActivity = Date.now();
    this.hooks.onChange(this);
  }

  /** Speak lines on the host device; returns how long they take to say. */
  private say(lines: string[]): number {
    this.hooks.onNarrate(this, lines);
    return speechMs(lines);
  }

  /** Only one thing is ever pending in a room, so one timer is enough. */
  private after(ms: number, fn: () => void) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      fn();
    }, ms * SPEED);
  }

  destroy() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private requireHost(id: string) {
    if (id !== this.hostId) throw new GameError('Only the host can do that.');
  }

  // ------------------------------------------------------------------ lobby

  addPlayer(rawName: string, playing = true): Player {
    const base = String(rawName ?? '').trim().slice(0, 16);
    if (!base) throw new GameError('Please enter your name.');
    if (this.phase !== 'lobby') throw new GameError('This game has already started.');
    if (this.players.length >= MAX_PLAYERS) throw new GameError('This room is full.');

    let name = base;
    for (let n = 2; this.players.some((p) => p.name.toLowerCase() === name.toLowerCase()); n++) {
      name = `${base} ${n}`;
    }
    const player: Player = {
      id: randomUUID().slice(0, 8),
      token: randomUUID(),
      name,
      socketId: null,
      playing,
      role: null,
      alive: false,
      ready: false,
      fate: null,
    };
    this.players.push(player);
    if (!this.hostId) this.hostId = player.id;
    return player;
  }

  /** Returns true when the room is now empty and should be deleted. */
  removePlayer(id: string): boolean {
    if (this.phase !== 'lobby') throw new GameError('Players cannot be removed mid-game.');
    this.players = this.players.filter((p) => p.id !== id);
    if (this.hostId === id) this.hostId = this.players[0]?.id ?? '';
    this.change();
    return this.players.length === 0;
  }

  kick(hostId: string, targetId: string) {
    this.requireHost(hostId);
    if (targetId === hostId) throw new GameError('You cannot remove yourself.');
    this.removePlayer(targetId);
  }

  setConnection(id: string, socketId: string | null) {
    const p = this.get(id);
    if (!p) return;
    p.socketId = socketId;
    this.change();
  }

  configure(hostId: string, opts: { mafiaCount?: number; hostPlays?: boolean }) {
    this.requireHost(hostId);
    if (this.phase !== 'lobby') throw new GameError('Settings can only change in the lobby.');
    if (typeof opts.mafiaCount === 'number') {
      this.mafiaSetting = Math.max(0, Math.min(10, Math.floor(opts.mafiaCount)));
    }
    if (typeof opts.hostPlays === 'boolean') this.get(hostId)!.playing = opts.hostPlays;
    this.change();
  }

  /** Mafias for the current lobby, respecting the host's override. */
  mafiaCount(): number {
    const n = this.players.filter((p) => p.playing).length;
    const max = Math.max(1, Math.floor((n - 3) / 2)); // always leave doctor, officer and a majority of non-mafia
    const wanted = this.mafiaSetting > 0 ? this.mafiaSetting : autoMafiaCount(n);
    return Math.min(wanted, max);
  }

  // ------------------------------------------------------------- game start

  start(hostId: string) {
    this.requireHost(hostId);
    if (this.phase !== 'lobby') throw new GameError('The game has already started.');
    const playing = this.players.filter((p) => p.playing);
    if (playing.length < MIN_PLAYERS) {
      throw new GameError(`You need at least ${MIN_PLAYERS} players to start.`);
    }

    const mafias = this.mafiaCount();
    const order = shuffle(playing);
    order.forEach((p, i) => {
      p.role = i < mafias ? 'mafia' : i === mafias ? 'doctor' : i === mafias + 1 ? 'officer' : 'villager';
    });
    for (const p of this.players) {
      p.alive = p.playing;
      p.ready = false;
      p.fate = null;
      if (!p.playing) p.role = null;
    }

    this.round = 0;
    this.winner = null;
    this.log = [];
    this.announcements = [];
    this.lastVote = null;
    this.officerNote = null;
    this.phase = 'roles';
    this.say(['The game begins.', 'Everyone, secretly check your role on your phone, then tap ready.']);
    this.change();
  }

  ready(id: string) {
    const p = this.get(id);
    if (this.phase !== 'roles' || !p?.playing) return;
    p.ready = true;
    this.change();
    if (this.players.every((x) => !x.playing || x.ready)) this.beginNight();
  }

  // ------------------------------------------------------------------ night

  private beginNight() {
    this.round++;
    this.phase = 'night';
    this.nightStep = 'sleep';
    this.night = this.freshNight();
    this.votes.clear();
    this.confirmed.clear();
    this.lastVote = null;
    this.officerNote = null;
    this.announcements = [];
    const ms = this.say([`Night ${this.round}.`, 'City sleeps. Everyone, close your eyes.']);
    this.change();
    this.after(ms + 2500, () => this.stepMafia());
  }

  private stepMafia() {
    this.nightStep = 'mafia';
    this.night.stepDone = false;
    this.say(['Mafia, open your eyes.', 'Mafia, choose who you want to kill.']);
    // Acting is mandatory: the night waits here until the Mafia agree.
    this.change();
  }

  private finishMafia() {
    if (this.night.stepDone) return;
    this.night.stepDone = true;
    this.change();
    this.after(1200, () => {
      const ms = this.say(['Mafia, close your eyes.']);
      this.after(ms + 1500, () => this.stepDoctor());
    });
  }

  private stepDoctor() {
    this.nightStep = 'doctor';
    this.night.stepDone = false;
    const ms = this.say(['Doctor, open your eyes.', 'Doctor, who do you want to save?']);
    this.change();
    // A living doctor must choose, however long it takes. The god asks even when
    // the doctor is dead, then waits a believable while before moving on.
    if (!this.aliveWith('doctor').length) this.after(ms + 6000 + randomInt(6000), () => this.finishDoctor());
  }

  private finishDoctor() {
    if (this.night.stepDone) return;
    this.night.stepDone = true;
    this.change();
    this.after(1200, () => {
      const ms = this.say(['Doctor, close your eyes.']);
      this.after(ms + 1500, () => this.stepOfficer());
    });
  }

  private stepOfficer() {
    this.nightStep = 'officer';
    this.night.stepDone = false;
    const ms = this.say(['Officer, open your eyes.', 'Officer, point at who you suspect is the Mafia.']);
    this.change();
    if (!this.aliveWith('officer').length) this.after(ms + 6000 + randomInt(6000), () => this.finishOfficer());
  }

  private finishOfficer() {
    if (this.night.stepDone) return;
    this.night.stepDone = true;
    this.change();
    this.after(1200, () => {
      const ms = this.say(['Officer, close your eyes.']);
      this.after(ms + 1500, () => this.resolveNight());
    });
  }

  /** A mafia, the doctor or the officer picks a target during their turn. */
  nightAction(id: string, targetId: string) {
    const p = this.get(id);
    const target = this.get(targetId);
    if (this.phase !== 'night' || !p?.alive || this.night.stepDone) {
      throw new GameError('It is not your turn.');
    }
    if (!target?.alive) throw new GameError('Pick a player who is still in the game.');

    if (this.nightStep === 'mafia' && p.role === 'mafia') {
      if (target.role === 'mafia') throw new GameError('You cannot kill a fellow Mafia.');
      this.night.mafiaPicks.set(p.id, target.id);
      const mafias = this.aliveWith('mafia');
      const agreed = mafias.every((m) => this.night.mafiaPicks.get(m.id) === target.id);
      if (agreed) {
        this.night.kill = target.id;
        this.finishMafia();
      } else {
        this.change();
      }
    } else if (this.nightStep === 'doctor' && p.role === 'doctor') {
      this.night.save = target.id; // the doctor may save themself
      this.finishDoctor();
    } else if (this.nightStep === 'officer' && p.role === 'officer') {
      if (target.id === p.id) throw new GameError('You cannot suspect yourself.');
      this.night.suspect = target.id;
      this.finishOfficer();
    } else {
      throw new GameError('It is not your turn.');
    }
  }

  private resolveNight() {
    const lines = ['City awakens. Everyone, open your eyes.'];
    const news: string[] = [];

    const victim = this.night.kill !== this.night.save ? this.get(this.night.kill) : undefined;
    if (victim) {
      victim.alive = false;
      victim.fate = 'killed';
      news.push(`Last night, ${victim.name} was killed.`);
    } else {
      news.push('Last night, no one was killed.');
    }

    const suspect = this.get(this.night.suspect);
    if (suspect) {
      if (suspect.role === 'mafia') {
        suspect.alive = false;
        suspect.fate = 'caught';
        news.push(`The officer caught a Mafia. ${suspect.name} was a Mafia and is out of the game.`);
        this.officerNote = `You were right. ${suspect.name} was a Mafia.`;
      } else {
        this.officerNote = `${suspect.name} is not a Mafia.`;
      }
    }

    this.nightStep = null;
    this.phase = 'day';
    this.publish(news);
    lines.push(...news);
    if (this.checkWinner()) lines.push(this.winnerLine());
    else lines.push('Discuss, and vote on your phone.', 'Voting closes once everyone has confirmed their vote.');
    this.say(lines);
    this.change();
  }

  // -------------------------------------------------------------------- day

  /**
   * Voting is open for the whole discussion. Picking a name (again) changes the
   * vote and un-confirms it, so a vote can be changed until the last player confirms.
   */
  vote(id: string, targetId: string) {
    const p = this.get(id);
    if (this.phase !== 'day' || !p?.alive) throw new GameError('You cannot vote right now.');
    const target = this.get(targetId);
    if (!target?.alive) throw new GameError('Pick a player who is still in the game.');
    if (target.id === id) throw new GameError('You cannot vote for yourself.');
    this.votes.set(id, target.id);
    this.confirmed.delete(id);
    this.change();
  }

  /** No host needed: the vote closes by itself when every living player has confirmed. */
  confirmVote(id: string) {
    const p = this.get(id);
    if (this.phase !== 'day' || !p?.alive) throw new GameError('You cannot vote right now.');
    if (!this.votes.has(id)) throw new GameError('Pick who you are voting for first.');
    this.confirmed.add(id);
    if (this.alive().every((a) => this.confirmed.has(a.id))) this.resolveVote();
    else this.change();
  }

  private resolveVote() {
    const byTarget = new Map<string, string[]>();
    for (const [voter, target] of this.votes) byTarget.set(target, [...(byTarget.get(target) ?? []), voter]);
    const tally = [...byTarget.entries()]
      .map(([id, voters]) => ({ id, voters }))
      .sort((a, b) => b.voters.length - a.voters.length);

    // A tie for first place means everyone votes again.
    const tied = tally.filter((t) => t.voters.length === tally[0].voters.length);
    if (tied.length > 1) {
      const names = tied.map((t) => this.get(t.id)!.name);
      const news = [`The vote is tied between ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}.`];
      this.votes.clear();
      this.confirmed.clear();
      this.publish(news);
      this.say([...news, 'Discuss again, and vote again.']);
      this.change();
      return;
    }

    const ousted = this.get(tally[0].id)!;
    ousted.alive = false;
    ousted.fate = 'ousted';
    const wasMafia = ousted.role === 'mafia';
    // Only "Mafia" or "innocent" is revealed, never doctor or officer.
    const news = [`${ousted.name} has been voted out.`, `${ousted.name} was ${wasMafia ? 'a Mafia' : 'innocent'}.`];
    this.lastVote = { tally, oustedId: ousted.id, wasMafia };

    this.phase = 'result';
    this.publish(news);
    const lines = [...news];
    if (this.checkWinner()) {
      lines.push(this.winnerLine());
      this.say(lines);
      this.change();
      return;
    }
    // The next night starts by itself, after a moment to take in the verdict.
    const ms = this.say(lines);
    this.change();
    this.after(ms + 6000, () => this.beginNight());
  }

  // -------------------------------------------------------------------- end

  private publish(news: string[]) {
    this.announcements = news;
    for (const text of news) this.log.push({ round: this.round, text });
  }

  /** Village wins when every Mafia is gone; Mafia wins when at most one other player is left. */
  private checkWinner(): boolean {
    const mafias = this.aliveWith('mafia').length;
    const others = this.alive().length - mafias;
    if (mafias === 0) this.winner = 'village';
    else if (others <= 1) this.winner = 'mafia';
    if (this.winner) {
      this.phase = 'ended';
      this.nightStep = null;
    }
    return !!this.winner;
  }

  private winnerLine(): string {
    return this.winner === 'village'
      ? 'Every Mafia is gone. The villagers win!'
      : 'The Mafia has taken over the city. The Mafia wins!';
  }

  playAgain(hostId: string) {
    this.requireHost(hostId);
    if (this.phase !== 'ended') throw new GameError('The game is still running.');
    this.destroy();
    this.phase = 'lobby';
    this.round = 0;
    this.winner = null;
    this.announcements = [];
    this.log = [];
    this.lastVote = null;
    this.officerNote = null;
    for (const p of this.players) {
      p.role = null;
      p.alive = false;
      p.ready = false;
      p.fate = null;
    }
    this.change();
  }

  // ------------------------------------------------------------------- view

  /**
   * Everything one player's phone is allowed to know. Secret information
   * (roles, night picks) only ever leaves the server through this method.
   */
  viewFor(me: Player) {
    const ended = this.phase === 'ended';
    const inGame = this.phase !== 'lobby';

    let action: null | {
      type: 'kill' | 'save' | 'suspect';
      targets: string[];
      yourPick: string | null;
      picks: { by: string; target: string }[];
      done: boolean;
    } = null;

    if (this.phase === 'night' && me.alive) {
      const done = this.night.stepDone;
      if (this.nightStep === 'mafia' && me.role === 'mafia') {
        action = {
          type: 'kill',
          targets: this.alive().filter((p) => p.role !== 'mafia').map((p) => p.id),
          yourPick: this.night.mafiaPicks.get(me.id) ?? null,
          picks: [...this.night.mafiaPicks].map(([by, target]) => ({ by, target })),
          done,
        };
      } else if (this.nightStep === 'doctor' && me.role === 'doctor') {
        action = { type: 'save', targets: this.alive().map((p) => p.id), yourPick: this.night.save, picks: [], done };
      } else if (this.nightStep === 'officer' && me.role === 'officer') {
        action = {
          type: 'suspect',
          targets: this.alive().filter((p) => p.id !== me.id).map((p) => p.id),
          yourPick: this.night.suspect,
          picks: [],
          done,
        };
      }
    }

    return {
      code: this.code,
      phase: this.phase,
      nightStep: this.nightStep,
      round: this.round,
      winner: this.winner,
      hostId: this.hostId,
      mafiaCount: this.mafiaCount(),
      mafiaSetting: this.mafiaSetting,
      you: { id: me.id, name: me.name, role: me.role, alive: me.alive, playing: me.playing, isHost: me.id === this.hostId },
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: !!p.socketId,
        playing: p.playing,
        alive: inGame ? p.alive : true,
        ready: p.ready,
        fate: p.fate,
        // Public knowledge only: caught and voted-out players have their side revealed.
        reveal: p.fate === 'caught' ? 'mafia' : p.fate === 'ousted' ? (p.role === 'mafia' ? 'mafia' : 'innocent') : null,
        role: ended ? p.role : null,
      })),
      mates: me.role === 'mafia' ? this.players.filter((p) => p.role === 'mafia' && p.id !== me.id).map((p) => p.id) : [],
      action,
      announcements: this.announcements,
      log: this.log,
      officerNote: me.role === 'officer' && this.phase === 'day' ? this.officerNote : null,
      vote: {
        yourVote: this.votes.get(me.id) ?? null,
        yourConfirmed: this.confirmed.has(me.id),
        voted: [...this.confirmed],
        total: this.alive().length,
        result: this.phase === 'result' || ended ? this.lastVote : null,
      },
    };
  }
}

export type RoomView = ReturnType<Room['viewFor']>;
