import { jsonObject, jsonValue } from './json-value';

describe('domain JSON persistence boundary', () => {
  it('preserves null, zero, nested event order and safe integer precision', () => {
    const input = {
      absent: undefined,
      frames: [
        { timestampMs: 2399000, gold: 0 },
        { timestampMs: 2400000, gold: null },
      ],
      id: Number.MAX_SAFE_INTEGER,
      quality: { missingFields: ['gold'], available: false },
    };
    const result = jsonObject(input);
    expect(result).toEqual({
      frames: input.frames,
      id: input.id,
      quality: input.quality,
    });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('rejects values JSON cannot preserve instead of silently rounding or coercing them', () => {
    expect(() => jsonValue(9007199254740993n)).toThrow(TypeError);
    expect(() => jsonValue(Number.NaN)).toThrow(TypeError);
    expect(() => jsonValue([undefined])).toThrow(TypeError);
  });
});
