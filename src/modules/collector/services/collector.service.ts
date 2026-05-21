import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Cron } from '@nestjs/schedule';
import { CollectorConfigService } from './collector-config.service';
import { CollectorPipelineService } from './collector-pipeline.service';

@Injectable()
export class CollectorService {
  private isRunning = false;

  constructor(
    private readonly config: CollectorConfigService,
    private readonly pipeline: CollectorPipelineService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CollectorService.name);
  }

  @Cron('0 */30 * * *')
  async scheduledCollection(): Promise<void> {
    const enabled = await this.config.isEnabled();
    if (!enabled || this.isRunning) return;

    const { startHour, endHour } = await this.config.getWindow();
    const hour = new Date().getHours();
    if (hour < startHour || hour >= endHour) return;

    this.logger.info(
      { event: 'collection_started', trigger: 'cron' },
      'Cron triggered collection',
    );
    this.isRunning = true;
    try {
      await this.pipeline.runCollection({ startHour, endHour });
      await this.config.setLastRun();
    } finally {
      this.isRunning = false;
    }
  }

  async triggerNow(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        { event: 'collection_skipped', reason: 'already_running' },
        'Collection already in progress, ignoring manual trigger',
      );
      return;
    }

    this.logger.info(
      { event: 'collection_started', trigger: 'manual' },
      'Manual trigger received',
    );
    this.isRunning = true;
    try {
      const window = await this.config.getWindow();
      await this.pipeline.runCollection(window);
      await this.config.setLastRun();
    } finally {
      this.isRunning = false;
    }
  }

  async setEnabled(enabled: boolean): Promise<void> {
    await this.config.setEnabled(enabled);
  }

  async getStatus(): Promise<{
    enabled: boolean;
    isRunning: boolean;
    lastRun: string | null;
    startHour: number;
    endHour: number;
  }> {
    const enabled = await this.config.isEnabled();
    const { startHour, endHour } = await this.config.getWindow();
    const lastRun = await this.config.getLastRun();
    return {
      enabled,
      isRunning: this.isRunning,
      lastRun,
      startHour,
      endHour,
    };
  }
}
