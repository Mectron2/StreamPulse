import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  namespace: '/',
  cors: {
    origin: process.env.FRONTEND_ORIGIN ?? 'http://localhost:5173',
  },
})
export class LiveGateway {
  @WebSocketServer()
  private server!: Server;

  emitProcessedEvent(event: unknown): void {
    this.server.emit('processed-event', event);
  }
}
