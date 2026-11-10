<script setup lang="ts">
import { computed, ref } from 'vue';
import type { View } from '../types';
import { actions, nameOf } from '../game';
import { ROLE_INFO } from '../roles';

const props = defineProps<{ v: View }>();
const open = ref(false);
const seen = ref(false);

const me = computed(() => props.v.players.find((p) => p.id === props.v.you.id));
const playing = computed(() => props.v.players.filter((p) => p.playing));
const readyCount = computed(() => playing.value.filter((p) => p.ready).length);

function show() {
  open.value = true;
  seen.value = true;
}
</script>

<template>
  <div class="screen">
    <template v-if="v.you.role">
      <div class="center">
        <h2>Your role</h2>
        <p class="muted">Make sure nobody can see your screen.</p>
      </div>

      <div
        class="rolecard"
        :class="[{ open }, open ? v.you.role : '']"
        @pointerdown.prevent="show"
        @pointerup="open = false"
        @pointerleave="open = false"
        @pointercancel="open = false"
        @contextmenu.prevent
      >
        <template v-if="open">
          <p class="eyebrow">You are</p>
          <div class="rolename">{{ ROLE_INFO[v.you.role].title }}</div>
          <p>{{ ROLE_INFO[v.you.role].text }}</p>
          <p v-if="v.mates.length" class="tag mafia">With: {{ v.mates.map(nameOf).join(', ') }}</p>
        </template>
        <template v-else>
          <div class="rolename">?</div>
          <p class="muted">Press and hold to reveal</p>
        </template>
      </div>

      <button class="primary block" :disabled="!seen || me?.ready" @click="actions.ready()">
        {{ me?.ready ? 'Waiting for the others…' : seen ? 'I am ready' : 'Look at your role first' }}
      </button>
    </template>

    <div v-else class="center stack">
      <h2>Roles are out</h2>
      <p class="muted">Players are checking their roles.</p>
    </div>

    <div class="stack">
      <p class="muted small center">{{ readyCount }} of {{ playing.length }} ready</p>
      <div class="bar"><i :style="{ width: (readyCount / playing.length) * 100 + '%' }"></i></div>
    </div>
  </div>
</template>
