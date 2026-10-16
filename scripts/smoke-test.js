/**
 * Prueba rapida de todas las rutas. Requiere el servidor levantado:
 *
 *   npm test
 */
const BASE = 'http://localhost:8081';
const gestorDB = require('../modules/gestorDB.js');

let fallos = 0;
let comprobaciones = 0;

function comprobar(nombre, condicion, detalle) {
    comprobaciones++;
    if (!condicion) fallos++;
    console.log(`${condicion ? 'OK  ' : 'FAIL'} ${nombre}${condicion || !detalle ? '' : '  -> ' + detalle}`);
}

/**
 * Cada flujo tiene su propio navegador, con su cookie de sesion.
 */
function crearNavegador() {
    let cookie = null;

    async function peticion(ruta, opciones = {}) {
        const headers = Object.assign({}, opciones.headers);
        if (cookie) headers.Cookie = cookie;

        let body;
        if (opciones.body) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            body = new URLSearchParams(opciones.body).toString();
        }

        const res = await fetch(BASE + ruta, {
            method: opciones.method || 'GET',
            headers: headers,
            body: body,
            redirect: 'manual'
        });

        const setCookie = res.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];

        return { status: res.status, texto: await res.text(), cabeceras: res.headers };
    }

    return {
        get: function (ruta, opciones) { return peticion(ruta, opciones); },
        post: function (ruta, body, opciones) {
            return peticion(ruta, Object.assign({ method: 'POST', body: body }, opciones));
        }
    };
}

