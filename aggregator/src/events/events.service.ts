import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { transformWikimediaEvent } from './event-transformer';
import { ProcessedEventEntity } from './processed-event.entity';
import { ProcessedEvent } from './processed-event.type';
import { WikimediaRecentChange } from './wikimedia-recent-change.type';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(ProcessedEventEntity)
    private readonly processedEventsRepository: Repository<ProcessedEventEntity>,
  ) {}

  async processAndSave(event: WikimediaRecentChange): Promise<ProcessedEvent> {
    const processedEvent = transformWikimediaEvent(event);

    await this.processedEventsRepository.save(processedEvent);

    return processedEvent;
  }
}
