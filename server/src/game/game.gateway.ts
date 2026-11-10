import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';
import { GameError, Player, Room, RoomHooks } from './room';

type Reply = { ok: true; [key: string]: unknown } | { ok: false; error: string };

@WebSocketGateway({ cors: { origin: true } })
export class GameGateway implements OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private readonly games: GameService) {}

  private hooks: RoomHooks = {
    // Each phone gets its own view, so secrets never reach the wrong device.
    onChange: (room) => {
      for (const p of room.players) {
        if (p.socketId) this.server.to(p.socketId).emit('state', room.viewFor(p));
      }
    },
    // Only the host device speaks.
    onNarrate: (room, lines) => {
      const host = room.get(room.hostId);
      if (host?.socketId) this.server.to(host.socketId).emit('narrate', { lines });
    },
  };

  private attach(socket: Socket, room: Room, player: Player) {
    socket.data.code = room.code;
    socket.data.playerId = player.id;
    room.setConnection(player.id, socket.id);
  }

  /** Runs a game action for the player behind this socket and turns errors into replies. */
  private act(socket: Socket, fn: (room: Room, playerId: string) => void): Reply {
    const room = this.games.find(socket.data.code);
    const playerId: string | undefined = socket.data.playerId;
    if (!room || !playerId || !room.get(playerId)) return { ok: false, error: 'You are not in a game.' };
    try {
      fn(room, playerId);
      return { ok: true };
    } catch (e) {
      if (e instanceof GameError) return { ok: false, error: e.message };
      console.error(e);
      return { ok: false, error: 'Something went wrong.' };
    }
  }

  handleDisconnect(socket: Socket) {
    const room = this.games.find(socket.data.code);
    const player = room?.get(socket.data.playerId);
    // Keep the seat: phones drop off whenever the screen locks, and rejoin later.
    if (room && player?.socketId === socket.id) room.setConnection(player.id, null);
  }

  @SubscribeMessage('create')
  create(@ConnectedSocket() socket: Socket, @MessageBody() body: { name: string; playing?: boolean }): Reply {
    const room = this.games.create(this.hooks);
    try {
      const player = room.addPlayer(body?.name, body?.playing !== false);
      this.attach(socket, room, player);
      return { ok: true, code: room.code, token: player.token };
    } catch (e) {
      this.games.remove(room);
      return { ok: false, error: e instanceof GameError ? e.message : 'Could not create the game.' };
    }
  }

  @SubscribeMessage('join')
  join(@ConnectedSocket() socket: Socket, @MessageBody() body: { code: string; name: string }): Reply {
    const room = this.games.find(body?.code);
    if (!room) return { ok: false, error: 'No game found with that code.' };
    try {
      const player = room.addPlayer(body?.name);
      this.attach(socket, room, player);
      return { ok: true, code: room.code, token: player.token };
    } catch (e) {
      return { ok: false, error: e instanceof GameError ? e.message : 'Could not join the game.' };
    }
  }

  @SubscribeMessage('rejoin')
  rejoin(@ConnectedSocket() socket: Socket, @MessageBody() body: { code: string; token: string }): Reply {
    const room = this.games.find(body?.code);
    const player = room?.byToken(body?.token);
    if (!room || !player) return { ok: false, error: 'That game is no longer running.' };
    this.attach(socket, room, player);
    return { ok: true, code: room.code };
  }

  @SubscribeMessage('leave')
  leave(@ConnectedSocket() socket: Socket): Reply {
    const room = this.games.find(socket.data.code);
    const reply = this.act(socket, (r, id) => {
      if (r.phase === 'lobby') {
        if (r.removePlayer(id)) this.games.remove(r);
      } else {
        r.setConnection(id, null);
      }
    });
    socket.data.code = socket.data.playerId = undefined;
    if (room && !room.players.length) this.games.remove(room);
    return reply;
  }

  @SubscribeMessage('kick')
  kick(@ConnectedSocket() socket: Socket, @MessageBody() body: { playerId: string }): Reply {
    return this.act(socket, (room, id) => {
      const target = room.get(body?.playerId);
      room.kick(id, body?.playerId);
      if (target?.socketId) this.server.to(target.socketId).emit('kicked');
    });
  }

  @SubscribeMessage('configure')
  configure(@ConnectedSocket() socket: Socket, @MessageBody() body: { mafiaCount?: number; hostPlays?: boolean }): Reply {
    return this.act(socket, (room, id) => room.configure(id, body ?? {}));
  }

  @SubscribeMessage('start')
  start(@ConnectedSocket() socket: Socket): Reply {
    return this.act(socket, (room, id) => room.start(id));
  }

  @SubscribeMessage('ready')
  ready(@ConnectedSocket() socket: Socket): Reply {
    return this.act(socket, (room, id) => room.ready(id));
  }

  @SubscribeMessage('nightAction')
  nightAction(@ConnectedSocket() socket: Socket, @MessageBody() body: { targetId: string }): Reply {
    return this.act(socket, (room, id) => room.nightAction(id, body?.targetId));
  }

  @SubscribeMessage('vote')
  vote(@ConnectedSocket() socket: Socket, @MessageBody() body: { targetId: string }): Reply {
    return this.act(socket, (room, id) => room.vote(id, body?.targetId));
  }

  @SubscribeMessage('confirmVote')
  confirmVote(@ConnectedSocket() socket: Socket): Reply {
    return this.act(socket, (room, id) => room.confirmVote(id));
  }

  @SubscribeMessage('playAgain')
  playAgain(@ConnectedSocket() socket: Socket): Reply {
    return this.act(socket, (room, id) => room.playAgain(id));
  }
}
