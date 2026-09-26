# Public match capabilities (ARQ-06)

`matches/contracts/calculations` publishes named, capability-specific exports of
canonical pure implementations. These functions need no Nest application, HTTP
controller, database, or external client. Consumers select the contribution,
combat, vision, objectives, sequences, economy, map-presence, bounty or kill
capability they actually use. This is not a barrel for internal repositories.
Normalized models, eligibility and snapshot readers remain in their existing
selective contracts.

`matches/ports/comparison-cohort-reader.ts` is the supported comparison query.
`MatchQueriesModule` binds it without importing `MatchesModule` or its controllers.
The repository retains the original RepeatableRead transaction, role aliases,
patch boundary, date bounds, deterministic ordering, 1–100 limit, counts and
projection/source evidence. Analytics keeps its user lookup and delegates only
the match cohort read. Neither path reads MatchRaw. The combat event predicate
stays private to match repositories; consumers do not construct Prisma filters.

`matches/ports/match-projection-writer.ts` defines the normalized write boundary
and the five ordered writes under an opaque caller-owned transaction. Its adapter
binding and extraction from worker persistence belong to ARQ-10, together with
the processing ownership change. Until that change the existing writes remain in
place: introducing a worker-to-matches module dependency now would contradict the
final dependency matrix. The port cannot acquire a lease, open a transaction,
update aggregates or mark processing complete.

Dataset and research consume selective pure contracts through finite, Git-proven
public-entrypoint bridges until their owner moves in ARQ-07/12. The stats patch
reader preserves the original interpolation of the first two `split('.')` components (including `undefined` for a missing minor component); it is
not replaced with a validator having different malformed-input semantics.
Tests may still use internal fixtures across areas until ARQ-13; fixtures are not
published as production APIs. Existing match report/progression readers remain
inside matches. Other production modules do not import internal match calculators
or repositories.
