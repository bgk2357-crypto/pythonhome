// Shared response types only. Collection and cache live in server/news.py.
import type { NewsArticle } from './news-sources';
export type SourceStatus = { id: string; name: string; homepage: string; count: number; fetchedAt: string | null; checkedAt: string; status: 'ok' | 'stale' | 'unavailable' };
export type NewsResult = { articles: NewsArticle[]; sources: SourceStatus[]; generatedAt: string; refreshMinutes: number };
