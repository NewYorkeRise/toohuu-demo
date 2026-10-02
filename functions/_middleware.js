// Protects /admin with a username + password (HTTP Basic Auth).
// Runs on Cloudflare's servers before the page is sent, so the admin HTML is
// never delivered without valid credentials. Credentials live in Cloudflare
// environment variables (ADMIN_USER, ADMIN_PASS), never in this repository.

const REALM = 'TOOHUU admin';

function isAdminPath(pathname) {
  let p;
  try {
    p=pathname;
    for(let i=0;i<3;i++){const decoded=decodeURIComponent(p);if(decoded===p)break;p=decoded;}
    p=new URL('https://admin.invalid'+p.replace(/\\/g,'/').replace(/\/{2,}/g,'/')).pathname.toLowerCase();
  } catch { return true; }
  return p === '/admin' || p.startsWith('/admin.') || p.startsWith('/admin/');
}

async function sameSecret(a, b) {
  // Compare fixed-length digests so timing does not leak how much matched.
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

function parseBasic(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const bytes = Uint8Array.from(atob(header.slice(6).trim()), c => c.charCodeAt(0));
    const text = new TextDecoder().decode(bytes);          // UTF-8, so Cyrillic passwords work
    const i = text.indexOf(':');
    return i < 0 ? null : { user: text.slice(0, i), pass: text.slice(i + 1) };
  } catch {
    return null;
  }
}

const challenge = () => new Response('Нэвтрэх шаардлагатай.', {
  status: 401,
  headers: {
    'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  },
});

export async function onRequest({ request, env, next, data }) {
  const url = new URL(request.url);
  if (!isAdminPath(url.pathname)) return next();

  // Fail closed: if the credentials were never configured, nobody gets in.
  if (!env.ADMIN_USER || !env.ADMIN_PASS) {
    return new Response('Админ нэвтрэлт тохируулагдаагүй байна (ADMIN_USER / ADMIN_PASS).', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const cred = parseBasic(request.headers.get('Authorization'));
  if (!cred) return challenge();

  const [userOk, passOk] = await Promise.all([
    sameSecret(cred.user, env.ADMIN_USER),
    sameSecret(cred.pass, env.ADMIN_PASS),
  ]);
  if (!(userOk && passOk)) return challenge();

  data.adminUser = cred.user;
  if (!['GET', 'HEAD'].includes(request.method) && request.headers.get('Origin') !== url.origin) {
    return Response.json({error:'Хүсэлт зөвшөөрөгдөөгүй.'}, {status:403,headers:{'Cache-Control':'no-store'}});
  }

  const res = await next();
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', 'no-store');           // never cache the admin in shared caches
  out.headers.set('X-Robots-Tag', 'noindex, nofollow');
  out.headers.set('X-Content-Type-Options', 'nosniff');
  out.headers.set('X-Frame-Options', 'DENY');
  out.headers.set('Referrer-Policy', 'same-origin');
  out.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' https: data: blob:; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  return out;
}
