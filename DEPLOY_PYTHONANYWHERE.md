> **처음이라면:** [실제 계정으로 따라하는 초보자 가이드](2026-10-28_003차수정_PYTHONHOME_배포따라하기.html)부터 읽으세요. 특히 WSGI 링크 위치·Save와 Reload·정상 결과 확인 위치를 자세히 설명합니다.

# GitHub → PythonAnywhere 설치 절차

`C:\pythonhome`만 독립 GitHub 저장소에 올립니다. NAS용 `C:\home`과 저장소·운영 데이터를 분리합니다. 계정 생성·저장소 주소·비밀 키 입력은 실제 사용자 정보로 진행합니다. PythonAnywhere의 `/home/USERNAME/pythonhome` 경로는 이번 Windows 폴더 이동과 관계없이 그대로 사용합니다.

## 1. GitHub 비공개 저장소

GitHub에서 빈 Private 저장소 `pythonhome`을 생성합니다. 실제 소유자명을 아래 YOUR_ACCOUNT에 넣습니다. 이번 대화의 실제 저장소는 https://github.com/bgk2357-crypto/pythonhome.git 이며, 사용자의 업로드와 서버 복제가 확인됐습니다. 이미 업로드했다면 이 1번 단계는 건너뜁니다. 아래 YOUR_ACCOUNT·USERNAME은 다른 계정에서 재사용하기 위한 일반 예시입니다.

```powershell
cd C:\pythonhome
git status
git add .
git diff --cached --stat
git diff --cached --name-only
```

`.env`, 실제 키, DB, 업로드원본, 에이전트변환데이터, outputs, 가상환경이 없는지 확인합니다. `web/`와 `.env.example`은 포함해도 됩니다. 실제 비밀정보가 들어간 적이 있으면 `.gitignore` 추가만으로 과거 커밋에서 사라지지 않습니다.

```powershell
git commit -m "Initial PythonHOME Flask port"
git remote add origin https://github.com/YOUR_ACCOUNT/pythonhome.git
git push -u origin main
```

이미 원격이 있으면 중복 등록하지 않습니다. 비밀 토큰을 URL에 넣어 기록하지 마세요. GitHub Desktop 또는 Git Credential Manager의 인증을 사용할 수 있습니다.

## 2. PythonAnywhere에서 가져오기

PythonAnywhere Consoles → Bash에서 실행합니다. USERNAME은 PythonAnywhere 사용자명, YOUR_ACCOUNT는 GitHub 소유자명입니다.

```bash
git clone https://github.com/YOUR_ACCOUNT/pythonhome.git
cd ~/pythonhome
python3.12 -m venv ~/.virtualenvs/pythonhome
source ~/.virtualenvs/pythonhome/bin/activate
pip install -r requirements-lock.txt
cp .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"
```

Python 3.12는 예시이며 계정에서 제공되는 버전 중 3.10 이상을 선택하고 Web 설정과 맞춥니다. 비공개 저장소는 계정에 맞는 GitHub 인증을 사용합니다. 무료 계정의 SSH 및 외부 접속 제한 때문에 HTTPS 인증이 필요할 수 있습니다. 토큰을 URL에 삽입하거나 문서에 남기지 마세요.

이 저장소에는 빌드된 `web/`가 포함되므로 PythonAnywhere에서 npm이나 PHP를 설치할 필요가 없습니다. ZIP으로 설치할 경우에도 ZIP 내부를 `~/pythonhome`에 풀고 동일한 Python 설정을 합니다.

## 3. 비공개 환경 설정

PythonAnywhere Files에서 `~/pythonhome/.env`를 수정합니다. 프로젝트 전체 또는 홈 디렉터리를 정적 파일로 공개하지 않습니다.

```dotenv
APP_ORIGIN=https://USERNAME.pythonanywhere.com
AUTH_SECRET=앞에서_생성한_64자리_이상의_무작위값
DATA_DIR=/home/USERNAME/pythonhome-data
MASTER_EMAIL=실제_소유자_Google_이메일
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NAVER_MAP_CLIENT_ID=
MAIL_TRANSPORT=
MAIL_FROM=
MAIL_API_URL=https://api.resend.com/emails
MAIL_API_KEY=
```

AUTH_SECRET에는 위 한글 예시 대신 실제 무작위 값을 넣습니다. NAS AUTH_SECRET과 새 서버의 키는 별도로 관리하며 기존 로그인 쿠키는 이전하지 않습니다.

```bash
chmod 600 ~/pythonhome/.env
python scripts/manage.py init-db
python scripts/manage.py check
```

기존 NAS 데이터를 가져오려면 init-db를 먼저 하지 말고 MIGRATION.md의 최초 가져오기 절차를 따릅니다. init-db는 빈 신규 사이트를 시작할 때 사용합니다.

## 4. Web 앱과 WSGI

