CREATE TABLE IF NOT EXISTS safety_posts (
 id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, author TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('가이드','서식','교육자료','사례','기타')),
 title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL,
 published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1))
);
CREATE INDEX IF NOT EXISTS safety_posts_order ON safety_posts(published,created_at DESC,id);
CREATE TABLE IF NOT EXISTS safety_files (
 id TEXT PRIMARY KEY NOT NULL, post_id TEXT NOT NULL REFERENCES safety_posts(id) ON DELETE CASCADE,
 name TEXT NOT NULL, size INTEGER NOT NULL, static_path TEXT
);
CREATE INDEX IF NOT EXISTS safety_files_post ON safety_files(post_id);
CREATE TABLE IF NOT EXISTS safety_file_chunks (
 file_id TEXT NOT NULL REFERENCES safety_files(id) ON DELETE CASCADE,
 part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY(file_id,part)
);
INSERT OR IGNORE INTO safety_posts(id,user_id,author,category,title,body,created_at,published) VALUES
 ('starter-guide','system','Argo&Health Lab','가이드','안전보건관리체계 실무 구축 가이드북 (검토용)','공통·업종별 가이드 등을 재구성한 25쪽 검토용 자료입니다. 8주 일정은 제안 예시이며 법정 기간이 아닙니다. 사업장별 법정 의무를 별도로 확인하고 내용 검수 후 활용하세요.','2026-10-25T00:00:00.000Z',1),
 ('starter-checklist','system','Argo&Health Lab','서식','7가지 핵심요소별 자율점검 체크리스트','사용자가 제공한 고용노동부·안전보건공단 2022년 안내 이미지입니다. 자율점검 참고자료로 사용하고 현행 법정 의무 전체를 대신하는 기준으로 사용하지 마세요.','2026-10-25T00:00:01.000Z',1),
 ('starter-elements','system','Argo&Health Lab','교육자료','안전보건관리체계 구축 7가지 핵심요소','제공된 고용노동부·안전보건공단 안내 이미지입니다. 경영자 리더십부터 평가 및 개선까지 7가지 핵심요소를 확인할 수 있습니다.','2026-10-25T00:00:02.000Z',1);
INSERT OR IGNORE INTO safety_files(id,post_id,name,size,static_path) VALUES
 ('starter-guide-pdf','starter-guide','안전보건관리체계_실무가이드북_검토용.pdf',270062,'/safety/guide.pdf'),
 ('starter-checklist-png','starter-checklist','7가지_체크리스트.png',132998,'/safety/seven-checklist.png'),
 ('starter-elements-png','starter-elements','7가지_핵심요소.png',120777,'/safety/seven-elements.png');
