import React from 'react';
import { createRoot } from 'react-dom/client';
import Home from '../app/page';
import ContentPage from '../app/[...slug]/page';
import Login from '../app/login/page';
import { Header, Footer } from '../app/components';
import { context, setContext } from './context';
import '../app/globals.css';
document.documentElement.dataset.argoRuntime = 'python';
function prepareForms() {
  document.querySelectorAll<HTMLFormElement>('form[method="post"]').forEach(form => {
    if (new URL(form.action, location.origin).origin !== location.origin || form.querySelector('input[name="_csrf"]')) return;
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = '_csrf'; input.value = context.csrf;
    form.appendChild(input);
  });
}
new MutationObserver(prepareForms).observe(document.documentElement, { childList: true, subtree: true });
async function start() {
  const params = new URLSearchParams(location.search), path = location.pathname;
  const query = Object.fromEntries(params);
  const endpoint = new URL('/api/page', location.origin);
  endpoint.search = params.toString(); endpoint.searchParams.set('path', path);
  const response = await fetch(endpoint, { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw Error('홈페이지 데이터에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.');
  setContext(await response.json());
  let page;
  try {
    page = path === '/' ? await Home() : path === '/login' ? await Login({ searchParams: Promise.resolve(query) }) : await ContentPage({ params: Promise.resolve({ slug: path.slice(1).split('/') }), searchParams: Promise.resolve(query) });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'not-found') throw error;
    page = <><Header/><main className="page-main container" id="main-content"><h1>페이지를 찾을 수 없습니다</h1><a href="/">홈으로 이동 →</a></main><Footer/></>;
  }
  createRoot(document.getElementById('root')!).render(<><a className="skip-link" href="#main-content">본문으로 바로가기</a>{page}</>);
}
start().catch(error => {
  const message = document.createElement('p'); message.className = 'notice error';
  message.textContent = error instanceof Error ? error.message : '홈페이지를 불러오지 못했습니다.';
  document.getElementById('root')!.replaceChildren(message);
});
