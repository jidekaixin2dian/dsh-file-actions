"""Compare a Release archive with its immutable Git source; never execute it."""
import argparse
import fnmatch
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile
import tempfile

ROOT = Path(__file__).resolve().parent.parent
TEXT = {'.js', '.ts', '.json', '.md', '.yml', '.yaml', '.svg', '.txt'}


def run(*args):
    return subprocess.run(args, cwd=ROOT, check=True, capture_output=True).stdout


def source(ref, name):
    return run('git', 'show', f'{ref}:{name}')


def verify(archive, tag, ref):
    manifest = json.loads(source(ref, 'package.json'))
    if tag != 'v' + manifest['version']:
        raise ValueError(f"Tag {tag} differs from package version {manifest['version']}")
    tracked = set(run('git', 'ls-tree', '-r', '--name-only', '-z', ref).decode('utf-8').rstrip('\0').split('\0'))
    expected = {'package.json'}
    for name in tracked:
        if re.fullmatch(r'README(?:\.[\w-]+)?(?:\.md)?|LICENSE(?:\.[\w-]+)?', name, re.I):
            expected.add(name)
        for pattern in manifest.get('files', []):
            if fnmatch.fnmatchcase(name, pattern) or name.startswith(pattern.rstrip('/') + '/'):
                expected.add(name)
    contents = {}
    total = 0
    with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tar:
        for member in tar:
            path = PurePosixPath(member.name)
            if (not member.name.startswith('package/') or '\\' in member.name
                    or '..' in path.parts or member.issym() or member.islnk()):
                raise ValueError(f'Unsafe archive member: {member.name}')
            if member.isdir():
                continue
            if not member.isfile() or member.size > 64 * 1024 * 1024:
                raise ValueError(f'Unsupported archive member: {member.name}')
            name = member.name[len('package/'):]
            if name in contents or name not in tracked:
                raise ValueError(f'Duplicate or untracked release file: {name}')
            total += member.size
            if total > 64 * 1024 * 1024 or len(contents) >= 512:
                raise ValueError('Archive exceeds verification limits')
            data = tar.extractfile(member).read()
            original = source(ref, name)
            # Git checkouts may use CRLF on Windows; no other differences pass.
            if Path(name).suffix in TEXT or name == 'LICENSE':
                data, original = data.replace(b'\r\n', b'\n'), original.replace(b'\r\n', b'\n')
            if data != original:
                raise ValueError(f'Release differs from tag source: {name}')
            contents[name] = data
    if set(contents) != expected:
        raise ValueError(f'Archive file list differs: missing={sorted(expected - contents.keys())}, extra={sorted(contents.keys() - expected)}')
    packed = json.loads(contents['package.json'])
    if packed['name'] != manifest['name'] or packed['version'] != manifest['version']:
        raise ValueError('Archive package identity differs from tag source')
    main = manifest.get('main', '').removeprefix('./')
    if main and main not in contents:
        raise ValueError(f'Archive is missing its entry point: {main}')
    return {'tag': tag, 'commit': run('git', 'rev-parse', ref + '^{commit}').decode().strip(),
            'files': len(contents), 'sha256': hashlib.sha256(archive).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tag', required=True)
    parser.add_argument('--ref', help='Git source ref; defaults to the tag')
    parser.add_argument('--archive', type=Path, help='Verify a local package without network access')
    parser.add_argument('--download', action='store_true', help='Download the published Release using gh')
    args = parser.parse_args()
    if not re.fullmatch(r'v\d+\.\d+\.\d+(?:-[\w.-]+)?', args.tag):
        parser.error('Expected a version tag such as v0.1.10 or v0.2.0-alpha.5')
    ref = args.ref or args.tag
    if ref.startswith('-') or ':' in ref:
        parser.error('Invalid source ref')
    if bool(args.archive) == args.download:
        parser.error('Choose exactly one of --archive or --download')
    if args.archive:
        result = verify(args.archive.read_bytes(), args.tag, ref)
    else:
        repo = os.environ['GH_REPO']
        release = json.loads(run('gh', 'release', 'view', args.tag, '--repo', repo, '--json', 'assets,isDraft,tagName'))
        if release['isDraft'] or release['tagName'] != args.tag:
            raise ValueError('Expected the published Release for the requested tag')
        packages = [asset for asset in release['assets'] if asset['name'].endswith('.tgz')]
        if len(packages) != 1:
            raise ValueError('Expected exactly one plugin archive')
        asset = packages[0]
        if PurePosixPath(asset['name']).name != asset['name'] or '\\' in asset['name']:
            raise ValueError('Unsafe asset filename')
        with tempfile.TemporaryDirectory(prefix='dsh-release-') as directory:
            run('gh', 'release', 'download', args.tag, '--repo', repo, '--pattern', asset['name'], '--dir', directory)
            result = verify((Path(directory) / asset['name']).read_bytes(), args.tag, ref)
        if asset.get('digest') and asset['digest'] != 'sha256:' + result['sha256']:
            raise ValueError('Downloaded archive does not match the GitHub asset digest')
    print(json.dumps(result))


if __name__ == '__main__':
    main()
