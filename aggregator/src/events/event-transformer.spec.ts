import {
  calculateImportanceScore,
  calculateRiskScore,
  detectTags,
  getProject,
  transformWikimediaEvent,
} from './event-transformer';
import { WikimediaRecentChange } from './wikimedia-recent-change.type';

describe('event-transformer', () => {
  it.each([
    ['www.wikidata.org', 'wikidata'],
    ['commons.wikimedia.org', 'commons'],
    ['en.wiktionary.org', 'wiktionary'],
    ['en.wikipedia.org', 'wikipedia'],
    ['example.org', 'other'],
  ])('classifies %s as %s', (domain, project) => {
    expect(getProject(domain)).toBe(project);
  });

  it('transforms Wikimedia event into processed event', () => {
    const event: WikimediaRecentChange = {
      id: 123,
      timestamp: 1783425600,
      wiki: 'enwiki',
      domain: 'en.wikipedia.org',
      type: 'edit',
      namespace: 0,
      title: 'Stream processing',
      title_url: 'https://en.wikipedia.org/wiki/Stream_processing',
      user: '~temporary',
      bot: false,
      minor: true,
      patrolled: false,
      length: {
        old: 17519,
        new: 17493,
      },
      comment: 'Revert possible vandalism warning',
    };

    const processed = transformWikimediaEvent(event);

    expect(processed).toMatchObject({
      id: '123',
      wiki: 'enwiki',
      domain: 'en.wikipedia.org',
      project: 'wikipedia',
      type: 'edit',
      namespace: 0,
      title: 'Stream processing',
      titleUrl: 'https://en.wikipedia.org/wiki/Stream_processing',
      user: '~temporary',
      isBot: false,
      isMinor: true,
      isPatrolled: false,
      oldLength: 17519,
      newLength: 17493,
      diffSize: 26,
      comment: 'Revert possible vandalism warning',
      tags: ['minor', 'article', 'possible-vandalism', 'user-warning'],
      riskScore: 100,
      importanceScore: 40,
    });
    expect(processed.timestamp.toISOString()).toBe('2026-07-07T12:00:00.000Z');
  });

  it('normalizes unknown types and missing lengths', () => {
    const processed = transformWikimediaEvent({
      meta: {
        id: 'meta-id',
        dt: '2026-07-07T00:00:00.000Z',
        domain: 'commons.wikimedia.org',
      },
      type: 'external',
      namespace: 6,
      bot: true,
      comment: 'QuickStatements update',
    });

    expect(processed).toMatchObject({
      id: 'meta-id',
      domain: 'commons.wikimedia.org',
      project: 'commons',
      type: 'unknown',
      namespace: 6,
      diffSize: 0,
      tags: ['bot', 'file', 'batch-edit'],
      importanceScore: 0,
    });
  });

  it('detects tags from event metadata and comment', () => {
    expect(
      detectTags({
        bot: true,
        minor: true,
        type: 'new',
        namespace: 14,
        comment: 'User warning via QuickStatements',
      }),
    ).toEqual([
      'bot',
      'minor',
      'new-page',
      'category',
      'batch-edit',
      'user-warning',
    ]);
  });

  it('clamps risk score to 100', () => {
    const event: WikimediaRecentChange = {
      type: 'new',
      user: '~temporary',
      bot: false,
      minor: true,
      patrolled: false,
    };

    expect(
      calculateRiskScore(event, ['possible-vandalism', 'user-warning'], 1200),
    ).toBe(100);
  });

  it('clamps importance score between 0 and 100', () => {
    expect(
      calculateImportanceScore(
        {
          namespace: 0,
          type: 'new',
          wiki: 'enwiki',
          bot: false,
        },
        1500,
      ),
    ).toBe(90);

    expect(
      calculateImportanceScore(
        {
          namespace: 2,
          type: 'edit',
          wiki: 'frwiki',
          bot: true,
        },
        0,
      ),
    ).toBe(0);
  });
});
