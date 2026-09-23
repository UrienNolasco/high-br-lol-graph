import { gameVersionPatch } from '../../../core/metrics';

export type Point = { x: number; y: number };
export interface MapRegion {
  id: string;
  label: string;
  column: number;
  row: number;
  polygon: Point[];
}
export interface MapRegionDefinition {
  id: string;
  version: number;
  mapId: number;
  validatedPatches: string[];
  domain: { minX: number; maxX: number; minY: number; maxY: number };
  regions: MapRegion[];
  boundaryRule: string;
  teamPerspective: string;
  limitation: string;
}
const names = [
  'southwest',
  'south',
  'southeast',
  'west',
  'center',
  'east',
  'northwest',
  'north',
  'northeast',
];

/** Analyst-defined coarse cells, not an official lane/jungle/base map. */
export const MAP_REGION_DEFINITION: MapRegionDefinition = {
  id: 'experimental-sr-grid',
  version: 1,
  mapId: 11,
  validatedPatches: ['16.2'],
  domain: { minX: 0, maxX: 15000, minY: 0, maxY: 15000 },
  regions: names.map((id, index) => {
    const column = index % 3,
      row = Math.floor(index / 3),
      x = column * 5000,
      y = row * 5000;
    return {
      id,
      label: id,
      column,
      row,
      polygon: [
        { x, y },
        { x: x + 5000, y },
        { x: x + 5000, y: y + 5000 },
        { x, y: y + 5000 },
      ],
    };
  }),
  boundaryRule:
    'Closed polygon edges. Shared edges/vertices belong to the first region in declared row-major order (south to north, west to east). Exact arithmetic, no boundary tolerance.',
  teamPerspective:
    'Classify absolute region first. Team100 keeps its cell; team200 rotates the cell index 180 degrees (column,row)->(2-column,2-row). Coordinates remain observed, never altered. Other team ids have no oriented distribution.',
  limitation:
    'Experimental geometric grid on analyst-chosen [0,15000]^2, not proven official map boundaries, lanes, jungle or bases. Only coordinate coverage on one real patch16.2 fixture was validated; no semantic-region validation.',
};

export function validateRegionDefinition(
  definition: MapRegionDefinition,
): void {
  if (
    !Number.isInteger(definition.version) ||
    definition.version < 1 ||
    !Number.isInteger(definition.mapId)
  )
    throw new RangeError('Invalid definition identity');
  const d = definition.domain;
  if (
    !Object.values(d).every(Number.isFinite) ||
    d.minX >= d.maxX ||
    d.minY >= d.maxY
  )
    throw new RangeError('Invalid domain');
  if (
    !definition.regions.length ||
    new Set(definition.regions.map((r) => r.id)).size !==
      definition.regions.length
  )
    throw new RangeError('Invalid region identities');
  for (const region of definition.regions) {
    if (
      region.polygon.length < 3 ||
      region.polygon.some(
        (p) =>
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          p.x < d.minX ||
          p.x > d.maxX ||
          p.y < d.minY ||
          p.y > d.maxY,
      )
    )
      throw new RangeError('Invalid polygon vertices');
    const area = region.polygon.reduce((sum, p, i) => {
      const next = region.polygon[(i + 1) % region.polygon.length];
      return sum + p.x * next.y - next.x * p.y;
    }, 0);
    if (area === 0) throw new RangeError('Degenerate polygon');
  }
}
validateRegionDefinition(MAP_REGION_DEFINITION);

/** Ray casting with explicit closed-edge handling; finite input only. */
export function polygonContains(
  point: Point,
  polygon: readonly Point[],
): boolean {
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    polygon.length < 3
  )
    return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j],
      b = polygon[i];
    const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x);
    if (
      cross === 0 &&
      point.x >= Math.min(a.x, b.x) &&
      point.x <= Math.max(a.x, b.x) &&
      point.y >= Math.min(a.y, b.y) &&
      point.y <= Math.max(a.y, b.y)
    )
      return true;
    if (
      a.y > point.y !== b.y > point.y &&
      point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x
    )
      inside = !inside;
  }
  return inside;
}
export function regionDefinition(
  mapId: number,
  gameVersion: string,
): MapRegionDefinition | null {
  return mapId === MAP_REGION_DEFINITION.mapId &&
    MAP_REGION_DEFINITION.validatedPatches.includes(
      gameVersionPatch(gameVersion) ?? '',
    )
    ? MAP_REGION_DEFINITION
    : null;
}
export function classifyRegion(
  point: Point,
  definition = MAP_REGION_DEFINITION,
): MapRegion | null {
  const d = definition.domain;
  if (
    !Number.isFinite(point.x) ||
    !Number.isFinite(point.y) ||
    point.x < d.minX ||
    point.x > d.maxX ||
    point.y < d.minY ||
    point.y > d.maxY
  )
    return null;
  return (
    definition.regions.find((region) =>
      polygonContains(point, region.polygon),
    ) ?? null
  );
}
export function orientedRegion(
  region: MapRegion,
  teamId: number,
  definition = MAP_REGION_DEFINITION,
): string | null {
  if (teamId === 100) return region.id;
  if (teamId !== 200) return null;
  return (
    definition.regions.find(
      (r) => r.column === 2 - region.column && r.row === 2 - region.row,
    )?.id ?? null
  );
}
