"""Exercise release verification against real Git objects and crafted archives."""
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('release_verifier', Path(__file__).with_name('verify-release.py'))
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class IntegrityTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='dsh-release-test-')
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        previous = verifier.ROOT
        verifier.ROOT = root
        self.addCleanup(setattr, verifier, 'ROOT', previous)
        self.files = {'package.json': json.dumps({'name': 'fixture', 'version': '0.1.0', 'main': 'lib/index.js', 'files': ['lib']}).encode(),
                      'lib/index.js': b'const factory = () => {};\n', 'lib/pixel.png': b'\x89PNG\r\n\x00', 'README.md': b'Fixture\n'}
        for name, data in self.files.items():
            file = root / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_bytes(data)
        def git(*args):
            subprocess.run(['git', '-c', 'core.autocrlf=false', *args], cwd=root, check=True, capture_output=True)
        git('init', '-q')
        git('add', '.')
        git('-c', 'user.name=Release Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture')

    def archive(self, files=None):
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode='w:gz') as tar:
            for name, data in (self.files if files is None else files).items():
                member = tarfile.TarInfo('package/' + name)
                member.size = len(data)
                tar.addfile(member, io.BytesIO(data))
        return output.getvalue()

    def test_matching_archive_and_windows_checkout_line_endings(self):
        files = {name: data.replace(b'\n', b'\r\n') if name.endswith(('.js', '.md')) else data for name, data in self.files.items()}
        self.assertEqual(verifier.verify(self.archive(files), 'v0.1.0', 'HEAD')['files'], 4)

    def test_changed_client_is_rejected(self):
        files = {**self.files, 'lib/index.js': b';(() => { const factory = () => {}; })()\n'}
        with self.assertRaisesRegex(ValueError, 'differs from tag source: lib/index.js'):
            verifier.verify(self.archive(files), 'v0.1.0', 'HEAD')

    def test_missing_runtime_file_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'missing='):
            verifier.verify(self.archive({name: data for name, data in self.files.items() if name != 'lib/index.js'}), 'v0.1.0', 'HEAD')

    def test_wrong_tag_version_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'differs from package version'):
            verifier.verify(self.archive(), 'v0.1.1', 'HEAD')

    def test_changed_binary_is_rejected(self):
        files = {**self.files, 'lib/pixel.png': self.files['lib/pixel.png'].replace(b'\r\n', b'\n')}
        with self.assertRaisesRegex(ValueError, 'differs from tag source'):
            verifier.verify(self.archive(files), 'v0.1.0', 'HEAD')

    def test_traversal_and_untracked_files_are_rejected(self):
        for name in ['../outside.js', 'extra.js']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                verifier.verify(self.archive({**self.files, name: b'bad'}), 'v0.1.0', 'HEAD')


if __name__ == '__main__':
    unittest.main()
