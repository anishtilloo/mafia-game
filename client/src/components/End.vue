<script setup lang="ts">
import type { Role, View } from '../types';

defineProps<{ v: View }>();
const LABEL: Record<Role, string> = { mafia: 'Mafia', doctor: 'Doctor', officer: 'Officer', villager: 'Villager' };
const TAG: Record<Role, string> = { mafia: 'mafia', doctor: 'ok', officer: 'blue', villager: '' };
</script>

<template>
  <div class="screen">
    <div class="card accent center stack">
      <p class="eyebrow">Game over</p>
      <h1>{{ v.winner === 'mafia' ? 'Mafia wins' : 'Village wins' }}</h1>
      <p class="muted">
        {{ v.winner === 'mafia' ? 'The Mafia has taken over the city.' : 'Every Mafia has been found.' }}
      </p>
    </div>

    <div class="stack">
      <h3>Who was who</h3>
      <ul class="roster">
        <li v-for="p in v.players.filter((x) => x.playing)" :key="p.id" :class="{ dead: !p.alive }">
          <span class="avatar">{{ p.name[0].toUpperCase() }}</span>
          <span class="name">{{ p.name }}</span>
          <span v-if="p.role" class="tag" :class="TAG[p.role]">{{ LABEL[p.role] }}</span>
        </li>
      </ul>
    </div>

    <div class="stack">
      <h3>What happened</h3>
      <div class="card stack">
        <p v-for="(e, i) in v.log" :key="i" class="small"><span class="muted">Round {{ e.round }} ·</span> {{ e.text }}</p>
      </div>
    </div>

    <p v-if="!v.you.isHost" class="muted center">The host can start another game.</p>
  </div>
</template>
