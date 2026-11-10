import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomInt } from 'crypto';
import { Room, RoomHooks } from './room';

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O: easy to read aloud
const IDLE_LIMIT_MS = 3 * 60 * 60 * 1000;

/** Holds every running room in memory. */
@Injectable()
export class GameService implements OnModuleDestroy {
  private rooms = new Map<string, Room>();
  private sweeper = setInterval(() => this.sweep(), 10 * 60 * 1000);

  create(hooks: RoomHooks): Room {
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => LETTERS[randomInt(LETTERS.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(code, hooks);
    this.rooms.set(code, room);
    return room;
  }

  find(code: string): Room | undefined {
    return this.rooms.get(String(code ?? '').trim().toUpperCase());
  }

  remove(room: Room) {
    room.destroy();
    this.rooms.delete(room.code);
  }

  private sweep() {
    for (const room of this.rooms.values()) {
      if (Date.now() - room.lastActivity > IDLE_LIMIT_MS) this.remove(room);
    }
  }

  onModuleDestroy() {
    clearInterval(this.sweeper);
    for (const room of this.rooms.values()) room.destroy();
  }
}
