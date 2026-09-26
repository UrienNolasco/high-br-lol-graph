// Offline reconciliation against the single repository fixture. Build first.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {calculateVision}=require('../dist/modules/matches/pure/vision-calculator');
const {normalizeTimelineEvents}=require('../dist/modules/matches/adapters/riot/normalized-events');
const {projectFinalStats}=require('../dist/modules/matches/adapters/riot/final-stats');
const {PROCESSING_VERSION}=require('../dist/core/processing/processing.constants');
const summary=JSON.parse(fs.readFileSync(path.join(__dirname,'../exemplo_partida_BR1_3200579475.json'),'utf8'));
const timeline=JSON.parse(fs.readFileSync(path.join(__dirname,'../exemplo_partida_timeline_BR1_3200579475.json'),'utf8'));
const input={matchId:summary.metadata.matchId,gameVersion:summary.info.gameVersion,gameDuration:summary.info.gameDuration,participants:summary.info.participants.map(p=>({puuid:p.puuid,teamId:p.teamId,finalStats:projectFinalStats(p)})),events:normalizeTimelineEvents(timeline,new Map(summary.info.participants.map(p=>[p.participantId,p.puuid])),new Map(summary.info.participants.map(p=>[p.participantId,p.teamId])),{processingVersion:PROCESSING_VERSION}),processing:{status:'COMPLETED',processingVersion:PROCESSING_VERSION,completedAt:new Date('2026-09-23T00:00:00Z')}};
const start=performance.now();const reports=input.participants.map(p=>calculateVision(input,p.puuid));const calculationMs=performance.now()-start;
const participants=reports.map((r,i)=>{assert.equal(r.reconciliation.placementDifference,0);assert.equal(r.reconciliation.removalDifference,0);return {puuid:r.puuid,championName:summary.info.participants[i].championName,recognizedPlacements:r.metrics.recognizedPlacements.value,unknownPlacements:r.metrics.unknownPlacements.value,recognizedRemovals:r.metrics.recognizedRemovals.value,controlPurchases:r.metrics.visionWardsBoughtInGame.value,controlPlacements:r.metrics.controlPlacements.value,visionScore:r.metrics.visionScore.value,placementDifference:r.reconciliation.placementDifference,removalDifference:r.reconciliation.removalDifference,objectiveWindowN:r.objectiveWindows.length,responseJsonBytes:Buffer.byteLength(JSON.stringify(r))};});
const totals={recognizedPlacements:participants.reduce((n,p)=>n+p.recognizedPlacements,0),unknownPlacements:participants.reduce((n,p)=>n+p.unknownPlacements,0),recognizedRemovals:participants.reduce((n,p)=>n+p.recognizedRemovals,0)};
assert.deepEqual(totals,{recognizedPlacements:196,unknownPlacements:556,recognizedRemovals:51});
const report={task:'MET-11',fixture:input.matchId,gameVersion:input.gameVersion,scope:'one real fixture; calculation only, processing timestamp is a fixed example; no production or additional patch samples',participants,totals,calculationMs,failures:0};
fs.writeFileSync(path.join(__dirname,'../docs/analysis/met11-vision-reconciliation.json'),JSON.stringify(report,null,2)+'\n');
const r=reports[0];const excerpt={kind:'response_excerpt',matchId:r.matchId,puuid:r.puuid,metricVersion:r.metricVersion,processingVersion:r.processingVersion,processedAt:r.processedAt,coverage:r.coverage,metrics:r.metrics,gaps:r.gaps,objectiveWindows:r.objectiveWindows.slice(0,2)};
fs.writeFileSync(path.join(__dirname,'../docs/analysis/met11-vision-example.json'),JSON.stringify(excerpt,null,2)+'\n');
console.log(JSON.stringify({totals,failures:0,calculationMs}));