async function main() {
    const anonimo = crearNavegador();

    // ------------------------------------------------------------------
    // Paginas publicas
    // ------------------------------------------------------------------
    for (const [ruta, esperado] of [
        ['/', 200], ['/recetas', 200], ['/menu', 200], ['/login', 200],
        ['/signup', 200], ['/recetas?pg=2', 200], ['/images/Gorro_chef.png', 200],
        ['/noexiste', 404], ['/receta/id-invalido', 404]
    ]) {
        const pagina = await anonimo.get(ruta);
        comprobar(`GET ${ruta}`, pagina.status === esperado, `estado ${pagina.status}, esperado ${esperado}`);
    }

    const inicio = await anonimo.get('/');
    comprobar('la portada muestra la receta del dia',
        inicio.texto.includes('Receta del día') && /href="\/receta\/[a-f0-9]{24}"/.test(inicio.texto));

    // ------------------------------------------------------------------
    // Filtros y paginacion
    // ------------------------------------------------------------------
    const listado = await anonimo.get('/recetas');
    comprobar('el listado pagina de 10 en 10',
        (listado.texto.match(/list-group-item/g) || []).length === 10);

    comprobar('el formulario de filtros viene completo',
        listado.texto.includes('value="facil"') && listado.texto.includes('value="media"')
        && listado.texto.includes('value="dificil"') && listado.texto.includes('lista-ingredientes')
        && listado.texto.includes('value="vegetariano"'));

    const porDificultad = await anonimo.get('/recetas?dificultad=facil');
    comprobar('el filtro de dificultad devuelve recetas',
        (porDificultad.texto.match(/list-group-item/g) || []).length > 0);

    const porEtiqueta = await anonimo.get('/recetas?etiqueta=vegetariano');
    comprobar('el filtro de etiqueta devuelve recetas',
        (porEtiqueta.texto.match(/list-group-item/g) || []).length > 0);

    const porIngrediente = await anonimo.get('/recetas?ingrediente=pollo');
    comprobar('el filtro de ingrediente encuentra "pollo"',
        porIngrediente.texto.includes('Pollo al curry'));

    const porTiempo = await anonimo.get('/recetas?tiempo=10');
    comprobar('el filtro de tiempo excluye recetas largas',
        porTiempo.texto.includes('Batido de frutas') && !porTiempo.texto.includes('Cocido madrileño'));

    const paginada = await anonimo.get('/recetas?dificultad=facil&pg=2');
    comprobar('la paginacion conserva los filtros',
        paginada.texto.includes('dificultad=facil') && paginada.texto.includes('pg='));

    const fueraDeRango = await anonimo.get('/recetas?dificultad=facil&pg=9999');
    comprobar('una pagina inexistente redirige a la ultima',
        fueraDeRango.status === 302 && fueraDeRango.cabeceras.get('location').startsWith('/recetas?dificultad=facil&pg='));

    const sinResultados = await anonimo.get('/recetas?titulo=zzzznoexiste');
    comprobar('un filtro sin resultados avisa al usuario',
        sinResultados.texto.includes('Ninguna receta cumple'));

    // ------------------------------------------------------------------
    // Detalle de receta (HTML y JSON)
    // ------------------------------------------------------------------
    gestorDB.init(process.env.MONGODB_URI || 'mongodb://localhost:27017/recetario');
    await gestorDB.connect();
    const recetas = await gestorDB.obtenerRecetas({});
    const id = String(recetas[0]._id);

    const detalle = await anonimo.get('/receta/' + id);
    comprobar('el detalle de receta se renderiza como pagina',
        detalle.status === 200 && detalle.texto.includes('<h1>'));

    const comoJson = await anonimo.get('/receta/' + id, { headers: { Accept: 'application/json' } });
    const recetaJson = JSON.parse(comoJson.texto);
    comprobar('el detalle se puede pedir como JSON',
        comoJson.status === 200 && recetaJson._id === id && typeof recetaJson.titulo === 'string');

    // ------------------------------------------------------------------
    // Menu aleatorio
    // ------------------------------------------------------------------
    const menu = await anonimo.post('/menu', { momento: 'ambos', numero: '4' });
    comprobar('el menu aleatorio devuelve platos',
        menu.status === 200 && (menu.texto.match(/list-group-item/g) || []).length === 4);

    const postres = await anonimo.post('/menu', { momento: 'postre', numero: '2' });
    comprobar('el menu de postres no incluye platos principales',
        !postres.texto.includes('Fabada asturiana') && !postres.texto.includes('Merluza al horno'));

    const menuGrande = await anonimo.post('/menu', { momento: 'cena', numero: '99' });
    comprobar('el numero de platos se limita a un maximo razonable',
        (menuGrande.texto.match(/list-group-item/g) || []).length <= 10);

    // ------------------------------------------------------------------
    // Sesiones: alta, acceso protegido, login y logout
    // ------------------------------------------------------------------
    const sinSesion = crearNavegador();
    const formulario = await sinSesion.get('/receta');
    comprobar('el formulario de receta pide identificarse', formulario.status === 302);

    const guardadoSinSesion = await sinSesion.post('/receta', { titulo: 'No deberia guardarse' });
    comprobar('no se puede guardar receta sin identificarse', guardadoSinSesion.status === 302);

    const usuario = 'prueba-' + Date.now();
    const password = 'clave-de-prueba-1';

    const registro = crearNavegador();
    const cuentaCreada = await registro.post('/signup', {
        username: usuario, password: password, confirmacion: password
    });
    comprobar('el registro crea la cuenta e inicia sesion',
        cuentaCreada.status === 302 && (cuentaCreada.cabeceras.get('location') || '').startsWith('/?mensaje='));

    const cuentaDuplicada = await registro.post('/signup', {
        username: usuario, password: password, confirmacion: password
    });
    comprobar('no se puede repetir el nombre de usuario', cuentaDuplicada.status === 400);

    const cuentaCorta = await crearNavegador().post('/signup', {
        username: 'ab', password: password, confirmacion: password
    });
    comprobar('se validan el usuario y la contraseña cortos', cuentaCorta.status === 400);

    const cuentaDesconfiada = await crearNavegador().post('/signup', {
        username: 'prueba-otro-' + Date.now(), password: password, confirmacion: password + 'x'
    });
    comprobar('se comprueba que las contraseñas coinciden', cuentaDesconfiada.status === 400);

    const login = crearNavegador();
    const loginErroneo = await login.post('/login', { username: 'mario', password: 'incorrecta' });
    comprobar('un login con contraseña mala devuelve error', loginErroneo.status === 401);

    const loginCorrecto = await login.post('/login', { username: 'mario', password: process.env.SEED_PASSWORD || 'recetario123' });
    comprobar('el login con la contraseña buena inicia sesion', loginCorrecto.status === 302);

    const barra = await login.get('/');
    comprobar('con sesion iniciada se ve el usuario en la barra', barra.texto.includes('Cerrar sesión'));

    const logout = await login.get('/logout');
    const trasLogout = await login.get('/');
    comprobar('el logout cierra la sesion', logout.status === 302 && trasLogout.texto.includes('Identifícate'));

    // ------------------------------------------------------------------
    // Alta de receta (con la sesion del registro)
    // ------------------------------------------------------------------
    const etiquetaNueva = 'etiqueta-de-prueba-' + Date.now();
    const formularioReceta = await registro.get('/receta');
    comprobar('el formulario de receta se abre identificado', formularioReceta.status === 200);
    comprobar('el formulario de receta trae el autocompletado de etiquetas e ingredientes',
        formularioReceta.texto.includes('id="lista-etiquetas"') && formularioReceta.texto.includes('id="lista-ingredientes"'));

    const recetaIncompleta = await registro.post('/receta', { titulo: '   ' });
    comprobar('una receta sin titulo se rechaza', recetaIncompleta.status === 400);

    const creada = await registro.post('/receta', {
        titulo: 'Receta de prueba',
        tiempo: '25',
        dificultad: 'facil',
        momento: 'cena',
        ingredientes: 'Huevo, Sal, Pimienta',
        etiquetas: etiquetaNueva + ', Receta de prueba'
    });
    const destino = creada.cabeceras.get('location') || '';
    comprobar('una receta valida se guarda y redirige a su detalle',
        creada.status === 302 && destino.startsWith('/receta/'));

    const guardada = await anonimo.get(destino.split('?')[0], { headers: { Accept: 'application/json' } });
    const recetaGuardada = JSON.parse(guardada.texto);
    comprobar('los ingredientes y etiquetas se guardan como arrays en minusculas',
        Array.isArray(recetaGuardada.ingredientes) && recetaGuardada.ingredientes.includes('huevo')
        && recetaGuardada.etiquetas.includes(etiquetaNueva));

    const etiquetasGuardadas = await gestorDB.obtenerEtiquetas();
    comprobar('las etiquetas nuevas pasan al listado general (filtro y autocompletado)',
        etiquetasGuardadas.some(function (etiqueta) { return etiqueta.nombre === etiquetaNueva; }));

    const filtroNuevo = await anonimo.get('/recetas?etiqueta=' + encodeURIComponent(etiquetaNueva));
    comprobar('la receta aparece al filtrar por su etiqueta nueva',
        filtroNuevo.texto.includes('Receta de prueba'));

    const conEtiqueta = await anonimo.get('/receta/' + id);
    comprobar('en el detalle cada etiqueta enlaza a su filtro',
        conEtiqueta.texto.includes('/recetas?etiqueta='));

    // ------------------------------------------------------------------
    // Renderizado
    // ------------------------------------------------------------------
    const aviso = await anonimo.get('/?mensaje=Receta+creada&tipoMensaje=alert-warning');
    comprobar('los avisos se pintan con la clase pedida', aviso.texto.includes('alert alert-warning'));

    const claseIlegal = await anonimo.get('/?mensaje=hola&tipoMensaje=%22+onmouseover%3Dx');
    comprobar('un tipoMensaje fuera de la lista blanca se descarta', claseIlegal.texto.includes('alert alert-info'));

    const xss = await anonimo.get('/?mensaje=%3Cscript%3Ealert(1)%3C%2Fscript%3E');
    comprobar('el mensaje se escapa (sin XSS)', !xss.texto.includes('<script>'));

    const pagina404 = await anonimo.get('/noexiste');
    comprobar('una pagina inexistente responde 404', pagina404.status === 404);

    const privado = await anonimo.get('/privado/algo');
    comprobar('lo que cuelga de /privado sigue protegido', privado.status === 302);

    // ------------------------------------------------------------------
    // Limpieza de los datos creados por esta prueba
    // ------------------------------------------------------------------
    await gestorDB.eliminarReceta({ titulo: 'Receta de prueba' });
    await gestorDB.eliminarReceta({ titulo: 'No deberia guardarse' });
    await gestorDB.eliminarReceta({ titulo: 'Receta sin titulo' });
    await gestorDB.borrarEtiqueta(etiquetaNueva);
    await gestorDB.borrarEtiqueta('receta de prueba');
    await gestorDB.borrarUsuario({ username: usuario });
    await gestorDB.close();

    console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
    process.exit(fallos ? 1 : 0);
}

main().catch(function (err) {
    console.error('ERROR', err);
    process.exit(1);
});
