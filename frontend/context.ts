export type User = { userId: string; displayName: string; email: string; fullName: string | null; role?: string };
export type Member = import("../lib/membership").MemberProfile;
export type Entry = { id: number; author: string; body: string; createdAt: string };
export type Post = Entry & { kind: string; title: string; userId: string; answer?:string; answeredAt?:string|null; answeredBy?:string|null };
export type PageData<T> = { items: T[]; total: number; current: number; pages: number };
export type Context = { user: User | null; member: Member | null; entries: PageData<Entry>; posts: PageData<Post>; selected: Post | null; googleReady: boolean; mapKey: string; csrf: string; paidRequests?:import("../lib/membership").PaidRequest[]; adminData?:import("../lib/membership").MemberAdminData|null; resources?: import("../lib/safety-resources").ResourcePage; resourceSelected?: import("../lib/safety-resources").ResourcePost | null };
export let context: Context;
export function setContext(value: Context) { context = value; }
export function routeUrl(path: string) {
  const url = new URL(path, location.origin);
  if (url.origin !== location.origin) throw Error('External route is not allowed');
  return url.pathname + url.search + url.hash;
}
