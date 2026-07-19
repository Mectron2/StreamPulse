import { Subscriber } from 'rxjs';

export async function readSSE<TEvent>(
  signal: AbortSignal,
  url: string,
  subscriber: Subscriber<TEvent>,
  parseEvent: (value: unknown) => TEvent | undefined,
): Promise<void> {
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/event-stream' },
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`Unexpected response ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (!subscriber.closed) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = emitBufferedEvents(buffer, subscriber, parseEvent);
    }

    buffer += decoder.decode();
    emitBufferedEvents(`${buffer}\n\n`, subscriber, parseEvent);

    if (!subscriber.closed) {
      subscriber.complete();
    }
  } catch (error) {
    if (!signal.aborted && !subscriber.closed) {
      subscriber.error(error);
    }
  }
}

function emitBufferedEvents<TEvent>(
  buffer: string,
  subscriber: Subscriber<TEvent>,
  parseEvent: (value: unknown) => TEvent | undefined,
): string {
  const normalizedBuffer = buffer.replace(/\r\n/g, '\n');
  const events = normalizedBuffer.split('\n\n');
  const remainingBuffer = events.pop() ?? '';

  for (const event of events) {
    const data = event
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');

    if (!data) {
      continue;
    }

    const parsedEvent = parseEvent(JSON.parse(data) as unknown);

    if (parsedEvent !== undefined) {
      subscriber.next(parsedEvent);
    }
  }

  return remainingBuffer;
}
