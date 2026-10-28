export const company = { name: "Argo&Health Lab", representative: "김지훈", address: "경기도 안산시 상록구 팔곡일동", phone: "010-7651-9208" };
export const navigation = [
  { label: "회사소개", href: "/company/greeting", children: [["인사말", "/company/greeting"], ["비전", "/company/vision"], ["연혁", "/company/history"], ["주요실적", "/company/achievements"], ["조직도", "/company/organization"], ["찾아오는길", "/company/location"]] },
  { label: "사업범위 소개", href: "/business/system", children: [ ["안전보건관리체계 구축", "/business/system"], ["위험성평가", "/business/risk"], ["근골격계부담작업 유해요인조사", "/business/ergonomics"]] },
  { label: "산업보건소식", href: "/news/notices", children: [["공지사항", "/news/notices"], ["산업보건동향", "/news/trends"], ["일반뉴스", "/news/general"], ["산업재해 통계 현황", "/news/statistics"]] },
  { label: "자료실", href: "/resources/osh-law", children: [["산업안전보건법규", "/resources/osh-law"], ["중대재해처벌법규", "/resources/serious-law"], ["안전보건기술지침", "/resources/guidelines"], ["물질안전보건자료", "/resources/msds"], ["안전보건 자료 및 서식", "/resources/safety-forms"]] },
  { label: "회원 전용 서비스", href: "/services", children: [] }, { label: "커뮤니티", href: "/community", children: [] }, { label: "Q&A", href: "/qna", children: [] }, { label: "방명록", href: "/guestbook", children: [] },
];
export const services = [
  { number: "01", title: "안전보건관리체계 구축", href: "/business/system", description: "사업장의 안전보건 활동을 지속 가능한 관리체계로 연결합니다.", points: ["사업장 운영 현황 확인", "안전보건 목표와 실행 절차 정리", "역할·책임 및 점검 체계 검토"] },
  { number: "02", title: "위험성평가", href: "/business/risk", description: "현장의 유해·위험요인을 살피고 개선 방향을 함께 정리합니다.", points: ["작업과 공정의 유해·위험요인 파악", "위험 수준 검토와 개선 방향 정리", "개선 활동 및 결과 확인"] },
  { number: "03", title: "근골격계부담작업 유해요인조사", href: "/business/ergonomics", description: "작업자의 움직임과 작업환경을 살펴 건강한 일터를 지원합니다.", points: ["작업 자세와 부담 요인 확인", "작업 현황 및 근로자 의견 확인", "작업환경 개선 방향 정리"] },
];
export const newsGroups = [
  { title: "공지사항", href: "/news/notices", description: "회사 소식과 서비스 안내를 확인하세요." },
  { title: "산업보건동향", href: "/news/trends", description: "안전보건공단·고용노동부·산업보건학회의 공지와 알림을 모았습니다." },
  { title: "일반뉴스", href: "/news/general", description: "안전·보건·화학물질 누출·사망사고·화재 관련 뉴스를 모았습니다." },
];
