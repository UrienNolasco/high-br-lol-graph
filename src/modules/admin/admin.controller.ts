import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RateLimiterService } from '../../core/riot/rate-limiter.service';
import { CollectorService } from '../collector/collector.service';
import { RateLimitStatusDto } from './dto/rate-limit-status.dto';
import { ResetResponseDto } from './dto/reset-response.dto';

@ApiTags('Admin')
@Controller('api/v1/admin')
export class AdminController {
  constructor(
    private readonly rateLimiterService: RateLimiterService,
    private readonly collectorService: CollectorService,
  ) {}

  // ========== Rate Limit ==========

  @Get('rate-limit')
  @ApiOperation({ summary: 'Obtém o status atual do rate limit' })
  @ApiResponse({
    status: 200,
    description: 'Status retornado com sucesso.',
    type: RateLimitStatusDto,
  })
  async getRateLimitStatus(): Promise<RateLimitStatusDto> {
    return this.rateLimiterService.getStatus();
  }

  @Post('rate-limit/reset')
  @ApiOperation({ summary: 'Reseta o contador do rate limit no Redis' })
  @ApiResponse({
    status: 200,
    description: 'Contador do rate limit resetado com sucesso.',
    type: ResetResponseDto,
  })
  async resetRateLimit(): Promise<ResetResponseDto> {
    await this.rateLimiterService.clear();
    return { message: 'Rate limit tokens resetados com sucesso' };
  }

  // ========== Collector ==========

  @Get('collector')
  @ApiOperation({ summary: 'Obtém status do collector' })
  async getCollectorStatus() {
    return this.collectorService.getStatus();
  }

  @Post('collector/enable')
  @ApiOperation({ summary: 'Habilita o collector' })
  async enableCollector() {
    await this.collectorService.setEnabled(true);
    return { message: 'Collector habilitado' };
  }

  @Post('collector/disable')
  @ApiOperation({ summary: 'Desabilita o collector' })
  async disableCollector() {
    await this.collectorService.setEnabled(false);
    return { message: 'Collector desabilitado' };
  }

  @Post('collector/trigger')
  @ApiOperation({ summary: 'Dispara coleta manual' })
  async triggerCollector() {
    await this.collectorService.triggerNow();
    return { message: 'Coleta manual disparada' };
  }
}
