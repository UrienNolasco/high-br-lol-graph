import { SYNC_TTL_SECONDS, syncStatusKey, syncMatchIdsKey } from './sync-state';

describe('sync-state', () => {
  describe('SYNC_TTL_SECONDS', () => {
    it('should be 1800 seconds (30 minutes)', () => {
      expect(SYNC_TTL_SECONDS).toBe(1800);
    });
  });

  describe('syncStatusKey', () => {
    it('should generate the status Redis key', () => {
      expect(syncStatusKey('abc-123')).toBe('sync:abc-123:status');
    });
  });

  describe('syncMatchIdsKey', () => {
    it('should generate the matchIds Redis key', () => {
      expect(syncMatchIdsKey('abc-123')).toBe('sync:abc-123:matchIds');
    });
  });
});
