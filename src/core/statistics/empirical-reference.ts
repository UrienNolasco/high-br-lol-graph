/** @deprecated Import generic empirical math from lib/math. */
export {
  dkwHalfWidth,
  empiricalDistribution,
  empiricalQuantile,
} from '../../lib/math/empirical-distribution';

/** @deprecated Import reference policy through modules/references/contracts/statistics. */
export {
  DEFAULT_PRECISION,
  REFERENCE_METHOD_VERSION,
  precisionPolicy,
  referenceStatistics,
  requiredReferenceUnits,
  selectRosterDisjoint,
} from '../../modules/references/contracts/statistics';
/** @deprecated Import reference types through modules/references/contracts/statistics. */
export type {
  PrecisionPolicy,
  ReferenceObservation,
} from '../../modules/references/contracts/statistics';
