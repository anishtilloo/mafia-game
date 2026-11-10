<script setup lang="ts">
import { ref } from 'vue';
import { createGame, error, joinGame } from '../game';

const invited = new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
const tab = ref<'join' | 'create'>(invited ? 'join' : 'create');
const name = ref(localStorage.getItem('mafia.name') ?? '');
const code = ref(invited);
const playing = ref(true);
const busy = ref(false);

async function submit() {
  if (busy.value) return;
  busy.value = true;
  localStorage.setItem('mafia.name', name.value.trim());
  if (tab.value === 'create') await createGame(name.value, playing.value);
  else await joinGame(code.value, name.value);
  busy.value = false;
}
</script>

<template>
  <form class="screen" @submit.prevent="submit">
    <div class="center" style="padding: 32px 0 8px">
      <p class="eyebrow">The city sleeps</p>
      <h1>Mafia</h1>
      <p class="muted">Your phone is the narrator.</p>
    </div>

    <div class="tabs">
      <button type="button" :class="{ on: tab === 'create' }" @click="tab = 'create'">Host a game</button>
      <button type="button" :class="{ on: tab === 'join' }" @click="tab = 'join'">Join a game</button>
    </div>

    <label class="field">
      Your name
      <input v-model="name" type="text" maxlength="16" autocomplete="off" placeholder="e.g. Anish" />
    </label>

    <label v-if="tab === 'join'" class="field">
      Room code
      <input v-model="code" type="text" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="ABCD" style="text-transform: uppercase; letter-spacing: 0.3em" />
    </label>

    <template v-else>
      <label class="check"><input v-model="playing" type="checkbox" /> I am playing too</label>
      <p class="muted small">
        This device will speak for the god, so keep it in the middle of the group with the volume up.
        Untick the box if it is only a speaker on the table.
      </p>
    </template>

    <p v-if="error" class="error">{{ error }}</p>

    <button class="primary block" :disabled="busy || !name.trim() || (tab === 'join' && code.trim().length < 4)">
      {{ tab === 'create' ? 'Create game' : 'Join game' }}
    </button>
  </form>
</template>
