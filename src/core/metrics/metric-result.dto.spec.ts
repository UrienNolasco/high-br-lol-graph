import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { MetricResultDto, METRIC_OPENAPI_EXAMPLES } from './metric-result.dto';

@Module({})
class ContractTestModule {}

describe('metrics OpenAPI contract', () => {
  it('publishes nullable values, provenance, denominator, evidence and all state examples', async () => {
    const module = await Test.createTestingModule({
      imports: [ContractTestModule],
    }).compile();
    const app = module.createNestApplication();
    try {
      const doc = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().setTitle('metrics').setVersion('1').build(),
        { extraModels: [MetricResultDto] },
      );
      const schema = doc.components?.schemas?.MetricResultDto;
      expect(schema).toMatchObject({
        properties: {
          origin: { enum: ['observed', 'derived', 'estimated', 'unavailable'] },
          value: { type: 'number', nullable: true },
          denominator: {
            nullable: true,
            properties: { population: { type: 'string' } },
          },
          evidence: { type: 'array' },
        },
      });
      expect(Object.keys(METRIC_OPENAPI_EXAMPLES)).toEqual([
        'observed',
        'derived',
        'estimated',
        'unavailable',
      ]);
    } finally {
      await app.close();
    }
  });
});
