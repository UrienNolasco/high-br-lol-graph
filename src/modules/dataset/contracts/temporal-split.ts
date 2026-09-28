/** Stable temporal partition contract shared by offline consumers. */
export interface TemporalSplit {
  trainBeforeMs: number;
  validationBeforeMs: number;
}

export function validateTemporalSplit(split: TemporalSplit) {
  if (
    !Number.isSafeInteger(split.trainBeforeMs) ||
    !Number.isSafeInteger(split.validationBeforeMs) ||
    split.trainBeforeMs < 0 ||
    split.trainBeforeMs >= split.validationBeforeMs
  )
    throw new Error(
      'Temporal split requires 0 <= trainBeforeMs < validationBeforeMs',
    );
  return split;
}

export function splitForMatch(
  gameCreation: bigint | number,
  split: TemporalSplit,
): 'train' | 'validation' | 'test' {
  return BigInt(gameCreation) < BigInt(split.trainBeforeMs)
    ? 'train'
    : BigInt(gameCreation) < BigInt(split.validationBeforeMs)
      ? 'validation'
      : 'test';
}
