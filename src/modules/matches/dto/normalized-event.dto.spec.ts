import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NormalizedTimelineEventDto } from './normalized-event.dto';
@Module({})
class ContractModule {}
it('publishes nullable event identities/context and payload/quality without fabricated participant zero', async () => {
  const module = await Test.createTestingModule({
    imports: [ContractModule],
  }).compile();
  const app = module.createNestApplication();
  try {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Events').setVersion('1').build(),
      { extraModels: [NormalizedTimelineEventDto] },
    );
    expect(
      document.components?.schemas?.NormalizedTimelineEventDto,
    ).toMatchObject({
      properties: {
        frameIndex: { type: 'number' },
        eventIndex: { type: 'number' },
        actorParticipantId: { nullable: true },
        positionX: { nullable: true },
        ownerTeamId: { nullable: true },
        beneficiaryTeamId: { nullable: true },
        payload: { type: 'object', additionalProperties: true },
        quality: { type: 'object' },
        assistingParticipantIds: { type: 'array', nullable: true },
        assistingPuuids: {
          type: 'array',
          nullable: true,
          items: { type: 'string', nullable: true },
        },
      },
    });
  } finally {
    await app.close();
  }
});