PythonAnywhere Web → Add a new web app → Manual configuration → 가상환경과 같은 Python 버전을 선택합니다.

- Source code / Working directory: `/home/USERNAME/pythonhome`
- Virtualenv: `/home/USERNAME/.virtualenvs/pythonhome`

Web 탭에 표시되는 WSGI configuration file의 기본 내용을 다음으로 바꿉니다.

```python
import sys
project_root = '/home/USERNAME/pythonhome'
if project_root not in sys.path:
    sys.path.insert(0, project_root)
from wsgi import application
```

Web → Reload 후 `https://USERNAME.pythonanywhere.com/api/health`에서 status=ok, runtime=python을 확인합니다. PythonAnywhere에서 `python flask_app.py`로 서버를 띄우지 않습니다. 웹 서비스는 WSGI로 실행됩니다.

## 5. 정적 파일 (선택)

처음에는 추가 매핑 없이 Flask가 `web/`에서 제공합니다. 최적화가 필요하면 Web → Static files에서 다음처럼 개별 폴더만 매핑합니다.

| URL | Directory |
| --- | --- |
| /assets/ | /home/USERNAME/pythonhome/web/assets/ |
| /vendor/ | /home/USERNAME/pythonhome/web/vendor/ |
| /safety/ | /home/USERNAME/pythonhome/web/safety/ |
| /ghs/ | /home/USERNAME/pythonhome/web/ghs/ |
| /templates/ | /home/USERNAME/pythonhome/web/templates/ |

`/`를 프로젝트 루트나 DATA_DIR로 매핑하지 않습니다. API·회원자료 다운로드는 Flask가 권한 확인 후 제공합니다.

## 6. 외부 서비스 설정

- Google OAuth: 새 주소를 웹 클라이언트에 등록하고 redirect URI를 `https://USERNAME.pythonanywhere.com/auth/google/callback`로 설정합니다. NAS의 `/index.php?route=...` 콜백과 다릅니다. 설정된 MASTER_EMAIL의 실제 Google 로그인 계정만 초기 소유자 마스터로 승격됩니다. 이메일 비밀번호로 가입한 계정은 이메일 문자열만 같다고 마스터가 되지 않습니다.
- 기존 이메일 회원과 Google 계정의 동일 이메일은 자동 병합하지 않습니다. 기존 계정 로그인 후 Google 연결을 진행합니다.
- 네이버 지도: 새 도메인을 서비스 허용 주소에 등록하고 NAVER_MAP_CLIENT_ID를 설정합니다.
- 비밀번호 재설정: 가입 이메일이 수신자입니다. `MAIL_TRANSPORT=api`, 검증된 `MAIL_FROM`, `MAIL_API_KEY`를 설정한 뒤 실제 수신을 확인합니다. 현재 메일 발송 설정은 미완료이며 NAS 설정 보류 상태와 별개입니다.
- 뉴스/API: PythonAnywhere 무료 계정은 외부 인터넷 접속이 허용 목록으로 제한됩니다. 필요한 Google·뉴스·지도 관련 서버 API·메일 API가 접근 가능한지 실제 계정에서 확인하고 필요 시 요금제 또는 허용 목록 요청을 검토합니다. 외부 수집 실패는 unavailable/stale로 표시하고 최근 캐시가 있으면 재사용합니다.
- 사용자 도메인·용량·트래픽은 실제 계정의 지원 범위를 확인합니다. 요금제 구매·DNS 변경은 이번 작업에서 수행하지 않았습니다.

## 7. 이후 수정 배포

로컬에서 수정 → `npm run build` → 테스트 → 차수별 배포 보관 → 소스와 web을 GitHub에 커밋·푸시합니다. PythonAnywhere에서는:

```bash
cd ~/pythonhome
source ~/.virtualenvs/pythonhome/bin/activate
python scripts/manage.py backup-db --output ~/pythonhome-backups/배포전_고유이름.sqlite
git pull --ff-only
pip install -r requirements-lock.txt
python scripts/manage.py init-db
python scripts/manage.py check
```

Web → Reload → 주요 기능을 확인합니다. GitHub push만으로 PythonAnywhere가 자동 갱신되지는 않습니다. `.github/workflows/verify.yml`은 검증용이며 실배포 자동화가 아닙니다. DB는 DATA_DIR에 있으므로 git pull이 덮어쓰지 않습니다. DB 구조 변경이 있으면 코드만 이전 커밋으로 되돌리는 것으로 복구되지 않을 수 있으니 코드·DB 백업을 함께 관리합니다.

공식 참고 (확인일 2026-10-28):
- https://help.pythonanywhere.com/pages/Flask/
- https://help.pythonanywhere.com/pages/StaticFiles/
- https://help.pythonanywhere.com/pages/ExternalVCS/
- https://help.pythonanywhere.com/pages/403ForbiddenError/
