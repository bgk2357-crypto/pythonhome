import { Footer, Header, PageHeading } from "../components";
import { getUser } from "../auth";
import { safeReturnPath } from "../auth/session";
import {AccountForms} from '../account-forms';
import { setting } from "../runtime-config";

export const dynamic = "force-dynamic";
export const metadata={referrer:'no-referrer'};
const errors: Record<string, string> = {mail:"메일 발송 설정이 필요합니다. 운영자에게 문의해주세요.",token:"재설정 링크가 만료되었거나 이미 사용되었습니다. 다시 요청해주세요.",
  email:'아이디는 올바른 이메일 주소로 입력해주세요.',duplicate:'이미 가입된 이메일입니다. 기존 로그인 방법으로 이용해주세요.',password:'영문자·숫자·특수문자를 모두 포함한 8~16자 비밀번호와 확인 값을 입력해주세요.',consent:'개인정보 안내 확인 및 동의가 필요합니다.',credentials:'이메일 또는 비밀번호를 확인해주세요.',setup:'기존 회원입니다. Google 로그인으로 본인확인 후 홈페이지 비밀번호를 처음 설정해주세요.',reauth:'현재 비밀번호 또는 최근 Google 본인확인이 필요합니다.',link:'이미 사용 중인 이메일이거나 계정 연결을 확인할 수 없습니다. 기존 이메일 로그인 후 같은 이메일의 Google 계정을 연결해주세요.',rate:'시도 횟수가 많습니다. 15분 후 다시 시도해주세요.',busy:'저장하지 못했습니다. 잠시 후 다시 시도해주세요.',invalid:'입력 형식을 확인해주세요.',authentication:'로그인 후 비밀번호를 설정해주세요.',
  configuration: "구글 로그인을 준비 중입니다. 설정이 완료되면 이용할 수 있습니다.",
  origin: "구글 로그인은 등록된 홈페이지 주소에서 이용해주세요.",
  cancelled: "로그인이 취소되었거나 요청이 만료되었습니다. 다시 시도해주세요.",
  failed: "구글 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.",
};
export default async function Login({ searchParams }: { searchParams: Promise<{ return_to?: string; error?: string;mode?:string;saved?:string;token?:string }> }) {
  const query = await searchParams; const user = await getUser();
  const ready = !!setting("GOOGLE_CLIENT_ID") && !!setting("GOOGLE_CLIENT_SECRET") && setting("AUTH_SECRET").length >= 32 && !!setting("APP_ORIGIN");
  const returnTo = safeReturnPath(query.return_to ?? "/members");
  return <><Header /><main className="page-main container" id="main-content"><PageHeading eyebrow="로그인" title="회원가입 · 로그인" description="이메일 아이디 또는 Google 계정으로 이용하세요." /><section className="content-panel auth-panel">
    {query.saved&&<p className="notice success" role="status">{query.saved==='sent'?'등록된 이메일이면 재설정 메일이 발송됩니다. 받은편지함과 스팸함을 확인해주세요.':query.saved==='withdrawn'?'회원탈퇴를 완료했습니다.':'비밀번호를 저장했습니다. 새 비밀번호로 로그인해주세요.'}</p>}<AccountForms token={query.token} mode={query.mode} returnTo={returnTo} googleReady={ready}/>{query.error && <p className="notice error" role="alert">{errors[query.error] ?? errors.failed}</p>}
    {user ? <><h2>{user.displayName}님, 로그인되어 있습니다</h2><a className="button" href={returnTo}>계속하기 →</a></> : <><h2>반갑습니다</h2><p className="muted">Google로 간편가입하면 예비회원으로 등록됩니다. 사업장 기본정보를 모두 입력하면 일반회원으로 글쓰기와 자료 등록을 이용할 수 있습니다.</p>
      {ready ? <a className="button google-button" href={`/auth/google?return_to=${encodeURIComponent(returnTo)}`} target="_top"><span aria-hidden="true">G</span> Google 계정으로 계속하기</a> : <p className="notice" role="status">구글 로그인을 준비 중입니다. 설정이 완료되면 이용할 수 있습니다.</p>}
      <p className="form-help"><a href="/privacy">개인정보 안내</a> · 홈페이지 비밀번호는 안전한 해시로 보관하며 Google 비밀번호는 받지 않습니다.</p></>}
  </section></main><Footer /></>;
}
