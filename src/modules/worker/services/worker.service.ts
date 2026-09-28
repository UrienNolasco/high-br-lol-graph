import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ProcessMatchDto } from '../dto/process-match.dto';
import {
  PROCESS_MATCH,
  type ProcessMatchUseCase,
} from '../../processing/contracts/process-match';

/** AMQP/HTTP adapter. Processing owns fetching, preparation and persistence. */
@Injectable()
export class WorkerService {
  constructor(
    @Inject(PROCESS_MATCH)
    private readonly processMatchUseCase: ProcessMatchUseCase,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WorkerService.name);
  }

  processMatch(payload: ProcessMatchDto, offline = false): Promise<void> {
    return this.processMatchUseCase.processMatch(payload, offline);
  }
}
