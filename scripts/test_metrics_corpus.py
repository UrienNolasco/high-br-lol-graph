"""Regression checks for the corpus auditor; Python standard library only."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import unittest

SCRIPT = Path(__file__).with_name('audit-metrics-corpus.py')
SPEC = importlib.util.spec_from_file_location('corpus_audit', SCRIPT)
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)
ROOT = SCRIPT.parent.parent


class CorpusAuditTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.match = json.loads((ROOT / 'exemplo_partida_BR1_3200579475.json').read_text())
        cls.timeline = json.loads((ROOT / 'exemplo_partida_timeline_BR1_3200579475.json').read_text())

    def test_real_fixture_has_112_independent_reconciliations(self):
        result = AUDIT.audit(self.match, self.timeline)
        self.assertEqual(result['summary'], {'playerChecks': 100, 'objectiveChecks': 12, 'pass': 112, 'fail': 0, 'unavailable': 0})
        self.assertEqual(result['coverage']['frames'], 41)
        self.assertEqual(result['coverage']['snapshots'], 410)
        self.assertEqual(result['coverage']['duplicateMinutes'], {'39': 2})
        self.assertEqual(result['coverage']['recognizedWardPlacements'], 196)
        self.assertEqual(sum(result['coverage']['unknownWardTypes'].values()), 556)
        self.assertEqual(result['integrityIssues'], [])

    def test_independent_summary_corruption_is_detected(self):
        match = deepcopy(self.match)
        match['info']['participants'][0]['kills'] += 1
        match['info']['teams'][0]['objectives']['dragon']['kills'] += 1
        result = AUDIT.audit(match, self.timeline)
        self.assertEqual(result['summary']['fail'], 2)
        self.assertEqual([c['metric'] for c in result['playerChecks'] if c['status'] == 'fail'], ['kills'])
        self.assertEqual([c['metric'] for c in result['objectiveChecks'] if c['status'] == 'fail'], ['DRAGON'])

    def test_all_controlled_mutations_and_source_immutability(self):
        original = json.dumps([self.match, self.timeline], sort_keys=True)
        cases = list(AUDIT.variations(self.match, self.timeline))
        self.assertEqual(len(cases), 9)
        for name, match, timeline in cases:
            with self.subTest(name=name):
                self.assertTrue(AUDIT.synthetic_assertions(name, AUDIT.audit(match, timeline)))
        self.assertEqual(json.dumps([self.match, self.timeline], sort_keys=True), original)

    def test_missing_fields_are_unavailable_and_observed_zero_remains_zero(self):
        missing = deepcopy(self.match)
        missing['info']['participants'][0].pop('wardsKilled')
        result = AUDIT.audit(missing, self.timeline)
        check = next(c for c in result['playerChecks'] if c['subject'] == 1 and c['metric'] == 'wardsKilled')
        self.assertEqual(check['status'], 'unavailable')
        self.assertIsNone(check['expectedSummary'])
        zero = next(c for c in result['objectiveChecks'] if c['expectedSummary'] == 0)
        self.assertEqual(zero['observedTimeline'], 0)
        self.assertEqual(zero['status'], 'pass')

    def test_missing_timeline_does_not_claim_zero_observations(self):
        timeline = deepcopy(self.timeline)
        timeline['info']['frames'] = []
        result = AUDIT.audit(self.match, timeline)
        self.assertEqual(result['summary']['unavailable'], 112)
        self.assertTrue(all(c['reason'] == 'missing_frame' for c in result['checkpoints']))

    def test_checkpoints_prevent_future_leakage_and_keep_final_timestamp(self):
        result = AUDIT.audit(self.match, self.timeline)
        at15 = [c for c in result['checkpoints'] if c['targetMs'] == 900000]
        self.assertEqual(at15[0]['timestampMs'], 900358)
        self.assertEqual(at15[1]['timestampMs'], 840357)
        self.assertTrue(all(c['timestampMs'] <= c['targetMs'] for c in result['checkpoints'] if c['mode'] == 'pastOnly' and c['timestampMs'] is not None))
        self.assertEqual(result['coverage']['frameTimestampMs'][-1], 2368922)

    def test_report_is_deterministic_and_synthetic_versions_do_not_inflate_real_coverage(self):
        manifest = ROOT / 'docs/analysis/corpus-manifest.json'
        report = AUDIT.build_report(manifest)
        self.assertEqual(report, AUDIT.build_report(manifest))
        self.assertEqual(report['realSampleN'], 1)
        self.assertEqual(report['syntheticSampleN'], 9)
        self.assertEqual(report['coverageByVersionQueueMap'], [{'gameVersion': '16.2.741.3171', 'patch': '16.2', 'queueId': 420, 'mapId': 11, 'realN': 1}])
        self.assertEqual(report['matchRawAvailability']['status'], 'not_measured')
        self.assertIsNone(report['matchRawAvailability']['rows'])

    def test_identity_and_order_divergences_are_reported(self):
        timeline = deepcopy(self.timeline)
        timeline['metadata']['matchId'] = 'wrong'
        timeline['metadata']['participants'].pop()
        timeline['info']['frames'].reverse()
        self.assertEqual(AUDIT.audit(self.match, timeline)['integrityIssues'], ['match_id_mismatch', 'participant_identity_mismatch', 'frame_order_mismatch'])


if __name__ == '__main__':
    unittest.main()
