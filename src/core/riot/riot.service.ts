import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class RiotService {
  private readonly logger = new Logger(RiotService.name);

  constructor(private readonly httpService: HttpService) {}
}
