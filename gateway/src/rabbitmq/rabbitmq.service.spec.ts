import { ConsumeMessage } from 'amqplib';
import { LiveGateway } from '../live/live.gateway';
import { RabbitmqService } from './rabbitmq.service';

describe('RabbitmqService', () => {
  const emitProcessedEvent = jest.fn();
  const ack = jest.fn();
  const nack = jest.fn();
  const service = new RabbitmqService({
    emitProcessedEvent,
  } as unknown as LiveGateway);
  const message = (body: string) =>
    ({ content: Buffer.from(body) }) as ConsumeMessage;

  beforeEach(() => {
    emitProcessedEvent.mockReset();
    ack.mockReset();
    nack.mockReset();
    (service as unknown as { channel: unknown }).channel = { ack, nack };
  });

  it('broadcasts and acknowledges a valid event', () => {
    (
      service as unknown as { handleMessage(message: ConsumeMessage): void }
    ).handleMessage(message('{"id":"42"}'));
    expect(emitProcessedEvent).toHaveBeenCalledWith({ id: '42' });
    expect(ack).toHaveBeenCalled();
  });

  it('acknowledges invalid JSON without broadcasting it', () => {
    (
      service as unknown as { handleMessage(message: ConsumeMessage): void }
    ).handleMessage(message('invalid'));
    expect(emitProcessedEvent).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalled();
  });

  it('requeues an event when broadcasting fails', () => {
    emitProcessedEvent.mockImplementation(() => {
      throw new Error('broadcast failed');
    });
    const incoming = message('{"id":"42"}');
    (
      service as unknown as { handleMessage(message: ConsumeMessage): void }
    ).handleMessage(incoming);
    expect(nack).toHaveBeenCalledWith(incoming, false, true);
  });
});
