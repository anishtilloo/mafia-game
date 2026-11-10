<script setup lang="ts">
import { computed, ref } from 'vue';
import { actions, connected, error, leaveGame, restoring, view } from './game';
import { caption } from './narrator';
import Home from './components/Home.vue';
import Lobby from './components/Lobby.vue';
import RoleReveal from './components/RoleReveal.vue';
import Night from './components/Night.vue';
import Town from './components/Town.vue';
import End from './components/End.vue';
import { ROLE_INFO } from './roles';

const v = view;
const peeking = ref(false);

const phaseLabel = computed(() => {
  const s = v.value;
  if (!s) return '';
  switch (s.phase) {
    case 'lobby': return 'Lobby';
    case 'roles': return 'Roles';
    case 'night': return `Night ${s.round}`;
    case 'day': return `Day ${s.round}`;
    case 'result': return `Day ${s.round} · Verdict`;
    default: return 'Game over';
  }
});

const canPeek = computed(() => {
  const s = v.value;
  return !!s && !!s.you.role && ['day', 'result'].includes(s.phase);
});

function leave() {
  if (confirm('Leave this game?')) leaveGame();
}
</script>

<template>
  <div class="shell">
    <div v-if="restoring" class="screen center"><p class="muted">Connecting…</p></div>

    <Home v-else-if="!v" />

    <template v-else>
      <header class="topbar">
        <span class="dot" :class="{ off: !connected }" :title="connected ? 'Connected' : 'Reconnecting'"></span>
        <span class="code">{{ v.code }}</span>
        <span class="eyebrow grow">{{ phaseLabel }}</span>
        <span v-if="v.phase !== 'lobby' && v.phase !== 'ended' && v.you.playing && !v.you.alive" class="tag">Spectator</span>
        <button class="link" @click="leave">Leave</button>
      </header>

      <Lobby v-if="v.phase === 'lobby'" :v="v" />
      <RoleReveal v-else-if="v.phase === 'roles'" :v="v" />
      <Night v-else-if="v.phase === 'night'" :v="v" />
      <End v-else-if="v.phase === 'ended'" :v="v" />
      <Town v-else :v="v" />

      <p v-if="error" class="error">{{ error }}</p>

      <!-- What the god is saying right now (host device only). -->
      <div v-if="v.you.isHost && caption" class="caption">“{{ caption }}”</div>

      <div class="hostbar">
        <button
          v-if="canPeek"
          class="ghost block small"
          @pointerdown.prevent="peeking = true"
          @pointerup="peeking = false"
          @pointerleave="peeking = false"
          @pointercancel="peeking = false"
          @contextmenu.prevent
        >
          {{ peeking ? `You are ${ROLE_INFO[v.you.role!].title}` : 'Hold to peek at your role' }}
        </button>

        <button v-if="v.you.isHost && v.phase === 'ended'" class="primary block" @click="actions.playAgain()">Play again</button>
      </div>
    </template>
  </div>
</template>
