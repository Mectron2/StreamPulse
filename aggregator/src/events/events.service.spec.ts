import { Repository } from 'typeorm';
import { EventsService } from './events.service';
import { ProcessedEventEntity } from './processed-event.entity';

describe('EventsService', () => {
  it('saves processed event and returns it', async () => {
    const saveMock = jest.fn().mockResolvedValue(undefined);
    const repository = {
      save: saveMock,
    } as unknown as Repository<ProcessedEventEntity>;
    const service = new EventsService(repository);

    const result = await service.processAndSave({
      id: 1,
      timestamp: 1783425600,
      wiki: 'wikidatawiki',
      domain: 'www.wikidata.org',
      type: 'new',
      namespace: 0,
      title: 'Q123',
      user: 'Example',
      length: {
        old: 0,
        new: 700,
      },
      comment: 'created item',
    });

    expect(saveMock).toHaveBeenCalledWith(result);
    expect(result).toMatchObject({
      id: '1',
      project: 'wikidata',
      type: 'new',
      diffSize: 700,
      tags: ['new-page', 'article'],
      riskScore: 45,
      importanceScore: 80,
    });
  });
});
