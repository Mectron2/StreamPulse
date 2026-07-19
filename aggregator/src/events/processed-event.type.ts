export type ProcessedEventType =
  'edit' | 'new' | 'categorize' | 'log' | 'unknown';

export type WikimediaProject =
  'wikipedia' | 'wikidata' | 'commons' | 'wiktionary' | 'other';

export type ProcessedEvent = {
  source: 'wikimedia';
  id: string;
  timestamp: Date;
  wiki: string;
  domain: string;
  project: WikimediaProject;
  type: ProcessedEventType;
  namespace: number;
  title: string;
  titleUrl?: string;
  user: string;
  isBot: boolean;
  isMinor: boolean;
  isPatrolled?: boolean;
  oldLength?: number;
  newLength?: number;
  diffSize: number;
  comment: string;
  tags: string[];
  riskScore: number;
  importanceScore: number;
};
