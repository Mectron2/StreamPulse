import EventSource, { SourceEvent } from '../event-source.interface';
import { map, Observable } from 'rxjs';
import { WikimediaRecentChange } from './wikimedia-event.type';
import { readSSE } from '../utils/sse';
import { Injectable } from '@nestjs/common';
import { isRecord } from '../utils/misc';

@Injectable()
export class WikimediaSource implements EventSource<WikimediaRecentChange> {
  readonly name = 'wikimedia';
  private readonly recentChangesUrl =
    'https://stream.wikimedia.org/v2/stream/recentchange';

  private createRecentChangesStream(): Observable<WikimediaRecentChange> {
    return new Observable<WikimediaRecentChange>((subscriber) => {
      const abortController = new AbortController();

      void readSSE<WikimediaRecentChange>(
        abortController.signal,
        this.recentChangesUrl,
        subscriber,
        (value) => (isRecord(value) ? value : undefined),
      );

      return () => abortController.abort();
    });
  }

  connect(): Observable<SourceEvent<WikimediaRecentChange>> {
    return this.createRecentChangesStream().pipe(
      map((data) => ({
        source: this.name,
        type: 'recentchange',
        occurredAt: this.getOccurredAt(data),
        ingestedAt: new Date().toISOString(),
        externalId: this.getExternalId(data),
        data,
      })),
    );
  }

  private getOccurredAt(event: WikimediaRecentChange): string {
    const meta = event.meta;

    if (isRecord(meta) && typeof meta.dt === 'string') {
      return meta.dt;
    }

    return new Date().toISOString();
  }

  private getExternalId(event: WikimediaRecentChange): string | undefined {
    const id = event.id;
    return typeof id === 'string' || typeof id === 'number'
      ? String(id)
      : undefined;
  }
}
