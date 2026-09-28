export interface ProcessMatchRequest {
  matchId: string;
  traceId?: string;
}

export interface ProcessMatchUseCase {
  processMatch(request: ProcessMatchRequest, offline?: boolean): Promise<void>;
}

export const PROCESS_MATCH = Symbol('processing.process-match');
