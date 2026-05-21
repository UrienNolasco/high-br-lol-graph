import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ChampionsModule } from './champions.module';
import { ChampionListService } from './services/champion-list.service';
import { CurrentPatchService } from './services/current-patch.service';
import { createTestingApp } from '../../../test/helpers/app.builder';
import { aChampion } from '../../../test/fixtures/shared/champion.fixture';
import { patch } from '../../../test/fixtures/shared/patch.fixture';

describe('ChampionsController (e2e)', () => {
  let app: INestApplication;
  const championList = {
    getAllChampions: jest.fn().mockResolvedValue({ champions: [], total: 0 }),
  };
  const currentPatch = {
    getCurrentPatch: jest.fn().mockResolvedValue({ patches: [], current: {} }),
  };

  beforeAll(async () => {
    app = await createTestingApp(ChampionsModule, {
      overrides: [
        { provide: ChampionListService, useValue: championList },
        { provide: CurrentPatchService, useValue: currentPatch },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/v1/champions', () => {
    it('should return list of all champions', () => {
      const champion = aChampion({ name: 'Annie', key: 1 });
      championList.getAllChampions.mockResolvedValue({
        champions: [champion],
        total: 1,
      });

      return request(app.getHttpServer())
        .get('/api/v1/champions')
        .expect(200)
        .expect((res) => {
          expect(res.body.champions).toBeDefined();
          expect(res.body.total).toBe(1);
          expect(res.body.champions[0].name).toBe('Annie');
        });
    });
  });

  describe('GET /api/v1/champions/current-patch', () => {
    it('should return available patches with current highlighted', () => {
      const mockPatches = patch('15.23').asCurrent();
      currentPatch.getCurrentPatch.mockResolvedValue(mockPatches);

      return request(app.getHttpServer())
        .get('/api/v1/champions/current-patch')
        .expect(200)
        .expect((res) => {
          expect(res.body.patches).toHaveLength(2);
          expect(res.body.current.patch).toBe('15.23');
        });
    });
  });
});
