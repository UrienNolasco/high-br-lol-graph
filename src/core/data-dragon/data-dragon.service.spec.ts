import { Test, TestingModule } from '@nestjs/testing';
import { DataDragonService } from './data-dragon.service';

describe('DataDragonService', () => {
  let service: DataDragonService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DataDragonService],
    }).compile();

    service = module.get<DataDragonService>(DataDragonService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
