export interface CollectorControl {
  getStatus(): Promise<{
    enabled: boolean;
    isRunning: boolean;
    lastRun: string | null;
    startHour: number;
    endHour: number;
  }>;
  setEnabled(enabled: boolean): Promise<void>;
  triggerNow(): Promise<void>;
}

export const COLLECTOR_CONTROL = Symbol('collector.control');
