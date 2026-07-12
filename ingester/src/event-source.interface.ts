import { Observable } from 'rxjs';

export default interface EventSource<TEvent> {
  readonly name: string;
  connect(): Observable<TEvent>;
}

export const EVENT_SOURCE = Symbol('EVENT_SOURCE');
