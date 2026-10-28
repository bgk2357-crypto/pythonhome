export function safeReturnPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  const url = new URL(value, 'https://app.local');
  if (url.origin !== 'https://app.local' || url.pathname.startsWith('/auth/') || url.pathname === '/login' || url.pathname === '/index.php') return '/';
  return url.pathname + url.search + url.hash;
}
