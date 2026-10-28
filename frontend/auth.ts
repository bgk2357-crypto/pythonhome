import { context, routeUrl } from './context';
export function getUser() { return context.user; }
export function signInPath(returnTo: string) { return routeUrl(`/login?return_to=${encodeURIComponent(returnTo)}`); }
export function signOutPath(returnTo = '/') { return routeUrl(`/auth/logout?return_to=${encodeURIComponent(returnTo)}`); }
