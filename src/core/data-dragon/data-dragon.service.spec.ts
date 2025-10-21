import { Test, TestingModule } from '@nestjs/testing';
import { DataDragonService } from './data-dragon.service';
import * as fs from 'fs';

// Mock do conteúdo do champions.json
const mockChampionsFile = {
  type: 'champion',
  format: 'standAloneComplex',
  version: '14.4.1',
  data: {
    Aatrox: {
      version: '14.4.1',
      id: 'Aatrox',
      key: '266',
      name: 'Aatrox',
      title: 'the Darkin Blade',
    },
    Ahri: {
      version: '14.4.1',
      id: 'Ahri',
      key: '103',
      name: 'Ahri',
      title: 'the Nine-Tailed Fox',
    },
  },
};

// Mock do fs.readFileSync
jest.mock('fs', () => ({
  ...jest.requireActual('fs'), // Mantém os outros métodos de fs
  readFileSync: jest.fn(),
}));

describe('DataDragonService', () => {
  let service: DataDragonService;
  const mockedFs = fs as jest.Mocked<typeof fs>;

  beforeEach(async () => {
    // Simula a leitura do arquivo JSON
    mockedFs.readFileSync.mockReturnValue(JSON.stringify(mockChampionsFile));

    const module: TestingModule = await Test.createTestingModule({
      providers: [DataDragonService],
    }).compile();

    service = module.get<DataDragonService>(DataDragonService);
    // O onModuleInit é chamado automaticamente pelo NestJS durante a inicialização do módulo
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should load champion data from champions.json', () => {
      // Força a chamada do onModuleInit para o teste
      service.onModuleInit();
      // Verifica se o readFileSync foi chamado com o caminho correto
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('champions.json'),
        'utf-8',
      );
    });
  });

  describe('getChampionById', () => {
    it('should return the correct champion for a valid ID', () => {
      const aatroxId = 266;
      const champion = service.getChampionById(aatroxId);
      expect(champion).toBeDefined();
      expect(champion?.id).toBe('Aatrox');
      expect(champion?.name).toBe('Aatrox');
    });

    it('should return undefined for an invalid ID', () => {
      const invalidId = 999;
      const champion = service.getChampionById(invalidId);
      expect(champion).toBeUndefined();
    });
  });

  describe('getChampionByName', () => {
    it('should return the correct champion for a valid name', () => {
      const ahriName = 'Ahri';
      const champion = service.getChampionByName(ahriName);
      expect(champion).toBeDefined();
      expect(champion?.id).toBe('Ahri');
      expect(champion?.key).toBe('103');
    });

    it('should return the correct champion for a name with different casing and spaces', () => {
      const ahriName = 'ahri'; // Lowercase
      const champion = service.getChampionByName(ahriName);
      expect(champion).toBeDefined();
      expect(champion?.id).toBe('Ahri');
    });

    it('should return undefined for an invalid name', () => {
      const invalidName = 'InvalidChampionName';
      const champion = service.getChampionByName(invalidName);
      expect(champion).toBeUndefined();
    });
  });
});
