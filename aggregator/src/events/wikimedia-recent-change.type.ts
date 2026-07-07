export type WikimediaRecentChange = {
  id?: string | number;
  meta?: {
    id?: string;
    dt?: string;
    domain?: string;
  };
  timestamp?: number;
  wiki?: string;
  domain?: string;
  type?: string;
  namespace?: number;
  title?: string;
  title_url?: string;
  user?: string;
  bot?: boolean;
  minor?: boolean;
  patrolled?: boolean;
  length?: {
    old?: number;
    new?: number;
  };
  comment?: string;
};
