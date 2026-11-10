import { ref, shallowRef, watch } from 'vue';

/** The line currently being spoken, shown as a caption on the host device. */
export const caption = ref('');
export const voiceSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** The last speech failure on this device, shown to the host so silence isn't a mystery. */
export const voiceError = ref('');
const pending = new Set<SpeechSynthesisUtterance>();

/** Voices this device offers. Browsers load them asynchronously, so this fills in after start-up. */
export const voices = shallowRef<SpeechSynthesisVoice[]>([]);

/** The host's narrator choice, remembered on this device. voiceURI '' means "pick automatically". */
export interface VoiceSettings {
  voiceURI: string;
  rate: number;
  pitch: number;
}
const SETTINGS_KEY = 'mafia.narrator';
const DEFAULTS: VoiceSettings = { voiceURI: '', rate: 0.9, pitch: 0.8 };

function loadSettings(): VoiceSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (saved && typeof saved === 'object') return { ...DEFAULTS, ...saved };
  } catch {
    /* storage blocked or corrupt: use defaults */
  }
  return { ...DEFAULTS };
}
export const voiceSettings = ref<VoiceSettings>(loadSettings());
watch(
  voiceSettings,
  (s) => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* not persisted; the choice still applies for this session */
    }
  },
  { deep: true },
);

if (voiceSupported) {
  const refresh = () => {
    // English voices first, then the rest, each group sorted by name.
    const all = [...speechSynthesis.getVoices()];
    const en = (v: SpeechSynthesisVoice) => (v.lang.startsWith('en') ? 0 : 1);
    voices.value = all.sort((a, b) => en(a) - en(b) || a.name.localeCompare(b.name));
  };
  refresh();
  speechSynthesis.addEventListener('voiceschanged', refresh);
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = speechSynthesis.getVoices();
  const chosen = voiceSettings.value.voiceURI;
  if (chosen) {
    const match = voices.find((v) => v.voiceURI === chosen);
    if (match) return match;
  }
  return (
    // Prefer voices installed on the device: online ("Google …") voices fail silently in some browsers.
    voices.find((v) => v.lang === 'en-IN' && v.localService) ??
    voices.find((v) => v.lang.startsWith('en') && v.default && v.localService) ??
    voices.find((v) => v.lang.startsWith('en') && v.localService) ??
    voices.find((v) => v.lang === 'en-IN') ??
    voices.find((v) => v.lang.startsWith('en'))
  );
}

/** Speaks the god's lines one after another on this device. */
export function speak(lines: string[]) {
  if (!voiceSupported) {
    caption.value = lines.join(' ');
    return;
  }
  // Chrome-based browsers can leave the speech queue stuck in a paused state; this un-sticks it.
  speechSynthesis.resume();
  voiceError.value = '';
  for (const line of lines) {
    const u = new SpeechSynthesisUtterance(line);
    // Chrome can garbage-collect utterances mid-speech (cutting them off); hold a reference until done.
    pending.add(u);
    u.onerror = (e) => {
      pending.delete(u);
      if (e.error === 'canceled' || e.error === 'interrupted') return;
      voiceError.value = `Speech failed (${e.error}). Try another voice, or a different browser.`;
      console.warn('[narrator] speech error:', e.error, 'voice:', u.voice?.name);
    };
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = voiceSettings.value.rate;
    u.pitch = voiceSettings.value.pitch;
    u.onstart = () => (caption.value = line);
    u.onend = () => {
      pending.delete(u);
      if (caption.value === line) caption.value = '';
    };
    speechSynthesis.speak(u);
  }
}

/**
 * Mobile browsers only allow speech after a tap. Call this from a click
 * handler on the host device (creating the game, testing the voice, starting).
 */
export function unlockVoice() {
  if (!voiceSupported) return;
  speechSynthesis.getVoices();
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  speechSynthesis.speak(u);
}

// Keep the screen on: everybody has their eyes closed at night, and a locked
// phone drops its connection (and silences the narrator on the host device).
let lock: { release(): Promise<void> } | null = null;
export async function keepAwake() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<typeof lock> } };
    if (!nav.wakeLock || document.visibilityState !== 'visible') return;
    lock = await nav.wakeLock.request('screen');
  } catch {
    /* not supported, or not on HTTPS */
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && lock) keepAwake();
  });
}
