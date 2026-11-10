import type { Role } from './types';

export const ROLE_INFO: Record<Role, { title: string; text: string }> = {
  mafia: {
    title: 'Mafia',
    text: 'Each night, agree with your fellow Mafia on who to kill. By day, blend in and stay hidden.',
  },
  doctor: {
    title: 'the Doctor',
    text: 'Each night, choose one person to save. You may save yourself.',
  },
  officer: {
    title: 'the Officer',
    text: 'Each night, point at one suspect. If they are a Mafia, they are caught and removed.',
  },
  villager: {
    title: 'a Villager',
    text: 'Sleep through the night. By day, find the Mafia and vote them out.',
  },
};
