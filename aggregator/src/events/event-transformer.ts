import { randomUUID } from 'node:crypto';
import {
  ProcessedEvent,
  ProcessedEventType,
  WikimediaProject,
} from './processed-event.type';
import { WikimediaRecentChange } from './wikimedia-recent-change.type';

export function transformWikimediaEvent(
  event: WikimediaRecentChange,
): ProcessedEvent {
  const oldLength = normalizeNumber(event.length?.old);
  const newLength = normalizeNumber(event.length?.new);
  const diffSize = Math.abs((newLength ?? 0) - (oldLength ?? 0));
  const tags = detectTags(event);
  const domain = event.domain ?? event.meta?.domain ?? '';
  const wiki = event.wiki ?? '';

  return {
    source: 'wikimedia',
    id: getEventId(event),
    timestamp: getEventTimestamp(event),
    wiki,
    domain,
    project: getProject(domain),
    type: normalizeType(event.type),
    namespace: normalizeNumber(event.namespace) ?? 0,
    title: event.title ?? '',
    titleUrl: event.title_url,
    user: event.user ?? '',
    isBot: event.bot ?? false,
    isMinor: event.minor ?? false,
    isPatrolled: event.patrolled,
    oldLength,
    newLength,
    diffSize,
    comment: event.comment ?? '',
    tags,
    riskScore: calculateRiskScore(event, tags, diffSize),
    importanceScore: calculateImportanceScore(event, diffSize),
  };
}

export function getProject(domain: string): WikimediaProject {
  if (domain.includes('wikidata.org')) return 'wikidata';
  if (domain.includes('commons.wikimedia.org')) return 'commons';
  if (domain.includes('wiktionary.org')) return 'wiktionary';
  if (domain.includes('wikipedia.org')) return 'wikipedia';

  return 'other';
}

export function detectTags(event: WikimediaRecentChange): string[] {
  const tags: string[] = [];
  const comment = event.comment?.toLowerCase() ?? '';

  if (event.bot) tags.push('bot');
  if (event.minor) tags.push('minor');
  if (event.type === 'new') tags.push('new-page');
  if (event.type === 'categorize') tags.push('category-change');
  if (event.namespace === 0) tags.push('article');
  if (event.namespace === 6) tags.push('file');
  if (event.namespace === 14) tags.push('category');
  if (comment.includes('vandalism') || comment.includes('revert')) {
    tags.push('possible-vandalism');
  }
  if (comment.includes('quickstatements')) tags.push('batch-edit');
  if (comment.includes('warning')) tags.push('user-warning');

  return tags;
}

export function calculateRiskScore(
  event: WikimediaRecentChange,
  tags: string[],
  diffSize: number,
): number {
  let score = 0;

  if (tags.includes('possible-vandalism')) score += 50;
  if (tags.includes('user-warning')) score += 40;
  if (!event.patrolled) score += 15;
  if (!event.bot && diffSize > 500) score += 20;
  if (event.type === 'new') score += 10;
  if (event.user?.startsWith('~')) score += 15;
  if (event.minor && diffSize > 1000) score += 10;

  return Math.min(score, 100);
}

export function calculateImportanceScore(
  event: WikimediaRecentChange,
  diffSize: number,
): number {
  let score = 0;

  if (event.namespace === 0) score += 30;
  if (event.type === 'new') score += 25;
  if (diffSize > 1000) score += 25;
  else if (diffSize > 300) score += 15;
  else if (diffSize > 50) score += 5;

  if (event.wiki === 'enwiki') score += 10;
  if (event.wiki === 'wikidatawiki') score += 10;
  if (event.bot) score -= 15;

  return Math.max(0, Math.min(score, 100));
}

function getEventId(event: WikimediaRecentChange): string {
  if (event.meta?.id) return event.meta.id;
  if (event.id !== undefined) return String(event.id);

  return randomUUID();
}

function getEventTimestamp(event: WikimediaRecentChange): Date {
  if (typeof event.timestamp === 'number') {
    return new Date(event.timestamp * 1000);
  }

  if (event.meta?.dt) {
    const timestamp = new Date(event.meta.dt);

    if (!Number.isNaN(timestamp.getTime())) {
      return timestamp;
    }
  }

  return new Date();
}

function normalizeType(type: string | undefined): ProcessedEventType {
  if (
    type === 'edit' ||
    type === 'new' ||
    type === 'categorize' ||
    type === 'log'
  ) {
    return type;
  }

  return 'unknown';
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}
