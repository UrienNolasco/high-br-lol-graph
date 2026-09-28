# ARQ-10 evidence

`ProcessingService.publish` prepares dataset contributions before opening the
publication transaction. Inside that transaction it takes the maintenance gate,
locks the processing lease, writes match projections, reads and normalizes
observation lineage, writes dataset contributions, updates stats, and finally
marks `MatchProcessing` as `COMPLETED` while clearing the lease. Every writer
receives the same opaque transaction context and cannot open or commit a second
transaction.

Raw summary and timeline capture remains outside publication, in its own
lease-guarded transaction. Therefore a raw capture that has committed remains
available when a later projection transaction rolls back.

`processing.service.spec.ts` injects faults at each publication boundary and
asserts that no later boundary runs. PostgreSQL integration execution was left
to the coordinator because the shared disposable database is serialized.
