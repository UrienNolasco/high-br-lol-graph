import { CurrentPatchService } from './current-patch.service';

describe('CurrentPatchService', () => {
  let service: CurrentPatchService;
  const mockDataDragon = {
    getVersions: jest.fn(),
  };

  beforeEach(() => {
    service = new CurrentPatchService(mockDataDragon as any);
  });

  it('should return parsed patches with current highlighted', async () => {
    mockDataDragon.getVersions.mockResolvedValue(['15.23.1', '15.22.1']);

    const result = await service.getCurrentPatch();

    expect(result.patches).toEqual([
      { patch: '15.23', fullVersion: '15.23.1' },
      { patch: '15.22', fullVersion: '15.22.1' },
    ]);
    expect(result.current).toEqual({ patch: '15.23', fullVersion: '15.23.1' });
  });

  it('should return empty patches for empty versions', async () => {
    mockDataDragon.getVersions.mockResolvedValue([]);

    const result = await service.getCurrentPatch();

    expect(result.patches).toEqual([]);
    expect(result.current).toBeUndefined();
  });
});
