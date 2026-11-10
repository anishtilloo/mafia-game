<script setup lang="ts">
import { computed } from 'vue';
import type { View } from '../types';
import { actions, nameOf } from '../game';

const props = defineProps<{ v: View }>();

const PROMPT = {
  kill: { title: 'Who dies tonight?', hint: 'Every Mafia must pick the same person.' },
  save: { title: 'Who do you save?', hint: 'You may save yourself.' },
  suspect: { title: 'Who is the Mafia?', hint: 'If you are right, they are caught.' },
};

const act = computed(() => props.v.action);
const pickersOf = (targetId: string) =>
  (act.value?.picks ?? []).filter((p) => p.target === targetId && p.by !== props.v.you.id).map((p) => nameOf(p.by));
</script>

<template>
  <div class="screen night">
    <!-- It is this player's turn: only they have their eyes open. -->
    <template v-if="act && !act.done">
      <div>
        <p class="eyebrow">Night {{ v.round }} · your turn</p>
        <h2>{{ PROMPT[act.type].title }}</h2>
        <p class="muted">{{ PROMPT[act.type].hint }}</p>
      </div>
      <div class="choices">
        <button
          v-for="id in act.targets"
          :key="id"
          class="choice"
          :class="{ on: act.yourPick === id }"
          @click="actions.nightAction(id)"
        >
          <span class="avatar">{{ nameOf(id)[0].toUpperCase() }}</span>
          <span class="name">{{ nameOf(id) }}<span v-if="id === v.you.id" class="muted"> (you)</span></span>
          <span v-for="n in pickersOf(id)" :key="n" class="tag mafia">{{ n }}</span>
        </button>
      </div>
    </template>

    <template v-else>
      <div class="moon"></div>
      <h2>{{ act?.done ? 'Done' : 'The city sleeps' }}</h2>
      <p class="muted">
        <template v-if="act?.done">Close your eyes again.</template>
        <template v-else-if="v.you.alive">Keep your eyes closed and listen for your role.</template>
        <template v-else-if="v.you.playing">You are out of the game. Watch quietly.</template>
        <template v-else>The night is in progress.</template>
      </p>
    </template>
  </div>
</template>
