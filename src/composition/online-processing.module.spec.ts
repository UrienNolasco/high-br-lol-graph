import { Test } from '@nestjs/testing';
import { AppConfigModule } from '../core/config/config.module';
import { LoggerModule } from '../core/logger/logger.module';
import { RedisService } from '../core/redis/redis.service';
import { OnlineProcessingModule } from './online-processing.module';

describe('OnlineProcessingModule', () => {
  it('resolves the worker processing graph without the full application', async () => {
    const builder = Test.createTestingModule({
      imports: [AppConfigModule, LoggerModule, OnlineProcessingModule],
    });
    builder.overrideProvider(RedisService).useValue({});
    const module = await builder.compile();

    expect(module.get(OnlineProcessingModule)).toBeDefined();
    await module.close();
  });
});
