import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch
import urllib.error


def module(name):
    spec = importlib.util.spec_from_file_location(name, Path('scripts/radar') / (name + '.py'))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


collect = module('collect')
publish = module('publish')


class FreeRadarTests(unittest.TestCase):
    def test_filters_irrelevant_models_and_repositories_and_preserves_partial_failures(self):
        raw = {'hf': {'models': 100, 'spaces': 100, 'first_run': False, 'terms': [
            {'term': 'audio singing', 'examples': ['team/audio-singing']},
            {'term': 'code agent', 'examples': ['team/code-agent']}]},
            'breakout': {'searched': 20, 'first_run': False, 'repos': [
                {'repo': 'team/music-tool', 'description': 'Songs', 'new': True, 'stars': 400, 'velocity': 200},
                {'repo': 'team/code', 'description': 'Compiler', 'new': True}]},
            'sitemap': {'sites': {'gift': {'error': 'Authorization: secret-do-not-display'}}}}
        report = collect.normalize(raw, {'gift': {'label': 'Gift site'}}, '123', 1, 'a' * 40)
        self.assertEqual(len(report['items']), 2)
        self.assertEqual(report['sources'][2]['status'], 'error')
        self.assertNotIn('secret-do-not-display', json.dumps(report))
        self.assertEqual(report['sources'][-1]['status'], 'off')

    def test_baseline_and_missing_source_are_honest(self):
        report = collect.normalize({'hf': {'first_run': True}, 'breakout': {'error': True}}, {'gift': {'label': 'Gift'}}, '123', 1, 'a'*40)
        self.assertEqual([s['status'] for s in report['sources']], ['baseline', 'error', 'error', 'off'])
        self.assertEqual(report['items'], [])

    def test_only_safe_bounded_links_and_items(self):
        self.assertIsNone(collect.safe_url('javascript:alert(1)'))
        self.assertIsNone(collect.safe_url('https://user:password@example.com'))
        rows = [{'repo': 'owner/song'+str(i), 'description': 'music', 'new': True} for i in range(80)]
        report = collect.normalize({'breakout': {'repos': rows}}, {}, '123', 1, 'a'*40)
        self.assertEqual(len(report['items']), 60)
        self.assertEqual(collect.clean('song\x00name', 5), 'song ')

    def test_free_adapter_never_imports_daily_or_paid_modules(self):
        source = Path('scripts/radar/collect.py').read_text()
        imports = [line.strip() for line in source.splitlines() if line.strip().startswith('from radar.')]
        self.assertEqual(imports, ['from radar.config import load', 'from radar.sources import hf_new', 'from radar.breakout import breakouts', 'from radar.sitemaps import diff'])
        workflow = Path('.github/workflows/radar-free.yml').read_text()
        self.assertNotIn('secrets.', workflow)
        self.assertEqual(workflow.count('id-token: write'), 1)

    def test_upload_redirects_are_denied(self):
        self.assertIsNone(publish.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://attacker.invalid'))

    def test_upload_is_run_bound_and_does_not_send_on_mismatch(self):
        class Report:
            def read_bytes(self):
                return json.dumps({'runId': '123', 'runAttempt': 1, 'commitSha': 'a'*40}).encode()
        with patch.dict('os.environ', {'GITHUB_RUN_ID': '999', 'GITHUB_RUN_ATTEMPT': '1', 'GITHUB_SHA': 'a'*40}), patch('urllib.request.build_opener') as opener:
            with self.assertRaisesRegex(ValueError, 'does not belong'):
                publish.publish(Report())
            opener.assert_not_called()


if __name__ == '__main__':
    unittest.main()
