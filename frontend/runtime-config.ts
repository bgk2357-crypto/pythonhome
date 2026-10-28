import { context } from './context';
// Only public settings and a readiness boolean reach the browser. No secrets.
export function setting(name: string) {
  if (name === 'NAVER_MAP_CLIENT_ID') return context.mapKey;
  if (name === 'APP_ORIGIN') return location.origin;
  if (name === 'AUTH_SECRET') return context.googleReady ? 'public-readiness-flag-not-a-secret' : '';
  return context.googleReady && ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].includes(name) ? 'configured' : '';
}
