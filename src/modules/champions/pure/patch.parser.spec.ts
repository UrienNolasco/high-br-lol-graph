import { parsePatches } from './patch.parser';

describe('patch.parser', () => {
  describe('parsePatches', () => {
    it('should parse full versions into patch objects', () => {
      const versions = ['15.23.1', '15.22.1', '15.21.1'];

      const result = parsePatches(versions);

      expect(result).toEqual([
        { patch: '15.23', fullVersion: '15.23.1' },
        { patch: '15.22', fullVersion: '15.22.1' },
        { patch: '15.21', fullVersion: '15.21.1' },
      ]);
    });

    it('should handle versions with only 2 parts', () => {
      const versions = ['15.1'];

      const result = parsePatches(versions);

      expect(result).toEqual([{ patch: '15.1', fullVersion: '15.1' }]);
    });

    it('should handle single part version', () => {
      const versions = ['15'];

      const result = parsePatches(versions);

      expect(result).toEqual([{ patch: '15', fullVersion: '15' }]);
    });

    it('should return empty array for empty input', () => {
      expect(parsePatches([])).toEqual([]);
    });
  });
});
