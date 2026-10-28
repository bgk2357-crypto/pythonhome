import { context } from './context';
export async function getMember(_id?: string) { return context.member; }
export async function getEntries(_page: number) { return context.entries; }
export async function getPosts(_kind: string, _page: number, _userId?: string) { return context.posts; }
export async function getCommunityPost(_id: number) { return context.selected; }
export function pageNumber(value?: string) { const page = Number(value); return Number.isInteger(page) && page >= 1 ? Math.min(page, 10000) : 1; }
export function displayDate(value: string) { return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)); }
