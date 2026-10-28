"""Local/PA database tools. Never connects to the NAS or copies live files blindly."""
import argparse
import os
import sqlite3
import sys
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from flask_app import create_app
from server.core import db


def backup_database(source, target):
    if target.exists():
        raise SystemExit('Target already exists; choose a new path (no overwrite)')
    target.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(source.resolve().as_uri() + '?mode=ro', uri=True)
    try:
        destination = sqlite3.connect(target)
        try:
            connection.backup(destination)
            result = destination.execute('PRAGMA integrity_check').fetchone()[0]
            if result != 'ok':
                raise RuntimeError('Database integrity check failed')
        finally:
            destination.close()
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='action', required=True)
    sub.add_parser('init-db')
    sub.add_parser('check')
    backup = sub.add_parser('backup-db')
    backup.add_argument('--output', required=True)
    transfer = sub.add_parser('import-nas-db')
    transfer.add_argument('--source', required=True, help='A consistent NAS SQLite backup, not the running live DB')
    args = parser.parse_args()
    app = create_app()
    with app.app_context():
        target = Path(app.config['DATA_DIR']) / 'argo.sqlite'
        if args.action == 'import-nas-db':
            source = Path(args.source).resolve()
            if not source.is_file() or source == target.resolve():
                raise SystemExit('Source must be a separate existing SQLite backup')
            # Validate schema/history before importing; no guessed ALTER sequences.
            with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)) as connection:
                tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if not {'members', 'posts', 'guestbook', '_argo_migrations'} <= tables:
                    raise SystemExit('Not a recognized NAS DB with migration history; do not import automatically')
                expected = {path.name for path in (ROOT / 'server/migrations').glob('*.sql')}
                applied = {row[0] for row in connection.execute('SELECT name FROM _argo_migrations')}
                if not applied <= expected:
                    raise SystemExit('Source has unknown migrations. Review compatibility before import')
            backup_database(source, target)
            db()  # Apply only missing known migrations to the copied database.
            print('Imported private DB; run check and verify member/data access before switching traffic.')
        elif args.action == 'backup-db':
            db()
            output = Path(args.output).resolve()
            public_roots = [Path(app.config['WEB_DIR']).resolve(), Path(app.config['PUBLIC_DIR']).resolve()]
            if any(root == output or root in output.parents for root in public_roots):
                raise SystemExit('Backups must be outside public/ and web/')
            backup_database(target, output)
            print('Private SQLite backup created (not included in deployment ZIPs).')
        elif args.action == 'init-db':
            db()
            print('Database initialized/upgraded.')
        else:
            connection = db()
            print('integrity:', connection.execute('PRAGMA integrity_check').fetchone()[0])
            print('foreign_key_errors:', len(connection.execute('PRAGMA foreign_key_check').fetchall()))
            print('migrations:', connection.execute('SELECT count(*) FROM _argo_migrations').fetchone()[0])
            for table in ('members', 'posts', 'guestbook', 'safety_posts', 'msds_assets'):
                print(table + ':', connection.execute('SELECT count(*) FROM ' + table).fetchone()[0])


if __name__ == '__main__':
    main()
