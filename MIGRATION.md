# NAS 데이터 이전 및 보존

개발 루트는 NAS용 `C:\home`과 PythonAnywhere용 `C:\pythonhome`으로 분리합니다. 이번 폴더 이동은 Windows 개발 프로젝트의 위치 변경이며 NAS 운영 데이터 이전이나 PythonAnywhere 배포가 아닙니다.

이 프로젝트를 생성하면서 실제 NAS에는 접속·수정하지 않았고 운영 회원·게시글 DB를 가져오지 않았습니다. 처음 실행하면 빈 회원/게시판과 기본 공개 자료 3건으로 시작합니다. 테스트용 데이터는 `.sites-runtime/`의 임시 DB만 사용합니다.

## 코드와 운영 데이터는 별개

- 기존 HOME 소스·NAS PHP 배포본을 그대로 보관합니다. PythonHOME은 별도의 Flask 서버와 React 빌드입니다.
- GitHub에는 개발 코드와 공개 화면 빌드를 올립니다. 운영 SQLite DB·첨부파일·비밀 설정을 Git으로 동기화하지 않습니다.
- NAS 설치 안내 기준 데이터 위치는 `/volume1/argo-homepage-data/argo.sqlite`입니다. 실제 NAS의 config.php에서 확인한 data_dir가 우선합니다. 비밀 설정 내용은 공개하지 마세요.
- 현재 NAS 방식의 공개 첨부 및 개인 MSDS 원본은 SQLite의 base64 청크로 저장됩니다. 따라서 일관된 DB 백업에는 이 파일 데이터도 포함됩니다. 별도로 운영자가 저장한 파일이 있으면 추가로 확인·이전합니다.

## 최초 데이터 가져오기

1. NAS 웹 코드·비공개 설정·데이터 디렉터리를 먼저 백업합니다.
2. 사용자의 글쓰기·업로드를 잠시 중단하고 SQLite Backup API/SQLite `.backup`으로 일관된 DB를 만듭니다. WAL 사용 중인 `argo.sqlite`만 단순 복사하면 최신 내용이 누락될 수 있습니다.
3. 백업을 비공개 경로로 PythonAnywhere에 전달합니다. GitHub·web·공개 URL을 통해 전달하지 않습니다.
4. PythonHOME의 `.env`를 설정합니다. 대상 DATA_DIR에는 아직 `argo.sqlite`가 없어야 합니다. 이미 있으면 먼저 별도 고유 경로에 백업하고 새 비공개 DATA_DIR를 선택합니다. 가져오기 도구는 기존 파일을 덮어쓰지 않습니다.
5. 가상환경에서 다음을 실행합니다.

```bash
python scripts/manage.py import-nas-db --source /home/USERNAME/private-transfer/nas-backup.sqlite
python scripts/manage.py check
```

6. 회원 수·게시글·자료실·계정별 MSDS·원본 다운로드·마스터 권한을 원본과 대조합니다. 소유자 MASTER_EMAIL, OAuth, 지도, 메일 설정은 새 서버에 별도 입력합니다.
7. 새 주소에서 기능을 검증하고 최종 백업 이후 데이터가 추가되지 않았는지 확인한 다음 접속 주소를 전환합니다. 새 사이트 운영을 시작한 뒤 NAS는 쓰기 서비스를 중지하거나 보관용으로 관리합니다. 사용자 승인 없이 DNS나 NAS 서비스를 바꾸지 않습니다.

## 호환성

- NAS와 같은 0000~0007 SQL 및 `_argo_migrations` 이력을 사용합니다. 알려진 미적용 이관만 복사된 DB에 적용합니다. 알 수 없는 이관이나 이력 없는 DB는 자동으로 가져오지 않습니다.
- NAS의 `pbkdf2_sha256$600000$HEX_SALT$HEX_HASH` 비밀번호 검증을 유지했습니다. 회원 식별자·기존 등급·프로필을 유지하며 비밀번호 원문은 필요하지 않습니다.
- Google 기존 연결 식별자도 유지합니다. 새 세션 키를 사용하므로 이전 사이트의 로그인 쿠키 대신 새 사이트에서 다시 로그인합니다.
- 단위 테스트는 합성 NAS 형식 데이터/마이그레이션·비밀번호 호환을 확인했습니다. 실제 NAS 운영 백업은 제공되지 않아 그 데이터의 이관 검증은 미완료입니다.
- NAS와 PythonHOME을 동시에 쓰면 회원·게시글·파일이 서로 달라집니다. 자동 동기화 기능은 없습니다. NAS로 되돌릴 때도 새 서버에서 추가된 데이터의 재이전 검토가 필요합니다.
