<script setup lang="ts">
import { computed } from 'vue';
import type { View } from '../types';
import { actions, nameOf } from '../game';
import Roster from './Roster.vue';

const props = defineProps<{ v: View }>();

const candidates = computed(() => props.v.players.filter((p) => p.alive && p.id !== props.v.you.id));
const result = computed(() => props.v.vote.result);
</script>

<template>
  <div class="screen">
    <div class="card accent stack">
      <p class="eyebrow">{{ v.phase === 'result' ? 'The verdict' : 'Announcement' }}</p>
      <h3 v-for="line in v.announcements" :key="line">{{ line }}</h3>
    </div>

    <div v-if="v.officerNote" class="card private stack">
      <p class="eyebrow">Only you can see this</p>
      <p>{{ v.officerNote }}</p>
    </div>

    <!-- Discussion: voting is open the whole time and votes can be changed. -->
    <template v-if="v.phase === 'day'">
      <div>
        <h2>Discuss and vote</h2>
        <p class="muted">
          {{ v.vote.voted.length }} of {{ v.vote.total }} votes confirmed. Everyone alive must vote. Voting closes by
          itself when the last vote is confirmed, and you can change yours until then.
        </p>
      </div>
      <div v-if="v.you.alive" class="choices">
        <button
          v-for="p in candidates"
          :key="p.id"
          class="choice"
          :class="{ on: v.vote.yourVote === p.id }"
          @click="actions.vote(p.id)"
        >
          <span class="avatar">{{ p.name[0].toUpperCase() }}</span>
          <span class="name">{{ p.name }}</span>
          <span v-if="v.vote.yourVote === p.id" class="tag mafia">Your vote</span>
          <span v-if="!p.connected" class="tag">Away</span>
          <span v-if="v.vote.voted.includes(p.id)" class="tag ok">Confirmed</span>
        </button>
        <button v-if="!v.vote.yourConfirmed" class="primary block" :disabled="!v.vote.yourVote" @click="actions.confirmVote()">
          {{ v.vote.yourVote ? `Confirm my vote for ${nameOf(v.vote.yourVote)}` : 'Pick someone to vote out' }}
        </button>
        <p v-else class="muted center small">
          Vote confirmed for {{ nameOf(v.vote.yourVote!) }}. Tap another name to change it.
        </p>
      </div>
      <template v-else>
        <p class="muted">Only players who are still alive can vote.</p>
        <Roster :v="v" show-voted />
      </template>
    </template>

    <!-- Result -->
    <template v-else-if="result">
      <div class="stack">
        <h3>How the city voted</h3>
        <div v-for="t in result.tally" :key="t.id" class="card stack">
          <div class="row">
            <span class="grow">{{ nameOf(t.id) }}</span>
            <strong>{{ t.voters.length }}</strong>
          </div>
          <div class="bar"><i :style="{ width: (t.voters.length / v.vote.voted.length) * 100 + '%' }"></i></div>
          <p class="muted small">{{ t.voters.map(nameOf).join(', ') }}</p>
        </div>
      </div>
      <Roster :v="v" />
      <p class="muted center">Night {{ v.round + 1 }} begins in a moment. Get ready to close your eyes.</p>
    </template>
  </div>
</template>
