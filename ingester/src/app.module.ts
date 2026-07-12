import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { WikimediaSource } from './wikimedia/wikimedia-source';
import { EVENT_SOURCE } from './event-source.interface';

@Module({
  imports: [],
  providers: [
    AppService,
    WikimediaSource,
    {
      provide: EVENT_SOURCE,
      useExisting: WikimediaSource,
    },
  ],
  exports: [EVENT_SOURCE],
})
export class AppModule {}
