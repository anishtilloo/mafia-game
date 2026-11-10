// Mirrors Room.viewFor() on the server.
export type Role = 'mafia' | 'doctor' | 'officer' | 'villager';
export type Phase = 'lobby' | 'roles' | 'night' | 'day' | 'result' | 'ended';

export interface PlayerView {
  id: string;
  name: string;
  connected: boolean;
  playing: boolean;
  alive: boolean;
  ready: boolean;
  fate: 'killed' | 'caught' | 'ousted' | null;
  reveal: 'mafia' | 'innocent' | null;
  role: Role | null; // only filled in once the game has ended
}

export interface View {
  code: string;
  phase: Phase;
  nightStep: 'sleep' | 'mafia' | 'doctor' | 'officer' | null;
  round: number;
  winner: 'village' | 'mafia' | null;
  hostId: string;
  mafiaCount: number;
  mafiaSetting: number;
  you: { id: string; name: string; role: Role | null; alive: boolean; playing: boolean; isHost: boolean };
  players: PlayerView[];
  mates: string[];
  action: null | {
    type: 'kill' | 'save' | 'suspect';
    targets: string[];
    yourPick: string | null;
    picks: { by: string; target: string }[];
    done: boolean;
  };
  announcements: string[];
  log: { round: number; text: string }[];
  officerNote: string | null;
  vote: {
    yourVote: string | null;
    yourConfirmed: boolean;
    voted: string[];
    total: number;
    result: null | {
      tally: { id: string; voters: string[] }[];
      oustedId: string | null;
      wasMafia: boolean;
    };
  };
}
