"""Korean-date revisioned archives; compare entry paths and bytes, never ZIP metadata."""
import argparse
import hashlib
import json
import sys
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KST = timezone(timedelta(hours=9))
FOLDERS = ('server', 'web', 'frontend', 'app', 'components', 'lib', 'hooks', 'public', 'scripts', 'tests', '.github')
FILES = ('2026-10-28_003차수정_PYTHONHOME_배포따라하기.html', '2026-10-28_003차수정_PYTHONHOME_배포따라하기.txt', 'AGENTS.md', 'README.md', 'DEPLOY_PYTHONANYWHERE.md', 'MIGRATION.md', 'VERIFICATION.md', 'requirements.txt', 'requirements-lock.txt', 'flask_app.py', 'wsgi.py', '.env.example', '.gitignore', 'package.json', 'package-lock.json', 'tsconfig.json', 'components.json', 'outputs/2026-10-28_001차수정_PYTHONHOME_수정파일_생성보관_가이드.txt')


def collect():
    result = {}
    for name in FILES:
        path = ROOT / name
        if path.is_file():
            result[name] = path.read_bytes()
    for folder in FOLDERS:
        for path in sorted((ROOT / folder).rglob('*')):
            if not path.is_file() or any(part in ('__pycache__', 'node_modules') or part.startswith('.env') or part.startswith('.data') for part in path.relative_to(ROOT).parts):
                continue
            if path.suffix in ('.pyc', '.pyo', '.sqlite', '.db', '.pem', '.key', '.php') or path.name in ('.user.ini', 'config.local.json'):
                continue
            result[path.relative_to(ROOT).as_posix()] = path.read_bytes()
    return result


def contents(path):
    try:
        with zipfile.ZipFile(path) as archive:
            return {item.filename: hashlib.sha256(archive.read(item)).hexdigest() for item in archive.infolist() if not item.is_dir()}
    except zipfile.BadZipFile:
        return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--revision', type=int, required=True)
    parser.add_argument('--update-same-request', action='store_true')
    args = parser.parse_args()
    if args.revision < 1:
        parser.error('revision must be positive')
    if not (ROOT / 'web/index.html').is_file():
        raise SystemExit('Build frontend first: npm ci; npm run build')
    date = datetime.now(KST).strftime('%Y-%m-%d')
    base = ROOT / 'outputs' / date
    for category in ('텍스트', 'ZIP', '압축풀기'):
        (base / category).mkdir(parents=True, exist_ok=True)
    stem = f'{date}_{args.revision:03d}차수정_PYTHONHOME_PythonAnywhere배포본'
    record_path = base / '텍스트' / f'{date}_{args.revision:03d}차수정_요청기록.json'
    record = json.loads(record_path.read_text(encoding='utf-8')) if record_path.exists() else {}
    if record.get('status') == 'complete':
        raise SystemExit('Completed request cannot be overwritten; assign the next request revision')
    target = base / 'ZIP' / (stem + '.zip')
    if target.exists() and not args.update_same_request:
        raise SystemExit('Archive exists; use --update-same-request only for unfinished work')
    data = collect()
    fingerprints = {key: hashlib.sha256(value).hexdigest() for key, value in data.items()}
    duplicate = next((path for path in sorted((ROOT / 'outputs').glob('*/ZIP/*.zip')) if contents(path) == fingerprints), None)
    if duplicate:
        print('Identical archive reused:', duplicate)
        record.update(date=date, revision=args.revision, archive=str(duplicate), status='in_progress', identicalArchiveReused=True)
        record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        return
    output = base / '압축풀기' / stem
    if output.exists():
        if not args.update_same_request:
            raise SystemExit('Extracted deployment exists; no overwrite')
        # Never delete arbitrary trees; compare/remove only files under this verified deployment path.
        resolved = output.resolve()
        if resolved.parent != (base / '압축풀기').resolve():
            raise SystemExit('Unexpected extraction path')
        for path in sorted(output.rglob('*'), key=lambda p: len(p.parts), reverse=True):
            if path.is_symlink():
                raise SystemExit('Unexpected symlink in deployment directory')
            if path.is_file():
                path.unlink()
            elif path.is_dir():
                path.rmdir()
    output.mkdir(parents=True, exist_ok=True)
    staging = ROOT / '.sites-runtime' / 'package.zip'
    staging.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(staging, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, value in sorted(data.items()):
            archive.writestr(name, value)
            destination = output / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(value)
    if contents(staging) != fingerprints:
        raise SystemExit('Archive content verification failed')
    for name, digest in fingerprints.items():
        if hashlib.sha256((output / name).read_bytes()).hexdigest() != digest:
            raise SystemExit('Extracted file verification failed')
    staging.replace(target)
    manifest = base / '텍스트' / (stem + '_파일검증.json')
    manifest.write_text(json.dumps(fingerprints, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    guide = base / '텍스트' / (stem + '_적용안내.txt')
    guide.write_text('PYTHONHOME PythonAnywhere 배포본\n\nZIP 내부를 프로젝트 루트로 사용합니다. DEPLOY_PYTHONANYWHERE.md를 따라 설치하세요.\nweb/ 빌드 포함: 서버에서 Node.js 설치 없이 Python으로 실행 가능합니다.\n운영 DB, 비밀 설정, 업로드원본, 에이전트변환데이터는 포함하지 않았습니다.\n기존 NAS에는 적용하지 마세요. NAS 변경·GitHub 푸시·PythonAnywhere 실배포는 수행하지 않았습니다.\n검증 결과와 외부 설정이 필요한 항목은 VERIFICATION.md에 있습니다.\n', encoding='utf-8')
    record.update(date=date, revision=args.revision, archive=str(target), extracted=str(output), status='in_progress', verifiedFileCount=len(data), deployment='local-only')
    record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(target)
    print('Verified ZIP/extracted files:', len(data))


if __name__ == '__main__':
    main()
