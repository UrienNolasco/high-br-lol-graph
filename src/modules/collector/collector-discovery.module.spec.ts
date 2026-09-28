import { Test } from '@nestjs/testing';
import { CollectorDiscoveryModule } from './collector-discovery.module';
import { DISCOVERY_RECORDER } from '../../core/processing/contracts/request-ingestion';
import { OBSERVATION_READER } from '../../core/processing/ports/observation-reader';

describe('CollectorDiscoveryModule', () => {
  it('exposes the recorder and reader without starting external adapters', async () => {
    const module = await Test.createTestingModule({
      imports: [CollectorDiscoveryModule],
    }).compile();
    expect(module.get(DISCOVERY_RECORDER)).toBeDefined();
    expect(module.get(OBSERVATION_READER)).toBeDefined();
    await module.close();
  });
});
