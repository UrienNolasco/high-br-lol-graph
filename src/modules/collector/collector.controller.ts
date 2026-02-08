import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CollectorService } from './collector.service';

@Controller('api/v1/collector')
@ApiTags('Collector')
export class CollectorController {
  constructor(private readonly collectorService: CollectorService) {}

  @Get('status')
  async getStatus() {
    return this.collectorService.getStatus();
  }

  @Post('enable')
  async enable() {
    await this.collectorService.setEnabled(true);
    return { message: 'Collector habilitado' };
  }

  @Post('disable')
  async disable() {
    await this.collectorService.setEnabled(false);
    return { message: 'Collector desabilitado' };
  }

  @Post('trigger')
  async trigger() {
    await this.collectorService.triggerNow();
    return { message: 'Coleta manual disparada' };
  }
}
