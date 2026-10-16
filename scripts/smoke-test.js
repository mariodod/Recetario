/**
 * Prueba rapida de todas las rutas. Requiere el servidor levantado:
 *
 *   node scripts/smoke-test.js
 */
const BASE = 'http://localhost:8081';
const gestorDB = require('../modules/gestorDB.js');

const checks = [
  ['GET', '/', null, 200],
  ['GET', '/recetas', null, 200],
  ['GET', '/recetas?pg=2', null, 200],
  ['GET', '/recetas?pg=99', null, 302],   // fuera de rango -> ultima pagina
  ['GET', '/receta', null, 200],
  ['GET', '/login', null, 200],
  ['GET', '/menu', null, 200],
  ['GET', '/promo/foo', null, 200],
  ['GET', '/noexiste', null, 404],
  ['GET', '/images/Gorro_chef.png', null, 200],
  ['GET', '/privado/algo', null, 302],
  ['GET', '/receta/id-invalido', null, 404],
  ['POST', '/receta', { titulo: '  ', tiempo: '10' }, 400],
  ['POST', '/receta', { titulo: 'Receta de prueba', tiempo: '25' }, 302],
  ['POST', '/login', { username: 'mario', password: 'malo' }, 401],
  ['POST', '/login', { username: 'mario', password: 'recetario123' }, 302],
  ['GET', '/', null, 200],   // ya con sesion: debe verse el usuario en la barra
  ['GET', '/logout', null, 302],
  ['POST', '/login', { username: 'mario', password: 'recetario123' }, 302],
];

(async () => {
  let cookie = null;
  let fails = 0;
  let trasLogin = false;

  for (const [method, path, body, expected] of checks) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;

    let payload;
    if (body) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      payload = new URLSearchParams(body).toString();
    }

    const res = await fetch(BASE + path, { method, headers, body: payload, redirect: 'manual' });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];

    const text = await res.text();
    const ok = res.status === expected;
    if (!ok) fails++;

    const markers = [];
    if (method === 'GET' && res.status === 200 && path !== '/images/Gorro_chef.png') {
      if (text.includes('ReceMario')) markers.push('base');
      if (text.includes('Receta de prueba')) markers.push('receta-nueva');
      if (text.includes('alert alert-')) markers.push('mensaje');
      if (path === '/' && text.includes('Cerrar sesión')) { markers.push('sesion'); trasLogin = true; }
      if (path === '/' && text.includes('Identifícate')) markers.push('sin-sesion');
    }

    console.log(`${ok ? 'OK  ' : 'FAIL'} ${method.padEnd(4)} ${path.padEnd(24)} -> ${res.status} (esperado ${expected}) [${markers.join(', ')}]`);
    if (!ok) console.log('      body: ' + text.slice(0, 300).replace(/\s+/g, ' '));
  }

  // Detalle de receta con un id real
  gestorDB.init(process.env.MONGODB_URI || 'mongodb://localhost:27017/recetario');
  await gestorDB.connect();
  const recetas = await gestorDB.obtenerRecetas({ titulo: 'Receta de prueba' });
  await gestorDB.close();

  if (recetas.length === 0) {
    console.log('FAIL /receta/:id -> no se encontro la receta creada');
    fails++;
  } else {
    const res = await fetch(BASE + '/receta/' + recetas[0]._id);
    const json = await res.json();
    const ok = res.status === 200 && json.titulo === 'Receta de prueba';
    if (!ok) fails++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} GET  /receta/:id               -> ${res.status} [${JSON.stringify(json).slice(0, 80)}]`);
  }

  // La sesion debe seguir tras el segundo login
  if (!trasLogin) { console.log('FAIL la sesion no se mantiene'); fails++; }

  // Renderizado de plantillas: paginacion, avisos y escape de HTML
  const pag1 = await (await fetch(BASE + '/recetas?pg=1')).text();
  const pag2 = await (await fetch(BASE + '/recetas?pg=2')).text();
  const comprobaciones = [
    ['paginacion pg=1: primera desactivada y enlace a la siguiente',
      (pag1.match(/page-item disabled/g) || []).length === 1 && pag1.includes('pg=2')],
    ['paginacion pg=2: ultima desactivada y enlace a la anterior',
      (pag2.match(/page-item disabled/g) || []).length === 1 && pag2.includes('pg=1')],
    ['aviso con la clase pedida',
      (await (await fetch(BASE + '/?mensaje=Receta+creada&tipoMensaje=alert-warning')).text())
        .includes('alert alert-warning')],
    ['tipoMensaje fuera de la lista blanca se descarta',
      (await (await fetch(BASE + '/?mensaje=hola&tipoMensaje=%22+onmouseover%3Dx')).text())
        .includes('alert alert-info')],
    ['el mensaje se escapa (sin XSS)',
      !(await (await fetch(BASE + '/?mensaje=%3Cscript%3Ealert(1)%3C%2Fscript%3E')).text())
        .includes('<script>')]
  ];
  for (const [nombre, ok] of comprobaciones) {
    if (!ok) fails++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${nombre}`);
  }

  console.log(fails ? `\n${fails} comprobaciones fallidas` : '\nTodas las comprobaciones correctas');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(1); });
