"""Flask factory; WSGI imports never start the development server."""
import os
from pathlib import Path
from urllib.parse import urlsplit
from dotenv import load_dotenv
from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

ROOT = Path(__file__).resolve().parent


def create_app(overrides=None):
    load_dotenv(ROOT / '.env', override=False)
    app = Flask(__name__, static_folder=None)
    names = ('APP_ORIGIN', 'AUTH_SECRET', 'DATA_DIR', 'MASTER_EMAIL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'NAVER_MAP_CLIENT_ID', 'MAIL_TRANSPORT', 'MAIL_FROM', 'MAIL_API_URL', 'MAIL_API_KEY')
    app.config.update({key: os.environ.get(key, '') for key in names})
    app.config.update(PUBLIC_DIR=str(ROOT / 'public'), WEB_DIR=str(ROOT / 'web'), MAX_CONTENT_LENGTH=16 * 1024 * 1024, MAX_FORM_MEMORY_SIZE=256 * 1024, MAX_FORM_PARTS=30)
    if overrides:
        app.config.update(overrides)
    if len(app.config['AUTH_SECRET']) < 32:
        raise RuntimeError('Set AUTH_SECRET (32+ random characters) in the private .env first')
    origin = app.config['APP_ORIGIN'].rstrip('/')
    parsed = urlsplit(origin)
    if parsed.scheme not in ('https', 'http') or not parsed.hostname or parsed.path or parsed.query or parsed.fragment or parsed.username:
        raise RuntimeError('APP_ORIGIN must be an origin, e.g. https://USERNAME.pythonanywhere.com')
    if parsed.scheme != 'https' and parsed.hostname not in ('localhost', '127.0.0.1', '::1'):
        raise RuntimeError('Public APP_ORIGIN must use HTTPS')
    app.config['APP_ORIGIN'] = origin
    app.config['TRUSTED_HOSTS'] = [parsed.hostname]
    data = Path(app.config['DATA_DIR'] or '.data')
    app.config['DATA_DIR'] = str((ROOT / data).resolve())
    resolved_data = Path(app.config['DATA_DIR'])
    for key in ('PUBLIC_DIR', 'WEB_DIR'):
        public_root = Path(app.config[key]).resolve()
        if resolved_data == public_root or public_root in resolved_data.parents:
            raise RuntimeError('DATA_DIR must be outside public/ and web/')
    from server import accounts, community, members, resources, workspace, pages, news
    for module in (accounts, community, members, resources, workspace, pages, news):
        app.register_blueprint(module.bp)

    @app.after_request
    def protect(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'no-referrer' if request.path == '/login' else 'strict-origin-when-cross-origin'
        if not request.path.startswith(('/assets/', '/vendor/', '/images/', '/fonts/', '/safety/', '/templates/')):
            response.headers['Cache-Control'] = 'no-store'
        for name, (value, seconds) in g.get('cookies', {}).items():
            response.set_cookie(name, value, max_age=seconds, secure=parsed.scheme == 'https', httponly=True, samesite='Lax', path='/')
        return response

    @app.teardown_appcontext
    def close_database(exception):
        connection = g.pop('db', None)
        if connection:
            connection.close()

    @app.errorhandler(Exception)
    def handle_error(exception):
        if isinstance(exception, HTTPException):
            return exception
        app.logger.error('Request failed: %s', type(exception).__name__)
        return jsonify(error='server-error'), 500

    @app.get('/')
    @app.get('/<path:path>')
    def frontend(path=''):
        if path.startswith(('api/', 'auth/', 'actions/')):
            return jsonify(error='not-found'), 404
        if any(part.startswith('.') for part in Path(path).parts):
            return jsonify(error='not-found'), 404
        web = Path(app.config['WEB_DIR'])
        candidate = (web / path).resolve()
        if path and web.resolve() in candidate.parents and candidate.is_file():
            return send_from_directory(web, path)
        if path.startswith('.') or Path(path).suffix:
            return jsonify(error='not-found'), 404
        if not (web / 'index.html').is_file():
            return jsonify(error='frontend-not-built', message='Run npm ci and npm run build first'), 503
        return send_from_directory(web, 'index.html')
    return app


if __name__ == '__main__':
    create_app().run(host='127.0.0.1', port=5000, debug=False)
