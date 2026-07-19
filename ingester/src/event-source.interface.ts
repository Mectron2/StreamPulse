import { Observable } from 'rxjs';

export interface SourceEvent<TData = unknown> {
  readonly source: string;
  readonly type: string;
  readonly occurredAt: string;
  readonly ingestedAt: string;
  readonly externalId?: string;
  readonly data: TData;
}

export default interface EventSource<TData = unknown> {
  readonly name: string;
  connect(): Observable<SourceEvent<TData>>;
}

export const EVENT_SOURCES = Symbol('EVENT_SOURCES');
