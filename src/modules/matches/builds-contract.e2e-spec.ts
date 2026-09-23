import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import request from 'supertest';
import { MatchesModule } from './matches.module';
import { PrismaService } from '../../core/prisma/prisma.service';
import { DataDragonService } from '../../core/data-dragon/data-dragon.service';
import { projectFinalInventory } from '../../core/riot/final-inventory';
import { unavailableItemCatalog } from '../../core/data-dragon/item-catalog';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { mockPrismaService } from '../../../test/helpers/shared-mocks';
describe('builds inventory HTTP and OpenAPI', () => {
  let app: INestApplication;
  const prisma = mockPrismaService();
  const dragon = { getItemCatalogForGameVersion: jest.fn() };
  const path = '/api/v1/matches/BR1_1/builds';
  beforeAll(async () => {
    app = await createTestingApp(MatchesModule, {
      overrides: [
        { provide: PrismaService, useValue: prisma },
        { provide: DataDragonService, useValue: dragon },
      ],
    });
  });
  afterAll(async () => app.close());
  it('exposes slots and explicit catalog absence, including empty slots and quest item', async () => {
    prisma.match.findUnique.mockResolvedValue({
      gameVersion: '16.2.741',
      participants: [
        {
          puuid: 'p',
          championId: 1,
          championName: 'A',
          itemTimeline: [],
          finalInventory: projectFinalInventory({
            item0: 0,
            item1: 999999,
            item6: 3363,
            roleBoundItem: 1220,
          }),
        },
      ],
    });
    dragon.getItemCatalogForGameVersion.mockResolvedValue(
      unavailableItemCatalog('16.2.741'),
    );
    const { body } = await request(app.getHttpServer()).get(path).expect(200);
    expect(body.builds[0].finalBuild).toHaveLength(7);
    expect(body.builds[0].finalBuild[0]).toMatchObject({
      slot: 0,
      itemId: 0,
      empty: true,
    });
    expect(body.builds[0].roleBoundItem.itemId).toBe(1220);
    expect(body.builds[0].finalBuild[1]).toMatchObject({
      itemId: 999999,
      metadata: null,
    });
  });
  it('documents nullable IDs, individual metadata and catalog versions and returns404', async () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const schemas = doc.components!.schemas! as Record<string, any>;
    expect(schemas.FinalItemDto.properties.itemId.nullable).toBe(true);
    expect(schemas.ParticipantBuildDto.properties.roleBoundItem).toBeDefined();
    expect(schemas.MatchBuildsDto.properties.catalog).toBeDefined();
    prisma.match.findUnique.mockResolvedValue(null);
    await request(app.getHttpServer()).get(path).expect(404);
  });
});
