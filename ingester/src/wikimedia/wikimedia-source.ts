import EventSource from '../event-source.interface';
import { Observable } from 'rxjs';
import { WikimediaRecentChange } from './wikimedia-event.type';
import { readSSE } from '../utils/sse';
import { Injectable } from '@nestjs/common';

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
      );

      return () => abortController.abort();
    });
  }

  connect(): Observable<WikimediaRecentChange> {
    return this.createRecentChangesStream();
  }
}
