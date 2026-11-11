export type UserRole = 'admin' | 'client';

export interface User {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  companyId: number | null;
  companyName: string | null;
}

export interface Company {
  id: number;
  name: string;
  branchesCount: number;
}

export interface Branch {
  id: number;
  name: string;
  city: string;
  address: string;
  companyId: number;
  companyName: string;
  externalId: string | null;
}

export interface Period {
  from: string;
  to: string;
  days: number;
}

export interface Scope {
  companyId: number | null;
  branchId: number | null;
}

export type MetricKey = 'views' | 'websiteClicks' | 'calls' | 'routes' | 'rating' | 'reviewsCount';

export type MetricTotals = Record<Exclude<MetricKey, 'rating'>, number> & { rating: number | null };

export interface SummaryResponse {
  scope: Scope;
  period: Period;
  previousPeriod: Period;
  branchesCount: number;
  current: MetricTotals;
  previous: MetricTotals;
  /** есть ли строки за период (отличает «нет данных» от честных нулей) */
  hasData: boolean;
  previousHasData: boolean;
}

export interface TimeseriesResponse {
  scope: Scope;
  period: Period;
  metric: MetricKey;
  points: { date: string; value: number | null }[];
}

export interface BranchStats {
  branchId: number;
  name: string;
  city: string;
  address: string;
  companyId: number;
  companyName: string;
  totals: MetricTotals;
}

export interface ByBranchResponse {
  scope: Scope;
  period: Period;
  items: BranchStats[];
}

export type ReviewStatus = 'new' | 'in_progress' | 'resolved';

export interface Review {
  id: number;
  branchId: number;
  branchName: string;
  companyId: number;
  source: 'yandex' | '2gis' | 'google';
  authorName: string;
  rating: number;
  text: string;
  status: ReviewStatus;
  reply: string | null;
  publishedAt: string;
  processedAt: string | null;
}

export interface ReviewsResponse {
  items: Review[];
  total: number;
  page: number;
  limit: number;
  statusCounts: Record<ReviewStatus, number>;
}

export type SyncStatus = 'running' | 'succeeded' | 'failed';

export interface SyncJob {
  id: number;
  branchId: number;
  branchName: string;
  companyId: number;
  from: string;
  to: string;
  status: SyncStatus;
  attempts: number;
  fetched: number | null;
  inserted: number | null;
  updated: number | null;
  unchanged: number | null;
  error: string | null;
  requestedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface SyncResult {
  job: SyncJob;
  replayed: boolean;
}
