import { getUser } from "./auth";
import { getMember } from "./data";
import { canWrite } from "../lib/membership";
import { MemberAccess } from "./member-pages";
import { EmptyState, PageHeading } from "./components";
import { displayDate, getCommunityPost, getPosts, pageNumber } from "./data";

export async function CommunityBoard({ query }: { query: { page?: string; post?: string; write?: string; saved?: string; error?: string } }) {
  const user=await getUser(); const member=await getMember(user?.userId);
  const data = await getPosts("community", pageNumber(query.page));
  const selected = query.post ? await getCommunityPost(Number(query.post)) : null;
  return <><PageHeading eyebrow="커뮤니티" title="커뮤니티 게시판" description="게시글은 누구나 읽을 수 있으며, 일반회원 이상부터 이야기를 나눌 수 있습니다." />
    {query.saved === "1" && <p className="notice success" role="status">게시글을 등록했습니다.</p>}
    {query.error && <p className="notice error" role="alert">{query.error === "invalid" ? "이름·제목·내용을 확인해주세요. 이름은 30자, 제목은 100자, 내용은 2,000자까지 입력할 수 있습니다." : query.error === "capacity" ? "게시글 등록 한도에 도달했습니다." : "저장하지 못했습니다. 잠시 후 다시 시도해주세요."}</p>}
    {query.post && !selected && <p className="notice error" role="alert">게시글을 찾을 수 없습니다.</p>}
    {selected && <article className="board-panel post-detail"><h2>{selected.title}</h2><div className="entry-top"><strong>{selected.author}</strong><time dateTime={selected.createdAt}>{displayDate(selected.createdAt)}</time></div><p>{selected.body}</p><a className="button secondary" href="/community">목록으로 →</a></article>}
    <section className="board-panel"><div className="board-top"><h2>전체 게시글 <span>{data.total}개</span></h2><a className="button" href="/community?write=1#write-post">회원 글쓰기 →</a></div>
      <div className="board-table-wrap"><table className="board-table"><caption className="sr-only">커뮤니티 게시글 목록</caption><thead><tr><th scope="col">번호</th><th scope="col">제목</th><th scope="col">작성자</th><th scope="col">작성일</th></tr></thead><tbody>{data.items.length ? data.items.map(item => <tr key={item.id}><td>{item.id}</td><td><a href={`/community?post=${item.id}`}>{item.title}</a></td><td>{item.author}</td><td><time dateTime={item.createdAt}>{displayDate(item.createdAt)}</time></td></tr>) : <tr><td colSpan={4}><EmptyState title="첫 게시글을 기다립니다" description="이름과 함께 건강한 일터의 이야기를 남겨주세요." /></td></tr>}</tbody></table></div>
      <nav className="pagination" aria-label="게시글 페이지">{data.current > 1 && <a href={`/community?page=${data.current - 1}`}>← 이전</a>}<span>{data.current} / {data.pages}</span>{data.current < data.pages && <a href={`/community?page=${data.current + 1}`}>다음 →</a>}</nav>
    </section>
    {query.write === "1" && !canWrite(member) && <section className="form-panel"><MemberAccess signedIn={!!user} target="/community?write=1"/></section>}{query.write === "1" && member && canWrite(member) && <section className="form-panel" id="write-post"><h2>회원 글쓰기</h2><form action="/actions/community" method="post"><label htmlFor="author">이름 <small>최대 30자</small></label><input id="author" name="author" value={member?.displayName||""} readOnly /><label htmlFor="title">제목 <small>최대 100자</small></label><input id="title" name="title" required maxLength={100} /><label htmlFor="body">내용 <small>최대 2,000자</small></label><textarea id="body" name="body" required maxLength={2000} rows={8} /><p className="form-help">일반회원 이상의 이용 이름으로 작성됩니다. 입력한 이름과 글은 공개됩니다. 개인정보나 민감한 정보는 남기지 마세요.</p><button type="submit" className="button">글 등록 →</button></form></section>}
  </>;
}
