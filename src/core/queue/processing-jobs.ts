export interface ProcessingJob {
  matchId: string;
  priority: number;
  traceId: string | null;
}

export interface ProcessingJobs {
  enqueue(
    matchId: string,
    priority?: number,
    traceId?: string,
  ): Promise<{ status: string; publishedAt: Date | null; matchId: string; priority: number; traceId: string | null }>;
  recoverExpired(now: Date): Promise<void>;
  duePublications(now: Date, limit: number): Promise<ProcessingJob[]>;
  markPublished(matchId: string, publishedAt: Date): Promise<void>;
  oldestPendingAgeMs(now: Date): Promise<number>;
}

export const PROCESSING_JOBS = Symbol('queue.processing-jobs');
