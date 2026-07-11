import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ namespace: '/' })
export class LiveGateway {
  @WebSocketServer()
  private server!: Server;

  emitProcessedEvent(event: unknown): void {
    this.server.emit('processed-event', event);
  }
}
