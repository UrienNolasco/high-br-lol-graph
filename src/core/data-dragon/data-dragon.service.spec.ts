import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { DataDragonService } from './data-dragon.service';

describe('DataDragonService', () => {
  let service: DataDragonService;
  let httpService: HttpService;

  const mockHttpService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataDragonService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    service = module.get<DataDragonService>(DataDragonService);
    httpService = module.get<HttpService>(HttpService);

    // Carregar dados dos campeões manualmente já que onModuleInit não é chamado automaticamente
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getChampionById', () => {
    it('should return champion data when found by id', () => {
      const result = service.getChampionById(266);

      expect(result).toBeDefined();
      expect(result?.id).toBe('Aatrox');
      expect(result?.key).toBe('266');
      expect(result?.name).toBe('Aatrox');
    });

    it('should return undefined when champion not found', () => {
      const result = service.getChampionById(999);

      expect(result).toBeUndefined();
    });
  });

  describe('getChampionByName', () => {
    it('should return champion data when found by name', () => {
      const result = service.getChampionByName('Aatrox');

      expect(result).toBeDefined();
      expect(result?.id).toBe('Aatrox');
      expect(result?.name).toBe('Aatrox');
    });

    it('should be case insensitive', () => {
      const resultLower = service.getChampionByName('aatrox');
      const resultUpper = service.getChampionByName('AATROX');

      expect(resultLower).toBeDefined();
      expect(resultUpper).toBeDefined();
      expect(resultLower?.id).toBe('Aatrox');
      expect(resultUpper?.id).toBe('Aatrox');
    });

    it('should return undefined when champion not found', () => {
      const result = service.getChampionByName('NonExistent');

      expect(result).toBeUndefined();
    });
  });

  describe('getAllChampions', () => {
    it('should return array of all champions', () => {
      const result = service.getAllChampions();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should include all required fields for each champion', () => {
      const result = service.getAllChampions();

      if (result.length > 0) {
        const firstChampion = result[0];
        expect(firstChampion).toHaveProperty('id');
        expect(firstChampion).toHaveProperty('key');
        expect(firstChampion).toHaveProperty('name');
        expect(firstChampion).toHaveProperty('title');
        expect(firstChampion).toHaveProperty('version');
      }
    });
  });

  describe('getChampionImageUrls', () => {
    it('should return image URLs for champion', async () => {
      mockHttpService.get.mockReturnValue(
        of({ data: ['15.23.1', '15.22.1', '15.21.1'] }),
      );

      const result = await service.getChampionImageUrls('Aatrox');

      expect(result).toBeDefined();
      expect(result).toHaveProperty('square');
      expect(result).toHaveProperty('loading');
      expect(result).toHaveProperty('splash');

      expect(result.square).toContain('Aatrox');
      expect(result.loading).toContain('Aatrox');
      expect(result.splash).toContain('Aatrox');
    });

    it('should use correct CDN format', async () => {
      mockHttpService.get.mockReturnValue(
        of({ data: ['15.23.1', '15.22.1', '15.21.1'] }),
      );

      const result = await service.getChampionImageUrls('Ahri');

      expect(result.square).toMatch(
        /^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/[\d.]+\/img\/champion\/Ahri\.png$/,
      );
      expect(result.loading).toMatch(
        /^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/img\/champion\/loading\/Ahri_\d+\.jpg$/,
      );
      expect(result.splash).toMatch(
        /^https:\/\/ddragon\.leagueoflegends\.com\/cdn\/img\/champion\/splash\/Ahri_\d+\.jpg$/,
      );
    });
  });

  describe('getVersions', () => {
    it('should return array of versions', async () => {
      const mockVersions = ['15.23.1', '15.22.1', '15.21.1'];
      mockHttpService.get.mockReturnValue(of({ data: mockVersions }));

      const result = await service.getVersions();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://ddragon.leagueoflegends.com/api/versions.json',
      );
    });

    it('should return versions ordered from most recent to oldest', async () => {
      const mockVersions = ['15.23.1', '15.22.1', '15.21.1'];
      mockHttpService.get.mockReturnValue(of({ data: mockVersions }));

      const result = await service.getVersions();

      if (result.length > 1) {
        const firstVersion = result[0].split('.').map(Number);
        const secondVersion = result[1].split('.').map(Number);

        expect(firstVersion[0]).toBeGreaterThanOrEqual(secondVersion[0]);
        if (firstVersion[0] === secondVersion[0]) {
          expect(firstVersion[1]).toBeGreaterThanOrEqual(secondVersion[1]);
        }
      }
    });

    it('should return valid version format', async () => {
      const mockVersions = ['15.23.1', '15.22.1', '15.21.1'];
      mockHttpService.get.mockReturnValue(of({ data: mockVersions }));

      const result = await service.getVersions();

      if (result.length > 0) {
        const versionRegex = /^\d+\.\d+\.\d+$/;
        expect(result[0]).toMatch(versionRegex);
      }
    });
  });
});
