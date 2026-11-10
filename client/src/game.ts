import { computed, ref } from 'vue';
import { io } from 'socket.io-client';
import type { PlayerView, View } from './types';
import { keepAwake, speak, unlockVoice } from './narrator';

const SESSION_KEY = 'mafia.session';

export const view = ref<View | null>(null);
export const connected = ref(false);
export const error = ref('');
/** True until we know whether a saved session could be resumed. */
export const restoring = ref(true);

type Reply = { ok: boolean; error?: string; code?: string; token?: string };

function loadSession(): { code: string; token: string } | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null');
  } catch {
    return null;
  }
}
function saveSession(s: { code: string; token: string } | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode */
  }
}

const socket = io({ transports: ['websocket', 'polling'] });

async function send(event: string, body: object = {}): Promise<Reply> {
  try {
    const reply: Reply = await socket.timeout(6000).emitWithAck(event, body);
    error.value = reply.ok ? '' : (reply.error ?? 'Something went wrong.');
    return reply;
  } catch {
    error.value = 'No connection to the game server.';
    return { ok: false };
  }
}

// On every (re)connect, take our seat back using the saved token.
socket.on('connect', async () => {
  connected.value = true;
  const session = loadSession();
  if (session) {
    const reply = await send('rejoin', session);
    if (!reply.ok) {
      saveSession(null);
      view.value = null;
      error.value = '';
    }
  }
  restoring.value = false;
});
socket.on('disconnect', () => (connected.value = false));
socket.on('connect_error', () => (restoring.value = false));
socket.on('state', (v: View) => (view.value = v));
socket.on('narrate', ({ lines }: { lines: string[] }) => speak(lines));
socket.on('kicked', () => {
  saveSession(null);
  view.value = null;
  error.value = 'The host removed you from the game.';
});

export async function createGame(name: string, playing: boolean) {
  unlockVoice();
  keepAwake();
  const reply = await send('create', { name, playing });
  if (reply.ok) saveSession({ code: reply.code!, token: reply.token! });
}

export async function joinGame(code: string, name: string) {
  keepAwake();
  const reply = await send('join', { code, name });
  if (reply.ok) saveSession({ code: reply.code!, token: reply.token! });
}

export async function leaveGame() {
  await send('leave');
  saveSession(null);
  view.value = null;
  error.value = '';
}

export const actions = {
  configure: (opts: { mafiaCount?: number; hostPlays?: boolean }) => send('configure', opts),
  kick: (playerId: string) => send('kick', { playerId }),
  start: () => {
    unlockVoice();
    keepAwake();
    return send('start');
  },
  ready: () => {
    keepAwake();
    return send('ready');
  },
  nightAction: (targetId: string) => send('nightAction', { targetId }),
  vote: (targetId: string) => send('vote', { targetId }),
  confirmVote: () => send('confirmVote'),
  playAgain: () => send('playAgain'),
};

export const playersById = computed(() => {
  const map: Record<string, PlayerView> = {};
  for (const p of view.value?.players ?? []) map[p.id] = p;
  return map;
});
export const nameOf = (id: string) => playersById.value[id]?.name ?? '?';
