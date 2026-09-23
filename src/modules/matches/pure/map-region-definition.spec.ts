import {
  classifyRegion,
  MAP_REGION_DEFINITION,
  orientedRegion,
  polygonContains,
  regionDefinition,
  validateRegionDefinition,
} from './map-region-definition';
describe('experimental versioned map geometry', () => {
  it('defines nine complete non-overlapping interiors and limits support to map11/patch16.2', () => {
    expect(MAP_REGION_DEFINITION).toMatchObject({
      mapId: 11,
      version: 1,
      validatedPatches: ['16.2'],
      domain: { minX: 0, maxX: 15000, minY: 0, maxY: 15000 },
    });
    for (let row = 0; row < 3; row++)
      for (let column = 0; column < 3; column++) {
        const point = { x: column * 5000 + 2500, y: row * 5000 + 2500 };
        expect(
          MAP_REGION_DEFINITION.regions.filter((r) =>
            polygonContains(point, r.polygon),
          ),
        ).toHaveLength(1);
        expect(classifyRegion(point)).toMatchObject({ column, row });
      }
    expect(regionDefinition(11, '16.2.741')).not.toBeNull();
    expect(regionDefinition(11, '16.20.1')).toBeNull();
    expect(regionDefinition(12, '16.2.1')).toBeNull();
  });
  it('assigns shared edges and vertices once in declared order including the chosen outer bounds', () => {
    for (const [point, id] of [
      [{ x: 0, y: 0 }, 'southwest'],
      [{ x: 5000, y: 5000 }, 'southwest'],
      [{ x: 5000, y: 7500 }, 'west'],
      [{ x: 10000, y: 5000 }, 'south'],
      [{ x: 15000, y: 15000 }, 'northeast'],
      [{ x: 5000.001, y: 5000.001 }, 'center'],
    ] as const)
      expect(classifyRegion(point)?.id).toBe(id);
    for (const point of [
      { x: -1, y: 10 },
      { x: 15001, y: 10 },
      { x: 1, y: NaN },
    ])
      expect(classifyRegion(point)).toBeNull();
  });
  it('tests polygon interior and edges rather than treating its bounding box as the region', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(polygonContains({ x: 5, y: 5 }, triangle)).toBe(true);
    expect(polygonContains({ x: 8, y: 8 }, triangle)).toBe(false);
    expect(polygonContains({ x: 2, y: 2 }, triangle)).toBe(true);
  });
  it('rotates classified cells for team200 without guessing unknown sides', () => {
    const southwest = classifyRegion({ x: 0, y: 0 })!;
    expect(orientedRegion(southwest, 100)).toBe('southwest');
    expect(orientedRegion(southwest, 200)).toBe('northeast');
    expect(orientedRegion(southwest, 300)).toBeNull();
    for (const region of MAP_REGION_DEFINITION.regions) {
      const rotated = MAP_REGION_DEFINITION.regions.find(
        (r) => r.id === orientedRegion(region, 200),
      )!;
      expect(orientedRegion(rotated, 200)).toBe(region.id);
    }
  });
  it('rejects invalid definition identity, vertices, domain and degenerate polygons', () => {
    for (const mutate of [
      (d) => (d.version = 0),
      (d) => (d.domain.maxX = 0),
      (d) => (d.regions[0].polygon[0].x = NaN),
      (d) => (d.regions[0].polygon[0].x = -1),
      (d) =>
        (d.regions[0].polygon = [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ]),
      (d) => (d.regions[1].id = d.regions[0].id),
    ]) {
      const d = structuredClone(MAP_REGION_DEFINITION);
      mutate(d);
      expect(() => validateRegionDefinition(d)).toThrow(RangeError);
    }
  });
});
