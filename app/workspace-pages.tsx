import { getUser,signInPath } from './auth';
import { getMember } from './data';
import { PageHeading } from './components';
import { workspaceAccess,workspaceServices } from '../lib/workspace';
import { WorkDashboard } from './work-dashboard';
import { MsdsWorkspace } from './msds-workspace';
import { canWrite } from '../lib/membership';
export async function ServicePortal(){
 const user=await getUser(),member=await getMember(user?.userId),allowed=workspaceAccess(member);
 return <><PageHeading eyebrow="회원 전용 서비스" title="우리 사업장의 안전보건 업무 공간" description="업무를 선택하면 독립된 대시보드가 새 창으로 열립니다."/><div className="portal-intro"><span className="portal-pill">MEMBER WORKSPACE</span><div><h2>{member?.businessName||'사업장 업무를 한곳에서'}</h2><p>{allowed?'정회원 업무 서비스를 이용할 수 있습니다.':user?'업무 대시보드는 정회원·마스터 전용입니다. 일반회원은 자료실에서 MSDS 맛보기를 이용할 수 있습니다.':'로그인 후 회원등급에 맞는 서비스를 이용하세요.'}</p></div><a className="button secondary" href={user?'/members':signInPath('/services')}>{user?'내 회원정보':'로그인'}</a></div><div className="service-portal-grid">{workspaceServices.map((s,i)=><article key={s.id}><span className="portal-index">0{i+1}</span><small>{i===3?'MSDS MANAGEMENT':'SAFETY WORKSPACE'}</small><h2>{s.title}</h2><p>{s.description}</p><ul>{s.tasks.slice(1,4).map(task=><li key={task}>{task}</li>)}</ul><a className="button" href={'/workspace/'+s.id} target="_blank" rel="noopener noreferrer">대시보드 새 창으로 열기 ↗</a><span className="portal-state">{i===3?'등록·검토·분류·산출물 업무':'업무 메뉴 및 대시보드 구성'}</span></article>)}</div></>;
}
export async function WorkspacePage({id}:{id:string}){
 const service=workspaceServices.find(s=>s.id===id);if(!service)return null;
 const user=await getUser(),member=await getMember(user?.userId);
 if(!workspaceAccess(member))return <div className="workspace-access"><a href="/services">← 회원 전용 서비스</a><span className="portal-pill">MEMBERS ONLY</span><h1>{service.title}</h1><h2>정회원 전용 업무 대시보드입니다</h2><p>{user?'일반회원은 자료실의 MSDS 맛보기를 이용할 수 있습니다. 내 회원정보에서 정회원 신청을 진행해주세요.':'Google 로그인 후 회원등급을 확인해주세요.'}</p><a className="button" href={user?'/members':signInPath('/workspace/'+id)}>{user?'내 회원정보·정회원 신청':'Google 로그인'}</a><a className="button secondary" href="/resources/msds">MSDS 맛보기</a></div>;
 return <WorkDashboard serviceId={id} displayName={member!.displayName} businessName={member!.businessName||''}/>;
}
export async function MsdsTrial(){
 const user=await getUser(),member=await getMember(user?.userId);
 return <><div className="trial-banner"><strong>일반회원 MSDS 맛보기</strong><p>최대 3건의 자료로 추출·수정·출력 기능을 체험합니다. 자료는 현재 브라우저에만 저장됩니다. 정회원 업무 공간은 원본과 검토자료를 서버에 계정별로 저장합니다.</p><a href="/services">정회원 업무 대시보드 보기 ↗</a></div>{canWrite(member)?<MsdsWorkspace maxRecords={3}/>:<div className="content-panel"><h2>일반회원부터 이용할 수 있습니다</h2><p>로그인한 뒤 사업장 기본정보를 모두 입력해주세요.</p><a className="button" href={user?'/members':signInPath('/resources/msds')}>{user?'기본정보 입력':'로그인'}</a></div>}</>;
}
