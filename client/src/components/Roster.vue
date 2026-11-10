<script setup lang="ts">
import type { View } from '../types';

defineProps<{ v: View; showVoted?: boolean }>();
const FATE = { killed: 'Killed', caught: 'Caught', ousted: 'Voted out' };
</script>

<template>
  <ul class="roster">
    <li v-for="p in v.players.filter((x) => x.playing)" :key="p.id" :class="{ dead: !p.alive }">
      <span class="avatar">{{ p.name[0].toUpperCase() }}</span>
      <span class="name">{{ p.name }}<span v-if="p.id === v.you.id" class="muted"> (you)</span></span>
      <span v-if="p.alive && !p.connected" class="tag">Away</span>
      <span v-if="showVoted && p.alive && v.vote.voted.includes(p.id)" class="tag ok">Confirmed</span>
      <span v-if="p.fate" class="tag">{{ FATE[p.fate] }}</span>
      <span v-if="p.reveal" class="tag" :class="p.reveal">{{ p.reveal === 'mafia' ? 'Mafia' : 'Innocent' }}</span>
    </li>
  </ul>
</template>
