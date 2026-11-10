<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import QRCode from 'qrcode';
import type { View } from '../types';
import { actions } from '../game';
import { speak, unlockVoice, voiceError, voiceSupported, voices, voiceSettings } from '../narrator';

const props = defineProps<{ v: View }>();

const joinUrl = computed(() => `${location.origin}/?room=${props.v.code}`);
const qr = ref('');
watchEffect(async () => {
  qr.value = await QRCode.toDataURL(joinUrl.value, { margin: 0, width: 360 });
});

const playingCount = computed(() => props.v.players.filter((p) => p.playing).length);
const canStart = computed(() => playingCount.value >= 4);
const onLocalhost = ['localhost', '127.0.0.1'].includes(location.hostname);

function stepMafia(delta: number) {
  actions.configure({ mafiaCount: Math.max(0, props.v.mafiaSetting + delta) });
}
function testVoice() {
  // A tap while the sample is playing stops it. Never cancel and speak in the same tap:
  // Chrome-based browsers silently drop speech queued right after cancel().
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
    return;
  }
  unlockVoice();
  speak(['City sleeps. Everyone, close your eyes.']);
}
function resetVoice() {
  voiceSettings.value = { voiceURI: '', rate: 0.9, pitch: 0.8 };
}
</script>

<template>
  <div class="screen">
    <div class="card stack center">
      <p class="eyebrow">Room code</p>
      <div class="bigcode">{{ v.code }}</div>
      <img v-if="qr" :src="qr" class="qr" alt="QR code to join" />
      <p class="muted small">Scan, or open {{ joinUrl }}</p>
      <p v-if="onLocalhost" class="error small">
        You opened this on localhost, so the QR code only works on this device. Open the app with your
        computer's Wi-Fi address (printed in the server terminal) before inviting others.
      </p>
    </div>

    <div class="stack">
      <div class="row">
        <h3 class="grow">Players ({{ playingCount }})</h3>
        <span class="muted small">{{ v.mafiaCount }} Mafia · 1 Doctor · 1 Officer</span>
      </div>
      <ul class="roster">
        <li v-for="p in v.players" :key="p.id">
          <span class="avatar">{{ p.name[0].toUpperCase() }}</span>
          <span class="name">{{ p.name }}<span v-if="p.id === v.you.id" class="muted"> (you)</span></span>
          <span v-if="!p.connected" class="tag">Away</span>
          <span v-if="p.id === v.hostId" class="tag gold">{{ p.playing ? 'Host' : 'Narrator' }}</span>
          <button v-if="v.you.isHost && p.id !== v.you.id" class="link" @click="actions.kick(p.id)">Remove</button>
        </li>
      </ul>
    </div>

    <div v-if="v.you.isHost" class="card stack">
      <div class="row">
        <span class="grow">Mafias</span>
        <div class="stepper">
          <button type="button" :disabled="v.mafiaSetting === 0" @click="stepMafia(-1)">−</button>
          <span>{{ v.mafiaSetting === 0 ? 'Auto' : v.mafiaSetting }}</span>
          <button type="button" @click="stepMafia(1)">+</button>
        </div>
      </div>
      <label class="check">
        <input type="checkbox" :checked="v.you.playing" @change="actions.configure({ hostPlays: !v.you.playing })" />
        I am playing too
      </label>
      <template v-if="voiceSupported">
        <label class="field">
          Narrator voice
          <select v-model="voiceSettings.voiceURI" class="voice-select">
            <option value="">Automatic</option>
            <option v-for="voice in voices" :key="voice.voiceURI" :value="voice.voiceURI">
              {{ voice.name }} ({{ voice.lang }})
            </option>
          </select>
        </label>
        <label class="field">
          <span class="row"><span class="grow">Speed</span><span>{{ voiceSettings.rate.toFixed(1) }}×</span></span>
          <input v-model.number="voiceSettings.rate" type="range" min="0.5" max="1.5" step="0.1" class="slider" />
        </label>
        <label class="field">
          <span class="row"><span class="grow">Pitch</span><span>{{ voiceSettings.pitch.toFixed(1) }}</span></span>
          <input v-model.number="voiceSettings.pitch" type="range" min="0.5" max="1.5" step="0.1" class="slider" />
        </label>
        <div class="row">
          <button type="button" class="ghost grow" @click="testVoice">Test the narrator voice</button>
          <button type="button" class="link" @click="resetVoice">Reset</button>
        </div>
        <p v-if="voiceError" class="error small">{{ voiceError }}</p>
        <p v-else-if="voices.length === 0" class="error small">
          This browser reports no speech voices. In Brave, turn Shields off for this site (lion icon in the
          address bar) and reload, or host from Chrome or Safari.
        </p>
      </template>
      <p v-else class="error small">This browser cannot speak. Host from Chrome or Safari to get the narrator voice.</p>
    </div>

    <div class="hostbar">
      <button v-if="v.you.isHost" class="primary block" :disabled="!canStart" @click="actions.start()">
        {{ canStart ? 'Start game' : `Need ${4 - playingCount} more player${4 - playingCount === 1 ? '' : 's'}` }}
      </button>
      <p v-else class="muted center">Waiting for the host to start…</p>
    </div>
  </div>
</template>
