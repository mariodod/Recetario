/**
 * Prueba rapida de todas las rutas. Requiere el servidor levantado:
 *
 *   npm test
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
require('dotenv').config();

//Puerto propio y saltable:  la prueba arranca su propio servidor (abajo) y
//asi un reinicio del npm run dev de desarrollo no la puede cortar. El puerto
//cambia en cada corrida para no chocar con ningun servidor huérfano.
const PUERTO_PRUEBAS = 8090 + (Date.now() % 90);
const BASE = 'http://localhost:' + PUERTO_PRUEBAS;
const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/recetario';
const gestorDB = require('../modules/gestorDB.js');
const { MongoClient } = require('mongodb');
const { extraerFiltros, consultaDeFiltros } = require('../modules/filtros.js');
const { CARPETA, borrarFotos, borrarAvatar, CARPETA_AVATARES } = require('../modules/fotos.js');
const sharp = require('sharp');
const { migrar } = require('../scripts/seed.js');
const { lunesDe, diasDeSemana, sumarDias } = require('../modules/semana.js');
const { extraerReceta, minutosDe } = require('../modules/importar.js');
const http = require('node:http');

//PNG de 1x1 valido, para las pruebas de subida de fotos
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
);

let fallos = 0;
let comprobaciones = 0;

function comprobar(nombre, condicion, detalle) {
    comprobaciones++;
    if (!condicion) fallos++;
    console.log(`${condicion ? 'OK  ' : 'FAIL'} ${nombre}${condicion || !detalle ? '' : '  -> ' + detalle}`);
}

/**
 * Dice si la casilla con esa clave (value=...) sale marcada en el html de la
 * lista de la compra.
 */
function casillaMarcada(html, clave) {
    const inicio = html.indexOf('value="' + clave + '"');
    if (inicio < 0) return false;
    const fin = html.indexOf('/>', inicio);
    return html.slice(inicio, fin < 0 ? inicio + 300 : fin).includes('checked');
}

/**
 * La sesion guardada en MongoDB es un texto JSON:  aqui se devuelve ya
 * parseada (o null si no viniera en formato).
 */
function sesionDe(guardada) {
    try {
        return typeof guardada.session === 'string' ? JSON.parse(guardada.session) : guardada.session;
    } catch (e) {
        return null;
    }
}

/**
 * Cada flujo tiene su propio navegador, con su cookie de sesion. El token
 * CSRF llega en una cookie espejo: se cose de cada respuesta y se adjunta
 * solo a los POST, igual que hace un formulario de verdad.
 */
function crearNavegador() {
    let cookie = null;
    let csrf = null;

    async function peticion(ruta, opciones = {}) {
        const esPost = (opciones.method || 'GET') === 'POST';

        //Un POST sin token conocido no puede pasar:  se coge uno antes con
        //una petición GET, que es lo que haria cualquier navegador
        if (esPost && !csrf) {
            await peticion('/');
        }

        const headers = Object.assign({}, opciones.headers);
        if (cookie) headers.Cookie = cookie;

        let body;
        if (opciones.formData) {
            opciones.formData.append('_csrf', csrf || '');
            body = opciones.formData;
        } else if (esPost) {
            //El cuerpo puede venir como objeto o como URLSearchParams (para
            //repetir claves como marcado=... y paso=...):  se conserva tal
            //cual y solo se le engancha el token
            const campos = opciones.body instanceof URLSearchParams
                ? new URLSearchParams(opciones.body)
                : new URLSearchParams(opciones.body || {});
            campos.set('_csrf', csrf || '');
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            body = campos.toString();
        } else if (opciones.body) {
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            body = new URLSearchParams(opciones.body).toString();
        }

        const res = await fetch(BASE + ruta, {
            method: opciones.method || 'GET',
            headers: headers,
            body: body,
            redirect: 'manual'
        });

        //Cookies del servidor:  la de sesion y la espejo del token CSRF
        for (const cabecera of res.headers.getSetCookie()) {
            const par = cabecera.split(';')[0];
            if (par.startsWith('csrf=')) {
                csrf = par.slice('csrf='.length);
            } else {
                cookie = par;
            }
        }

        return { status: res.status, texto: await res.text(), cabeceras: res.headers };
    }

    return {
        get: function (ruta, opciones) { return peticion(ruta, opciones); },
        post: function (ruta, body, opciones) {
            return peticion(ruta, Object.assign({ method: 'POST', body: body }, opciones));
        },
        subir: function (ruta, formData, opciones) {
            return peticion(ruta, Object.assign({ method: 'POST', formData: formData }, opciones));
        },
        //Para las pruebas de seguridad, que necesitan los valores crudos
        credenciales: function () { return { cookie: cookie, csrf: csrf }; }
    };
}

function formulario(titulo) {
    return {
        titulo: titulo,
        tiempo: '25',
        dificultad: 'facil',
        momento: 'cena',
        ingredientes: 'Huevo\nSal\nPimienta',
        preparacion: 'Bate los huevos.\nCuaja a fuego suave durante cinco minutos.',
        etiquetas: 'vegetariano'
    };
}

//El servidor de las pruebas es hijo de este script, en un puerto propio
let servidorDePruebas = null;

async function main() {
    servidorDePruebas = spawn(process.execPath, [path.join(__dirname, '..', 'app.js')], {
        env: Object.assign({}, process.env, {
            PORT: String(PUERTO_PRUEBAS),
            //El importador prueba contra un servidor local:  en produccion
            //esta variable se queda sin definir y solo se acepta Internet
            IMPORTAR_PERMITE_LOCAL: 'si'
        }),
        stdio: ['ignore',
            fs.openSync(process.env.LOG_SERVIDOR || 'C:/Users/mario/AppData/Local/Temp/opencode/servidor.log', 'a'),
            fs.openSync(process.env.LOG_SERVIDOR || 'C:/Users/mario/AppData/Local/Temp/opencode/servidor.log', 'a')]    });

    //Se espera a que responda antes de empezar (arranque frio, con la base)
    let listo = false;
    for (let intento = 0; intento < 80 && !listo; intento++) {
        try {
            await fetch(BASE + '/');
            listo = true;
        } catch (e) {
            await new Promise(function (resolve) { setTimeout(resolve, 250); });
        }
    }
    if (!listo) {
        throw new Error('No ha arrancado el servidor de pruebas en el puerto ' + PUERTO_PRUEBAS);
    }

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
    // Busqueda textual
    // ------------------------------------------------------------------
    const buscado = await anonimo.get('/recetas?q=curry');
    comprobar('la busqueda textual encuentra recetas por el titulo',
        buscado.texto.includes('Pollo al curry'));
    comprobar('la busqueda se puede hacer desde la barra de navegacion',
        buscado.texto.includes('placeholder="Buscar recetas"')
        && buscado.texto.includes('value="curry"'));

    const porPreparacion = await anonimo.get('/recetas?q=tritura');
    comprobar('la busqueda textual busca tambien dentro de la preparacion',
        porPreparacion.texto.includes('Crema de calabaza'));

    const combinada = await anonimo.get('/recetas?q=pollo&dificultad=facil');
    comprobar('la busqueda se combina con el resto de filtros',
        combinada.texto.includes('Ensalada César')       // contiene 'pollo' y es facil
        && !combinada.texto.includes('Pollo al curry')    // es 'media'
        && !combinada.texto.includes('Cocido madrileño'));// es 'dificil'

    const ordenRelevancia = await anonimo.get('/recetas?q=pollo');
    const primerResultado = (ordenRelevancia.texto.match(/<a href="\/receta\/[a-f0-9]{24}" class="me-1">([^<]+)</) || [])[1];
    comprobar('la busqueda ordena por relevancia, y el titulo pesa mas',
        primerResultado === 'Pollo al curry');

    comprobar('la busqueda se conserva al refinar los filtros y al paginar',
        ordenRelevancia.texto.includes('name="q" value="pollo"')
        && consultaDeFiltros(extraerFiltros({ q: 'pollo', dificultad: 'facil' })) === 'q=pollo&dificultad=facil&');

    const sinCoincidencias = await anonimo.get('/recetas?q=zzzznoexiste');
    comprobar('una busqueda sin resultados menciona el termino buscado',
        sinCoincidencias.texto.includes('Ninguna receta coincide con'));

    // ------------------------------------------------------------------
    // Detalle de receta (HTML, JSON, pasos y video)
    // ------------------------------------------------------------------
    gestorDB.init(DB_URI);
    await gestorDB.connect();

    //Las sesiones de pruebas anteriores se borran:  al final se comprueba
    //que las de esta acaban guardadas en MongoDB
    const clienteSesiones = new MongoClient(DB_URI);
    await clienteSesiones.connect();
    await clienteSesiones.db().collection('sessions').deleteMany({});

    const recetas = await gestorDB.obtenerRecetas({});
    const id = String(recetas[0]._id);

    const detalle = await anonimo.get('/receta/' + id);
    comprobar('el detalle de receta se renderiza como pagina',
        detalle.status === 200 && detalle.texto.includes('<h1>'));
    comprobar('el detalle numera los pasos de la preparacion',
        detalle.texto.includes('list-group-numbered') && detalle.texto.includes('Sofrie la carne picada'));

    const bloqueSugerencias = detalle.texto.split('También podría gustarte')[1] || '';
    comprobar('el detalle sugiere recetas que comparten etiqueta e ingrediente',
        bloqueSugerencias.includes('Croquetas de jamón'));
    comprobar('las sugerencias dejan fuera la propia receta',
        !bloqueSugerencias.includes('Lasaña de la abuela'));

    const comoJson = await anonimo.get('/receta/' + id, { headers: { Accept: 'application/json' } });
    const recetaJson = JSON.parse(comoJson.texto);
    comprobar('el detalle se puede pedir como JSON',
        comoJson.status === 200 && recetaJson._id === id && Array.isArray(recetaJson.preparacion));

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
    const formularioAlta = await sinSesion.get('/receta');
    comprobar('el formulario de receta pide identificarse', formularioAlta.status === 302);

    const guardadoSinSesion = await sinSesion.post('/receta', formulario('No deberia guardarse'));
    comprobar('no se puede guardar receta sin identificarse', guardadoSinSesion.status === 302);

    const edicionSinSesion = await sinSesion.get('/receta/' + id + '/editar');
    comprobar('no se puede editar receta sin identificarse', edicionSinSesion.status === 302);

    const usuario = 'prueba-' + Date.now();
    const usuario2 = 'prueba2-' + Date.now();
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

    const logout = await login.post('/logout', {});
    const trasLogout = await login.get('/');
    comprobar('el logout cierra la sesion',
        logout.status === 302 && trasLogout.texto.includes('Identifícate'));
    const logoutPorGet = await login.get('/logout');
    comprobar('el logout por GET ya no existe', logoutPorGet.status === 404);
    const detalleSinSesion = await anonimo.get('/receta/' + id);
    comprobar('sin sesion no aparecen los botones de editar',
        !detalleSinSesion.texto.includes('/editar'));

    // ------------------------------------------------------------------
    // Seguridad:  cabeceras, limite de intentos y token CSRF
    // ------------------------------------------------------------------
    const cabecerasSeguras = (await anonimo.get('/')).cabeceras;
    comprobar('las cabeceras de seguridad estan activas (helmet)',
        (cabecerasSeguras.get('content-security-policy') || '').startsWith("default-src 'self'")
        && !cabecerasSeguras.get('x-powered-by')
        && Boolean(cabecerasSeguras.get('referrer-policy')));

    const loginAbridor = await crearNavegador().post('/login', { username: 'mario', password: 'incorrecta' });
    comprobar('el login limita los intentos y anuncia las cabeceras',
        loginAbridor.status === 401
        && Boolean(loginAbridor.cabeceras.get('ratelimit')
            || loginAbridor.cabeceras.get('ratelimit-limit')));

    //Ni sin token ni con un token inventado:  la peticion no toca nada
    const sinToken = await fetch(BASE + '/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'momento=comida&numero=5'
    });
    comprobar('una peticion POST sin token CSRF se rechaza', sinToken.status === 403);

    const deRegistro = registro.credenciales();
    const tokenDeNadie = await fetch(BASE + '/menu', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cookie': deRegistro.cookie
        },
        body: 'momento=comida&numero=5&_csrf=token-de-nadie'
    });
    comprobar('un token CSRF falso tambien se rechaza', tokenDeNadie.status === 403);

    //Un cuerpo de formulario malformado ("usuario[algo]=x") llega como objeto:
    //la aplicacion lo tiene que rechazar con un aviso, no reventar
    const cuerpoRaro = new URLSearchParams('username[algo]=mario&password[otro]=secreto');
    const loginRaro = await crearNavegador().post('/login', cuerpoRaro);
    comprobar('un login con el cuerpo malformado se rechaza sin error de servidor',
        loginRaro.status === 400, 'estado ' + loginRaro.status);

    const registroRaro = new URLSearchParams(
        'username[algo]=nuevo' + Date.now() + '&password[otro]=secreto123&confirmacion[otro]=secreto123'
    );
    const altaRara = await crearNavegador().post('/signup', registroRaro);
    comprobar('un registro con el cuerpo malformado se rechaza sin error de servidor',
        altaRara.status === 400, 'estado ' + altaRara.status + ' ' + altaRara.texto.slice(0, 80));

    // ------------------------------------------------------------------
    // Alta de receta (con la sesion del registro)
    // ------------------------------------------------------------------
    const etiquetaNueva = 'etiqueta-de-prueba-' + Date.now();
    const formularioReceta = await registro.get('/receta');
    comprobar('el formulario de receta se abre identificado', formularioReceta.status === 200);
    comprobar('el formulario pide las etiquetas una por linea',
        /<textarea[^>]*name="etiquetas"/.test(formularioReceta.texto)
        && !formularioReceta.texto.includes('list="lista-etiquetas"'));
    comprobar('el formulario pide la preparacion y las fotos',
        formularioReceta.texto.includes('name="preparacion"') && formularioReceta.texto.includes('name="fotos"')
        && formularioReceta.texto.includes('multiple'));

    const recetaIncompleta = await registro.post('/receta', { titulo: '   ' });
    comprobar('una receta incompleta se rechaza con todos los errores', recetaIncompleta.status === 400
        && recetaIncompleta.texto.includes('El titulo es obligatorio')
        && recetaIncompleta.texto.includes('Cuenta como se prepara'));

    const sinPreparacion = await registro.post('/receta',
        Object.assign(formulario('Receta sin preparacion'), { preparacion: '' }));
    comprobar('una receta sin preparacion se rechaza',
        sinPreparacion.status === 400 && sinPreparacion.texto.includes('Cuenta como se prepara'));

    const videoMalo = await registro.post('/receta',
        Object.assign(formulario('Receta sin titulo'), { video: 'javascript:alert(1)' }));
    comprobar('un enlace de video que no es http se rechaza', videoMalo.status === 400);

    const creada = await registro.post('/receta', Object.assign(formulario('Receta de prueba'), {
        etiquetas: etiquetaNueva + '\nReceta de prueba, con coma',
        video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    }));
    const destino = creada.cabeceras.get('location') || '';
    comprobar('una receta valida se guarda y redirige a su detalle',
        creada.status === 302 && destino.startsWith('/receta/'));

    const idPrueba = destino.split('?')[0].split('/').pop();
    const guardada = await anonimo.get('/receta/' + idPrueba, { headers: { Accept: 'application/json' } });
    const recetaGuardada = JSON.parse(guardada.texto);
    comprobar('los ingredientes y los pasos se guardan como arrays',
        recetaGuardada.ingredientes.join('|') === 'huevo|sal|pimienta'
        && recetaGuardada.preparacion.length === 2
        && recetaGuardada.etiquetas.includes(etiquetaNueva));

    comprobar('una etiqueta puede llevar comas y se guarda entera',
        recetaGuardada.etiquetas.includes('receta de prueba, con coma')
        && recetaGuardada.etiquetas.length === 2);

    const edicionEtiquetas = await registro.get('/receta/' + idPrueba + '/editar');
    comprobar('la etiqueta con comas se vuelve a escribir entera en el formulario',
        edicionEtiquetas.texto.includes('receta de prueba, con coma'));

    const filtroComa = await anonimo.get('/recetas?etiqueta=' + encodeURIComponent('receta de prueba, con coma'));
    comprobar('se puede filtrar por una etiqueta con comas',
        filtroComa.texto.includes('Receta de prueba'));

    const conVideo = await anonimo.get('/receta/' + idPrueba);
    comprobar('el video de YouTube se incrusta en el detalle',
        conVideo.texto.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ'));
    comprobar('la receta guarda como autor a quien la crea', recetaGuardada.autor === usuario);
    const formEdicion = await registro.get('/receta/' + idPrueba + '/editar');
    comprobar('el formulario de edicion viene relleno con la receta', formEdicion.status === 200
        && formEdicion.texto.includes('value="Receta de prueba"')
        && formEdicion.texto.includes('Bate los huevos.\nCuaja a fuego suave')
        && formEdicion.texto.includes('huevo\nsal\npimienta')
        && formEdicion.texto.includes('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));

    // ------------------------------------------------------------------
    // Autoria:  solo el autor de una receta puede tocarla
    // ------------------------------------------------------------------
    const vistaAutor = await registro.get('/receta/' + idPrueba);
    comprobar('el autor de la receta si ve los botones de editar y borrar',
        vistaAutor.texto.includes('/editar') && vistaAutor.texto.includes('/borrar'));

    const mario = crearNavegador();
    await mario.post('/login', { username: 'mario', password: process.env.SEED_PASSWORD || 'recetario123' });

    const edicionAjena = await mario.get('/receta/' + idPrueba + '/editar');
    comprobar('otro usuario no puede abrir el formulario de edicion ajeno', edicionAjena.status === 302);

    const vistaAjena = await mario.get('/receta/' + idPrueba);
    comprobar('el detalle no ofrece editar ni borrar a quien no es el autor',
        !vistaAjena.texto.includes('/editar') && !vistaAjena.texto.includes('/borrar'));

    const borradoAjeno = await mario.post('/receta/' + idPrueba + '/borrar', null);
    const edicionPostAjena = await mario.post('/receta/' + idPrueba, formulario('Editada por un desconocido'));
    comprobar('tampoco se pueden enviar ediciones o borrados ajenos',
        borradoAjeno.status === 302 && edicionPostAjena.status === 302);

    const intacta = await anonimo.get('/receta/' + idPrueba, { headers: { Accept: 'application/json' } });
    comprobar('la receta ajena sigue intacta', JSON.parse(intacta.texto).titulo === 'Receta de prueba');

    //La semilla de ejemplo asigna sus recetas a mario
    const semilla = await mario.get('/receta/' + id + '/editar');
    comprobar('el autor de la receta de ejemplo puede editarla', semilla.status === 200);

    const detalleAjeno = await anonimo.get('/receta/' + id);
    comprobar('el detalle indica quien es el autor', detalleAjeno.texto.includes('Por mario'));

    // ------------------------------------------------------------------
    // Raciones, lista de la compra, favoritos y valoraciones
    // ------------------------------------------------------------------
    const creadaCantidades = await registro.post('/receta',
        Object.assign(formulario('Receta con cantidades'), {
            raciones: '2',
            ingredientes: '200 g de harina\n2 huevos\nsal'
        }));
    const idCantidades = (creadaCantidades.cabeceras.get('location') || '').split('?')[0].split('/').pop();

    const talCual = await anonimo.get('/receta/' + idCantidades);
    comprobar('la receta enseña sus raciones y sus cantidades originales',
        talCual.texto.includes('2 raciones') && talCual.texto.includes('200 g de harina')
        && talCual.texto.includes('?raciones=3'));

    const doble = await anonimo.get('/receta/' + idCantidades + '?raciones=4');
    comprobar('cambiar las raciones escala las cantidades',
        doble.texto.includes('400 g de harina') && doble.texto.includes('4 huevos'));
    comprobar('lo que no trae cantidad no se toca', doble.texto.includes('>sal</a>'));

    const racionesLocas = await anonimo.get('/receta/' + idCantidades + '?raciones=999');
    comprobar('un numero de raciones fuera de rango se ignora',
        racionesLocas.texto.includes('200 g de harina'));

    const creadaCantidadesExtra = await registro.post('/receta',
        Object.assign(formulario('Receta con cantidades extra'), {
            raciones: '2',
            ingredientes: '300 g de harina\n2 huevos\nsal'
        }));
    const idCantidadesExtra = (creadaCantidadesExtra.cabeceras.get('location') || '').split('?')[0].split('/').pop();

    const marcarEnListado = await anonimo.get('/recetas?titulo=Receta+con+cantidades');
    comprobar('el listado deja marcar recetas para la lista de la compra',
        marcarEnListado.texto.includes('action="/lista"') && marcarEnListado.texto.includes('name="recetas"'));

    const compra = await anonimo.get('/lista?recetas=' + idCantidades + ',' + idCantidadesExtra);
    comprobar('la lista de la compra suma lo que piden varias recetas',
        compra.texto.includes('500 g de harina') && compra.texto.includes('4 huevos'));
    comprobar('lo repetido va una sola vez',
        (compra.texto.match(/name="marcado"/g) || []).length === 3);
    comprobar('la lista enseña las recetas elegidas y deja quitar una',
        compra.texto.includes('Receta con cantidades extra')
        && compra.texto.includes('Quitar')
        && compra.texto.includes('?recetas=' + idCantidadesExtra));

    const listaVacia = await anonimo.get('/lista');
    comprobar('la lista vacia explica como se usa', listaVacia.texto.includes('No has elegido ninguna receta'));

    // ------------------------------------------------------------------
    // La lista se puede descargar en .txt y imprimir sin barra ni botones
    // ------------------------------------------------------------------
    const descarga = await anonimo.get('/lista?recetas=' + idCantidades + ',' + idCantidadesExtra + '&formato=txt');
    comprobar('la lista se descarga como archivo de texto',
        descarga.status === 200
        && descarga.cabeceras.get('content-type').includes('text/plain')
        && descarga.cabeceras.get('content-disposition').includes('attachment')
        && descarga.cabeceras.get('content-disposition').includes('lista-de-la-compra.txt')
        && !descarga.texto.includes('<html'));
    comprobar('el .txt trae las recetas y las cantidades sumadas',
        descarga.texto.includes('500 g de harina') && descarga.texto.includes('4 huevos')
        && descarga.texto.includes('Receta con cantidades'));
    comprobar('el .txt deja una casilla por ingrediente para marcarlo a mano',
        (descarga.texto.match(/\[ \]/g) || []).length === 3);

    const descargaVacia = await anonimo.get('/lista?formato=txt');
    comprobar('sin recetas no hay nada que descargar', descargaVacia.status === 302);

    comprobar('la pagina de la lista ofrece la descarga y la impresion',
        compra.texto.includes('formato=txt') && compra.texto.includes('Ctrl+P'));
    comprobar('las paginas traen estilos para imprimir sin barra ni botones',
        compra.texto.includes('@media print'));

    // ------------------------------------------------------------------
    // Las marcas de la lista de la compra se guardan en la sesion
    // ------------------------------------------------------------------
    const idsLista = idCantidades + ',' + idCantidadesExtra;
    const conCasillas = await anonimo.get('/lista?recetas=' + idsLista);
    const claves = Array.from(conCasillas.texto.matchAll(/name="marcado" value="([^"]+)"/g))
        .map(function (coincidencia) { return coincidencia[1]; });
    comprobar('la lista deja marcar cada ingrediente',
        claves.length === 3 && conCasillas.texto.includes('action="/lista/marcar"'));

    const marcarUna = new URLSearchParams();
    marcarUna.append('recetas', idsLista);
    marcarUna.append('marcado', claves[0]);
    const marcada = await anonimo.post('/lista/marcar', marcarUna);
    comprobar('guardar las marcas vuelve a la misma lista',
        marcada.status === 302
        && String(marcada.cabeceras.get('location')).includes('recetas=' + idsLista));

    const conMarcas = await anonimo.get('/lista?recetas=' + idsLista);
    comprobar('la marca guardada sale marcada al recargar',
        casillaMarcada(conMarcas.texto, claves[0])
        && (conMarcas.texto.match(/checked/g) || []).length === 1);

    const descargaMarcada = await anonimo.get('/lista?recetas=' + idsLista + '&formato=txt');
    comprobar('el .txt refleja las marcas de este navegador',
        (descargaMarcada.texto.match(/\[x\]/g) || []).length === 1
        && (descargaMarcada.texto.match(/\[ \]/g) || []).length === 2);

    const sinMarcas = new URLSearchParams();
    sinMarcas.append('recetas', idsLista);
    await anonimo.post('/lista/marcar', sinMarcas);
    const desmarcada = await anonimo.get('/lista?recetas=' + idsLista);
    comprobar('guardar sin marcas las quita', (desmarcada.texto.match(/checked/g) || []).length === 0);

    //La marca de otra lista no se pierde al guardar las de una
    const listaPimienta = await anonimo.get('/lista?recetas=' + idPrueba);
    const clavePimienta = Array.from(listaPimienta.texto.matchAll(/name="marcado" value="([^"]+)"/g))
        .map(function (coincidencia) { return coincidencia[1]; })
        .find(function (clave) { return clave.startsWith('pimienta'); }) || '';
    comprobar('la otra lista tiene su propio ingrediente', Boolean(clavePimienta));

    const marcarPimienta = new URLSearchParams();
    marcarPimienta.append('recetas', idPrueba);
    marcarPimienta.append('marcado', clavePimienta);
    await anonimo.post('/lista/marcar', marcarPimienta);

    const guardarOtraLista = new URLSearchParams();
    guardarOtraLista.append('recetas', idsLista);
    await anonimo.post('/lista/marcar', guardarOtraLista);

    const pimientaSigue = await anonimo.get('/lista?recetas=' + idPrueba);
    comprobar('al guardar una lista no se pierden las marcas de otras',
        casillaMarcada(pimientaSigue.texto, clavePimienta));

    const vaciado = await anonimo.post('/lista/vaciar', { recetas: idPrueba });
    comprobar('quitar todas las marcas vuelve a la lista', vaciado.status === 302);
    const sinMarcasNinguna = await anonimo.get('/lista?recetas=' + idPrueba);
    comprobar('tras quitarlas no queda ninguna marcada',
        (sinMarcasNinguna.texto.match(/checked/g) || []).length === 0);

    //Lo que no corresponde a ningun ingrediente de la lista no se guarda
    const basura = new URLSearchParams();
    basura.append('recetas', idsLista);
    basura.append('marcado', '../../etc/passwd');
    await anonimo.post('/lista/marcar', basura);
    const sinBasura = await anonimo.get('/lista?recetas=' + idsLista);
    comprobar('una marca ajena a la lista no se guarda ni se refleja',
        !sinBasura.texto.includes('etc/passwd')
        && (sinBasura.texto.match(/checked/g) || []).length === 0);

    // ------------------------------------------------------------------
    // Los pasos marcados de la preparacion se guardan en la sesion
    // ------------------------------------------------------------------
    const recetaPasos = await anonimo.get('/receta/' + idPrueba);
    comprobar('el detalle deja marcar cada paso de la preparacion',
        recetaPasos.texto.includes('action="/receta/' + idPrueba + '/pasos"')
        && (recetaPasos.texto.match(/name="paso"/g) || []).length === 2);
    comprobar('al entrar en la receta ningun paso esta marcado',
        (recetaPasos.texto.match(/checked/g) || []).length === 0);

    const dosPasos = new URLSearchParams();
    dosPasos.append('paso', '0');
    dosPasos.append('paso', '1');
    const guardados = await anonimo.post('/receta/' + idPrueba + '/pasos', dosPasos);
    comprobar('guardar los pasos vuelve a la receta',
        guardados.status === 302 && guardados.cabeceras.get('location') === '/receta/' + idPrueba);

    const conPasos = await anonimo.get('/receta/' + idPrueba);
    comprobar('los pasos guardados salen marcados y tachados',
        (conPasos.texto.match(/checked/g) || []).length === 2
        && (conPasos.texto.match(/text-decoration-line-through/g) || []).length === 2);

    const unSoloPaso = new URLSearchParams();
    unSoloPaso.append('paso', '1');
    await anonimo.post('/receta/' + idPrueba + '/pasos', unSoloPaso);
    const conUnPaso = await anonimo.get('/receta/' + idPrueba);
    comprobar('guardar solo un paso desmarca los demas',
        (conUnPaso.texto.match(/checked/g) || []).length === 1
        && casillaMarcada(conUnPaso.texto, '1'));

    const mezclaPasos = new URLSearchParams();
    mezclaPasos.append('paso', '99');
    mezclaPasos.append('paso', '0');
    await anonimo.post('/receta/' + idPrueba + '/pasos', mezclaPasos);
    const sinPasosDeMas = await anonimo.get('/receta/' + idPrueba);
    comprobar('un paso inexistente no se guarda ni estropea los demas',
        (sinPasosDeMas.texto.match(/checked/g) || []).length === 1
        && casillaMarcada(sinPasosDeMas.texto, '0') && !casillaMarcada(sinPasosDeMas.texto, '1'));

    const pasosInexistentes = await anonimo.post('/receta/id-invalido/pasos', { paso: '0' });
    comprobar('marcar pasos de una receta inexistente responde 404', pasosInexistentes.status === 404);

    const favoritoSinSesion = await anonimo.post('/receta/' + idCantidades + '/favorito', null);
    comprobar('guardar en favoritos exige identificarse', favoritoSinSesion.status === 302);

    await registro.post('/receta/' + idCantidades + '/favorito', null);
    const vistaFavorita = await registro.get('/receta/' + idCantidades);
    comprobar('el detalle cambia el boton de favorito al guardarlo',
        vistaFavorita.texto.includes('Quitar de favoritos'));

    const misRecetas = await registro.get('/mis-recetas');
    comprobar('mis recetas separa las guardadas de las creadas',
        misRecetas.status === 200
        && misRecetas.texto.includes('Creadas por mi (')
        && misRecetas.texto.includes('Guardadas (1)')
        && misRecetas.texto.includes('Receta con cantidades extra'));

    await registro.post('/receta/' + idCantidades + '/favorito', null);
    const misRecetasSinFavorito = await registro.get('/mis-recetas');
    comprobar('al quitarla deja de estar guardada', misRecetasSinFavorito.texto.includes('Guardadas (0)'));

    const valoracionSinSesion = await anonimo.post('/receta/' + idCantidades + '/valoracion', { estrellas: '5' });
    comprobar('valorar exige identificarse', valoracionSinSesion.status === 302);
    comprobar('quien no esta identificado lo ve dicho en el detalle',
        talCual.texto.includes('Identifícate para valorar'));

    const votada = await registro.post('/receta/' + idCantidades + '/valoracion', { estrellas: '5' });
    const vistaVotada = await registro.get('/receta/' + idCantidades);
    comprobar('la valoracion sale en el detalle con la media y el total',
        votada.status === 302 && vistaVotada.texto.includes('(1 valoraciones)')
        && vistaVotada.texto.includes('id="valorar-5" checked'));

    await registro.post('/receta/' + idCantidades + '/valoracion', { estrellas: '3' });
    const reVotada = await registro.get('/receta/' + idCantidades);
    comprobar('volver a valorar sustituye la anterior en vez de sumarla',
        reVotada.texto.includes('(1 valoraciones)') && reVotada.texto.includes('id="valorar-3" checked'));

    const valoracionMala = await registro.post('/receta/' + idCantidades + '/valoracion', { estrellas: '9' });
    const trasValoracionMala = await registro.get('/receta/' + idCantidades);
    comprobar('una valoracion fuera de rango no se guarda',
        valoracionMala.status === 302 && trasValoracionMala.texto.includes('id="valorar-3" checked'));

    const misRecetasSinSesion = await anonimo.get('/mis-recetas');
    comprobar('mis recetas tambien exige identificarse', misRecetasSinSesion.status === 302);

    const etiquetasGuardadas = await gestorDB.obtenerEtiquetas();
    comprobar('las etiquetas nuevas pasan al listado general (sirven para filtrar)',
        etiquetasGuardadas.some(function (etiqueta) { return etiqueta.nombre === etiquetaNueva; }));

    const filtroNuevo = await anonimo.get('/recetas?etiqueta=' + encodeURIComponent(etiquetaNueva));
    comprobar('la receta aparece al filtrar por su etiqueta nueva',
        filtroNuevo.texto.includes('Receta de prueba'));

    // ------------------------------------------------------------------
    // Comentarios en el detalle de la receta
    // ------------------------------------------------------------------
    const detalleSinComentar = await anonimo.get('/receta/' + idPrueba);
    comprobar('quien no esta identificado lo ve dicho en los comentarios',
        detalleSinComentar.texto.includes('Identifícate para comentar')
        && detalleSinComentar.texto.includes('Comentarios (0)'));

    const comentarSinSesion = await anonimo.post('/receta/' + idPrueba + '/comentarios', { texto: 'hola' });
    comprobar('comentar sin sesion redirige al login', comentarSinSesion.status === 302);

    const comentada = await registro.post('/receta/' + idPrueba + '/comentarios', {
        texto: 'Muy buena, con un poco de comino. <script>malito</script>'
    });
    const conUnComentario = await registro.get('/receta/' + idPrueba);
    comprobar('el comentario se guarda y sale en el detalle, escapado',
        comentada.status === 302
        && conUnComentario.texto.includes('Comentarios (1)')
        && conUnComentario.texto.includes('Muy buena, con un poco de comino.')
        && !conUnComentario.texto.includes('<script>malito</script>')
        && conUnComentario.texto.includes('&lt;script&gt;malito&lt;/script&gt;'));

    const comentarioVacio = await registro.post('/receta/' + idPrueba + '/comentarios', { texto: '   ' });
    const comentarioLargo = await registro.post('/receta/' + idPrueba + '/comentarios', { texto: 'x'.repeat(2001) });
    comprobar('el comentario vacio o demasiado largo no se guarda',
        String(comentarioVacio.cabeceras.get('location')).includes('Escribe+algo')
        && String(comentarioLargo.cabeceras.get('location')).includes('2000')
        && (await registro.get('/receta/' + idPrueba)).texto.includes('Comentarios (1)'));

    //Otro usuario comentando:  solo su autor o el de la receta pueden borrarlo
    const comentarOtro = crearNavegador();
    const otroUsuario = 'coment-' + Date.now();
    const altaOtro = await comentarOtro.post('/signup', {
        username: otroUsuario, password: 'clave-de-comentar-1', confirmacion: 'clave-de-comentar-1'
    });
    await comentarOtro.post('/receta/' + idPrueba + '/comentarios', { texto: 'Comentario de otro usuario' });
    //La pagina se mira desde la autora de la receta, que es quien ve los
    //dos botones de borrar:  el de lo suyo y el de lo ajeno, que puede
    //limpiar por ser suya.  Quien no puede borrar no ve boton de nada
    const conDosComentarios = await registro.get('/receta/' + idPrueba);
    comprobar('otro usuario puede comentar en la receta ajena',
        altaOtro.status === 302 && conDosComentarios.texto.includes('Comentarios (2)'));

    //Cada boton de borrar lleva el nombre de quien puede pulsarlo
    const botonesPorAutor = {};
    for (const coincidencia of conDosComentarios.texto.matchAll(
        /\/comentario\/([a-f0-9]{24})\/borrar"[\s\S]{0,300}?Borrar el comentario de ([^"]+)"/g)) {
        botonesPorAutor[coincidencia[2]] = coincidencia[1];
    }
    comprobar('cada comentario ofrece borrarlo a su autor y al de la receta',
        Boolean(botonesPorAutor[otroUsuario]) && Boolean(botonesPorAutor[usuario]));

    const borrarSinPermiso = await comentarOtro.post('/comentario/' + botonesPorAutor[usuario] + '/borrar', {});
    const sigueElDeLaAutora = await comentarOtro.get('/receta/' + idPrueba);
    comprobar('nadie mas puede borrar un comentario',
        String(borrarSinPermiso.cabeceras.get('location')).includes('No+puedes')
        && sigueElDeLaAutora.texto.includes('Comentarios (2)'));

    const borradoComentarioAjeno = await registro.post('/comentario/' + botonesPorAutor[otroUsuario] + '/borrar', {});
    const conUnoTrasBorrar = await registro.get('/receta/' + idPrueba);
    comprobar('el autor de la receta puede borrar comentarios ajenos',
        borradoComentarioAjeno.status === 302 && conUnoTrasBorrar.texto.includes('Comentarios (1)'));

    await comentarOtro.post('/receta/' + idPrueba + '/comentarios', { texto: 'Otra vez del otro' });
    const conElOtro = await comentarOtro.get('/receta/' + idPrueba);
    const idDelOtro = (conElOtro.texto.match(/\/comentario\/([a-f0-9]{24})\/borrar/) || [])[1];
    const borradoPropio = await comentarOtro.post('/comentario/' + idDelOtro + '/borrar', {});
    comprobar('cada cual puede borrar su propio comentario',
        borradoPropio.status === 302
        && (await comentarOtro.get('/receta/' + idPrueba)).texto.includes('Comentarios (1)'));

    //Borrar la receta se lleva sus comentarios
    const recetaConComentarios = new FormData();
    recetaConComentarios.append('titulo', 'Receta de prueba de comentarios');
    recetaConComentarios.append('tiempo', '10');
    recetaConComentarios.append('dificultad', 'facil');
    recetaConComentarios.append('momento', 'cena');
    recetaConComentarios.append('ingredientes', 'Sal');
    recetaConComentarios.append('preparacion', 'Se mezcla todo.');
    const creadaParaComentar = await registro.subir('/receta', recetaConComentarios);
    const idParaComentar = (creadaParaComentar.cabeceras.get('location') || '').split('?')[0].split('/').pop();
    await registro.post('/receta/' + idParaComentar + '/comentarios', { texto: 'Adios receta' });
    const borradaConComentarios = await registro.post('/receta/' + idParaComentar + '/borrar', {});
    const comentariosHuerfanos = await gestorDB.obtenerComentarios(idParaComentar);
    comprobar('borrar la receta se lleva sus comentarios',
        borradaConComentarios.status === 302 && comentariosHuerfanos.length === 0);

    // ------------------------------------------------------------------
    // Modo cocina:  pagina aparte, sin javascript, letra grande
    // ------------------------------------------------------------------
    const cocinaAnonima = await anonimo.get('/receta/' + idPrueba + '/cocina');
    comprobar('el modo cocina abre sin identificarse y sin barra ni javascript',
        cocinaAnonima.status === 200
        && cocinaAnonima.texto.includes('Cocinando: Receta de prueba')
        && !cocinaAnonima.texto.includes('<nav')
        && !cocinaAnonima.texto.includes('<script'));
    comprobar('el modo cocina pone letra grande, ingredientes y pasos numerados',
        cocinaAnonima.texto.includes('font-size: 1.7rem')
        && cocinaAnonima.texto.includes('Ingredientes')
        && cocinaAnonima.texto.includes('1. Bate los huevos.')
        && cocinaAnonima.texto.includes('2. Cuaja a fuego suave durante cinco minutos.'));

    //Marcar un paso desde el modo cocina vuelve a el y las marcas son las
    //mismas que en el detalle:  la sesion manda en los dos sitios
    const pasoDeCocina = new URLSearchParams();
    pasoDeCocina.append('paso', '1');
    pasoDeCocina.append('destino', 'cocina');
    const marcadoEnCocina = await anonimo.post('/receta/' + idPrueba + '/pasos', pasoDeCocina);
    const cocinaMarcada = await anonimo.get('/receta/' + idPrueba + '/cocina');
    comprobar('marcar un paso en el modo cocina vuelve a el y queda marcado',
        marcadoEnCocina.status === 302
        && String(marcadoEnCocina.cabeceras.get('location')) === '/receta/' + idPrueba + '/cocina'
        && (cocinaMarcada.texto.match(/checked/g) || []).length === 1
        && cocinaMarcada.texto.includes('id="paso-1" checked')
        && cocinaMarcada.texto.includes('paso-hecho'));

    //El destino del formulario solo admite 'cocina':  cualquiera otro
    //vuelve al detalle, para no acabar en enlaces de otros sitios
    const destinoLibre = new URLSearchParams();
    destinoLibre.append('paso', '0');
    destinoLibre.append('destino', 'https://ejemplo.com');
    const conDestinoRaro = await anonimo.post('/receta/' + idPrueba + '/pasos', destinoLibre);
    const detalleCompartido = await anonimo.get('/receta/' + idPrueba);
    comprobar('el destino del formulario de pasos solo admite el modo cocina',
        String(conDestinoRaro.cabeceras.get('location')) === '/receta/' + idPrueba
        && (detalleCompartido.texto.match(/checked/g) || []).length === 1
        && detalleCompartido.texto.includes('id="paso-0" checked'));
    comprobar('el detalle ofrece entrar al modo cocina',
        detalleCompartido.texto.includes('Modo cocina')
        && detalleCompartido.texto.includes('/cocina'));

    const cocinaInexistente = await anonimo.get('/receta/id-invalido/cocina');
    comprobar('el modo cocina de una receta inexistente responde 404',
        cocinaInexistente.status === 404);

    // ------------------------------------------------------------------
    // Edicion y borrado
    // ------------------------------------------------------------------
    const editado = await registro.post('/receta/' + idPrueba, Object.assign(formulario('Receta de prueba (editada)'), {
        preparacion: 'Unico paso: se sirve.',
        video: 'https://vimeo.com/76979871'
    }));
    comprobar('una receta se puede actualizar', editado.status === 302);

    const trasEdicion = await anonimo.get('/receta/' + idPrueba, { headers: { Accept: 'application/json' } });
    const recetaEditada = JSON.parse(trasEdicion.texto);
    comprobar('los cambios se guardan en la base de datos',
        recetaEditada.titulo === 'Receta de prueba (editada)'
        && recetaEditada.preparacion.join('|') === 'Unico paso: se sirve.');

    const conVimeo = await anonimo.get('/receta/' + idPrueba);
    comprobar('el video de Vimeo se incrusta en el detalle',
        conVimeo.texto.includes('player.vimeo.com/video/76979871'));

    // ------------------------------------------------------------------
    // Autoria:  ceder la receta y filtrar por autor
    // ------------------------------------------------------------------
    const segunda = crearNavegador();
    const segundaCuenta = await segunda.post('/signup', {
        username: usuario2, password: password, confirmacion: password
    });
    comprobar('el segundo usuario se registra', segundaCuenta.status === 302);

    const altaSinCesion = await registro.get('/receta');
    comprobar('el formulario de alta no deja ceder la autoría',
        !altaSinCesion.texto.includes('name="autor"'));

    const edicionPropia = await registro.get('/receta/' + idPrueba + '/editar');
    comprobar('el formulario de edicion lista a quien se le puede ceder',
        edicionPropia.texto.includes('name="autor"')
        && edicionPropia.texto.includes('value="' + usuario2 + '"')
        && !edicionPropia.texto.includes('value="' + usuario + '"'));

    const sigueSuya = JSON.parse((await registro.get('/receta/' + idPrueba, {
        headers: { Accept: 'application/json' }
    })).texto);
    comprobar('editar sin decir nada no cambia el autor', sigueSuya.autor === usuario);

    const cederAInexistente = await registro.post('/receta/' + idPrueba,
        Object.assign(formulario('Receta de prueba (editada)'), { autor: 'nadie-tiene-esa-cuenta' }));
    comprobar('no se puede ceder la receta a un usuario que no existe',
        cederAInexistente.status === 400
        && cederAInexistente.texto.includes('No hay ninguna cuenta con el usuario')
        && cederAInexistente.texto.includes('nadie-tiene-esa-cuenta')
        && cederAInexistente.texto.includes('name="autor"'));

    const trasFallo = JSON.parse((await registro.get('/receta/' + idPrueba, {
        headers: { Accept: 'application/json' }
    })).texto);
    comprobar('si la cesion falla la receta sigue siendo del autor', trasFallo.autor === usuario);

    const cedida = await registro.post('/receta/' + idPrueba,
        Object.assign(formulario('Receta de prueba (editada)'), { autor: usuario2 }));
    const destinoCesion = cedida.cabeceras.get('location') || '';
    comprobar('la receta se puede ceder a otro usuario',
        cedida.status === 302 && destinoCesion.includes('Receta+cedida+a+')
        && JSON.parse((await anonimo.get('/receta/' + idPrueba, {
            headers: { Accept: 'application/json' }
        })).texto).autor === usuario2);

    const detalleCedido = await anonimo.get('/receta/' + idPrueba);
    comprobar('el detalle pinta al nuevo autor y enlaza a sus recetas',
        detalleCedido.texto.includes('Por ' + usuario2)
        && detalleCedido.texto.includes('/recetas?autor=' + usuario2));

    const edicionDelNuevo = await segunda.get('/receta/' + idPrueba + '/editar');
    comprobar('el nuevo autor ya puede editarla',
        edicionDelNuevo.status === 200 && edicionDelNuevo.texto.includes('siga siendo de ' + usuario2));

    const edicionDelAntiguo = await registro.get('/receta/' + idPrueba + '/editar');
    const borradoDelAntiguo = await registro.post('/receta/' + idPrueba + '/borrar', null);
    comprobar('el autor anterior ya no puede editarla ni borrarla',
        edicionDelAntiguo.status === 302 && borradoDelAntiguo.status === 302
        && (await anonimo.get('/receta/' + idPrueba)).status === 200);

    const listadoDelNuevo = await anonimo.get('/recetas?autor=' + usuario2);
    comprobar('el listado se puede filtrar por autor',
        listadoDelNuevo.texto.includes('Receta de prueba (editada)')
        && listadoDelNuevo.texto.includes('value="' + usuario2 + '"')
        && !listadoDelNuevo.texto.includes('Receta con cantidades'));

    const listadoDelAntiguo = await anonimo.get('/recetas?autor=' + usuario);
    comprobar('el filtro por autor deja fuera las recetas de los demas',
        !listadoDelAntiguo.texto.includes('Receta de prueba (editada)')
        && listadoDelAntiguo.texto.includes('Receta con cantidades'));

    const listadoSinAutores = await anonimo.get('/recetas?autor=nadie');
    comprobar('filtrar por un autor sin recetas sale vacio',
        listadoSinAutores.texto.includes('Ninguna receta cumple los filtros actuales'));

    // ------------------------------------------------------------------
    // Fotos
    // ------------------------------------------------------------------
    const subida = new FormData();
    subida.append('titulo', 'Receta con foto');
    subida.append('tiempo', '15');
    subida.append('dificultad', 'facil');
    subida.append('momento', 'cena');
    subida.append('ingredientes', 'Huevo');
    subida.append('preparacion', 'Se hace en un minuto.');
    subida.append('fotos', new Blob([PNG], { type: 'image/png' }), 'foto1.png');
    subida.append('fotos', new Blob([PNG], { type: 'image/png' }), 'foto2.png');

    const conFoto = await registro.subir('/receta', subida);
    const destinoFoto = conFoto.cabeceras.get('location') || '';
    comprobar('una receta con varias fotos se guarda',
        conFoto.status === 302 && destinoFoto.startsWith('/receta/'));

    const idConFoto = destinoFoto.split('?')[0].split('/').pop();
    const jsonConFoto = await anonimo.get('/receta/' + idConFoto, { headers: { Accept: 'application/json' } });
    const guardadas = JSON.parse(jsonConFoto.texto).fotos || [];
    comprobar('las dos fotos se guardan en la base de datos', guardadas.length === 2);

    const detalleConFoto = await anonimo.get('/receta/' + idConFoto);
    comprobar('las fotos se guardan en disco y salen en el detalle',
        guardadas.every(function (foto) { return fs.existsSync(path.join(CARPETA, foto)); })
        && guardadas.every(function (foto) { return detalleConFoto.texto.includes('/fotos/' + foto); }));

    const listadoConFoto = await anonimo.get('/recetas?titulo=Receta+con+foto');
    comprobar('la miniatura de la primera foto sale en el listado',
        listadoConFoto.texto.includes('/fotos/' + guardadas[0]));

    const quitarPrimera = await registro.post('/receta/' + idConFoto,
        Object.assign(formulario('Receta con foto'), { quitarFoto: guardadas[0] }));
    const trasQuitar = JSON.parse((await anonimo.get('/receta/' + idConFoto, {
        headers: { Accept: 'application/json' }
    })).texto).fotos;
    comprobar('marcar una foto para quitarla la saca de la receta',
        quitarPrimera.status === 302 && trasQuitar.join() === guardadas[1]);
    comprobar('y la borra del disco sin tocar a la otra',
        !fs.existsSync(path.join(CARPETA, guardadas[0]))
        && fs.existsSync(path.join(CARPETA, guardadas[1])));

    const travesia = await registro.post('/receta/' + idConFoto,
        Object.assign(formulario('Receta con foto'), { quitarFoto: '../../app.js' }));
    comprobar('solo se pueden quitar fotos que sean de la receta',
        travesia.status === 302 && fs.existsSync(path.join(CARPETA, guardadas[1]))
        && fs.existsSync(path.join(__dirname, '..', 'app.js')));

    //Cinco fotos caben, pero una mas ya no
    const subidaLlena = new FormData();
    subidaLlena.append('titulo', 'Receta con foto');
    subidaLlena.append('tiempo', '15');
    subidaLlena.append('dificultad', 'facil');
    subidaLlena.append('momento', 'cena');
    subidaLlena.append('ingredientes', 'Huevo');
    subidaLlena.append('preparacion', 'Se hace en un minuto.');
    for (let i = 0; i < 5; i++) {
        subidaLlena.append('fotos', new Blob([PNG], { type: 'image/png' }), 'foto-' + i + '.png');
    }
    const llena = await registro.subir('/receta', subidaLlena);
    const idLlena = (llena.cabeceras.get('location') || '').split('?')[0].split('/').pop();
    comprobar('una receta puede guardar varias fotos', llena.status === 302);

    const ficherosAntes = fs.readdirSync(CARPETA).length;
    const desbordada = new FormData();
    desbordada.append('titulo', 'Receta con foto');
    desbordada.append('tiempo', '15');
    desbordada.append('dificultad', 'facil');
    desbordada.append('momento', 'cena');
    desbordada.append('ingredientes', 'Huevo');
    desbordada.append('preparacion', 'Se hace en un minuto.');
    desbordada.append('fotos', new Blob([PNG], { type: 'image/png' }), 'una-mas.png');
    desbordada.append('fotos', new Blob([PNG], { type: 'image/png' }), 'otra-mas.png');
    const demasiado = await registro.subir('/receta/' + idLlena, desbordada);
    comprobar('una receta no puede pasarse del limite de fotos',
        demasiado.status === 400 && demasiado.texto.includes('maximo 6 fotos'));
    comprobar('las fotos que sobran no se quedan en disco',
        fs.readdirSync(CARPETA).length === ficherosAntes);

    const subidaMala = new FormData();
    subidaMala.append('titulo', 'Receta con archivo raro');
    subidaMala.append('preparacion', 'No importa.');
    subidaMala.append('fotos', new Blob([Buffer.from('no soy una imagen')], { type: 'text/plain' }), 'nota.txt');
    const archivoMalo = await registro.subir('/receta', subidaMala);
    comprobar('solo se aceptan imagenes', archivoMalo.status === 400
        && archivoMalo.texto.includes('JPEG, PNG, WEBP o GIF'));

    //Una foto que pesa mas de lo permitido:  multer corta el multipart por
    //lo alto y el token CSRF (que va en un campo de texto) se queda sin
    //leer.  La peticion tiene que salir con el aviso del peso, no con un
    //rechazo incomprensible del token
    const subidaPesada = new FormData();
    subidaPesada.append('titulo', 'Receta con foto pesadilla');
    subidaPesada.append('preparacion', 'No importa.');
    subidaPesada.append('fotos',
        new Blob([Buffer.alloc(5 * 1024 * 1024 + 4096)], { type: 'image/jpeg' }), 'enorme.jpg');
    const fotoPesada = await registro.subir('/receta', subidaPesada);
    comprobar('una foto que pesa demasiado se rechaza con su aviso',
        fotoPesada.status === 400 && fotoPesada.texto.includes('5 MB'));
    comprobar('despues de una subida rechazada se puede seguir usando la sesion',
        (await registro.get('/receta')).status === 200);

    // ------------------------------------------------------------------
    // Las fotos se reducen al subirlas y se les quita el EXIF
    // ------------------------------------------------------------------
    const fotoGrande = await sharp({
        create: { width: 2400, height: 1800, channels: 3, background: '#a33' }
    }).jpeg().toBuffer();
    const fotoConExif = await sharp({
        create: { width: 300, height: 200, channels: 3, background: '#3a3' }
    }).jpeg().withMetadata({ exif: { IFD0: { Copyright: 'ReceMario' } } }).toBuffer();
    const gifPequeno = await sharp({
        create: { width: 40, height: 30, channels: 3, background: '#33a' }
    }).gif().toBuffer();

    const subidaReducida = new FormData();
    subidaReducida.append('titulo', 'Receta con foto grande');
    subidaReducida.append('tiempo', '15');
    subidaReducida.append('dificultad', 'facil');
    subidaReducida.append('momento', 'cena');
    subidaReducida.append('ingredientes', 'Huevo');
    subidaReducida.append('preparacion', 'Se hace en un minuto.');
    subidaReducida.append('fotos', new Blob([fotoGrande], { type: 'image/jpeg' }), 'grande.jpg');
    subidaReducida.append('fotos', new Blob([fotoConExif], { type: 'image/jpeg' }), 'exif.jpg');
    subidaReducida.append('fotos', new Blob([gifPequeno], { type: 'image/gif' }), 'animado.gif');
    const creadaReducida = await registro.subir('/receta', subidaReducida);
    const idReducida = (creadaReducida.cabeceras.get('location') || '').split('?')[0].split('/').pop();
    const detalleReducida = await registro.get('/receta/' + idReducida);
    //Solo la galeria propia:  lo de "También podría gustarte" trae miniaturas
    //y cada foto aparece dos veces (enlace e imagen)
    const galeria = detalleReducida.texto.split('También podría gustarte')[0];
    const nombresGrandes = Array.from(new Set(
        Array.from(galeria.matchAll(/\/fotos\/([a-f0-9]+\.jpg)/g))
            .map(function (coincidencia) { return coincidencia[1]; })
    ));
    const nombreGif = (galeria.match(/\/fotos\/([a-f0-9]+\.gif)/) || [])[1];

    const metadatosFotos = await Promise.all(nombresGrandes.map(function (nombre) {
        return sharp(path.join(CARPETA, nombre)).metadata();
    }));
    comprobar('la foto gigante se reduce al subirla',
        creadaReducida.status === 302
        && nombresGrandes.length === 2
        && metadatosFotos[0].width <= 1600 && metadatosFotos[0].height <= 1600,
        JSON.stringify(metadatosFotos.map(function (m) { return [m.width, m.height]; })));
    comprobar('a las fotos se les quita la informacion EXIF',
        Boolean(metadatosFotos[1]) && metadatosFotos[1].exif === undefined);

    const gifGuardado = nombreGif
        ? await sharp(path.join(CARPETA, nombreGif)).metadata()
        : null;
    comprobar('el GIF se queda como viene, para no perder la animacion',
        Boolean(gifGuardado) && gifGuardado.format === 'gif' && gifGuardado.width === 40);

    //Un fichero que dice ser un GIF pero no lo es:  el navegador dice el
    //tipo, pero el contenido es el que manda
    const gifsAntes = fs.readdirSync(CARPETA).filter(function (nombre) {
        return nombre.endsWith('.gif');
    }).length;
    const subidaFalsa = new FormData();
    subidaFalsa.append('titulo', 'Receta con un gif falso');
    subidaFalsa.append('tiempo', '15');
    subidaFalsa.append('dificultad', 'facil');
    subidaFalsa.append('momento', 'cena');
    subidaFalsa.append('ingredientes', 'Huevo');
    subidaFalsa.append('preparacion', 'Se hace en un minuto.');
    subidaFalsa.append('fotos', new Blob([PNG], { type: 'image/gif' }), 'falso.gif');
    const conGifFalso = await registro.subir('/receta', subidaFalsa);
    const gifsDespues = fs.readdirSync(CARPETA).filter(function (nombre) {
        return nombre.endsWith('.gif');
    }).length;
    comprobar('un fichero que no es un GIF no se guarda como foto',
        conGifFalso.status === 400 && conGifFalso.texto.includes('imagen valida'));
    comprobar('el gif falso no se queda en el disco', gifsDespues === gifsAntes);

    const borrada = await registro.post('/receta/' + idConFoto + '/borrar', null);
    comprobar('una receta se puede borrar', borrada.status === 302);
    comprobar('al borrar la receta desaparecen sus fotos del disco',
        !fs.existsSync(path.join(CARPETA, guardadas[1])));
    comprobar('la receta borrada ya no se puede ver',
        (await anonimo.get('/receta/' + idConFoto)).status === 404);

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

    //Las rutas de ejemplo del tutorial original ya no estan
    const ejemplos = await anonimo.get('/promo/loquesea');
    const usuarios = await anonimo.get('/usuarios');
    comprobar('las rutas de ejemplo del tutorial ya no existen',
        ejemplos.status === 404 && usuarios.status === 404);

    // ------------------------------------------------------------------
    // Cantidades raras:  fracciones, rangos, palabras de numero y "al gusto"
    // ------------------------------------------------------------------
    const creadaRaras = await registro.post('/receta',
        Object.assign(formulario('Receta con cantidades raras'), {
            raciones: '2',
            ingredientes: '1/2 taza de harina\n2-3 cucharadas de azucar\n'
                + 'un puñado de nueces\nmedia cucharada de sal\nal gusto'
        }));
    const idRaras = (creadaRaras.cabeceras.get('location') || '').split('?')[0].split('/').pop();

    const rarasEscaladas = await anonimo.get('/receta/' + idRaras + '?raciones=4');
    comprobar('las fracciones y los rangos se escalan con las raciones',
        rarasEscaladas.texto.includes('1 taza de harina')
        && rarasEscaladas.texto.includes('4-6 cucharadas de azucar'));
    comprobar('lo que no trae cantidad se queda tal cual',
        rarasEscaladas.texto.includes('al gusto')
        && !rarasEscaladas.texto.includes('1 al gusto'));

    const listaRaras = await anonimo.get('/lista?recetas=' + idRaras);
    comprobar('en la lista se suman "un puñado" y "media cucharada"',
        listaRaras.texto.includes('1 puñado de nueces')
        && listaRaras.texto.includes('0.5 cucharada de sal')
        && listaRaras.texto.includes('0.5 taza de harina'));
    comprobar('el rango no se suma y va con el nombre limpio',
        listaRaras.texto.includes('>azucar</label>')
        && !listaRaras.texto.includes('de azucar'));

    // ------------------------------------------------------------------
    // El seed reparte tambien las recetas con autor vacio o nulo
    // ------------------------------------------------------------------
    const recetaHuerfana = {
        titulo: 'Receta de prueba sin autor',
        ingredientes: ['sal'],
        preparacion: ['Mezcla todo.'],
        momento: 'cena',
        etiquetas: [],
        fotos: [],
        creadaEn: new Date()
    };
    //Se montan las dos antes de insertar:  el driver le pone _id al objeto
    //que se le da, y no vale copiarlo despues
    const recetaAutorNulo = Object.assign({}, recetaHuerfana, {
        titulo: 'Receta de prueba con autor nulo',
        autor: null
    });
    const idSinAutor = String(await gestorDB.insertarReceta(recetaHuerfana));
    const idAutorNulo = String(await gestorDB.insertarReceta(recetaAutorNulo));

    await migrar();

    const arreglada = await gestorDB.obtenerRecetaPorId(idSinAutor);
    const arregladaNula = await gestorDB.obtenerRecetaPorId(idAutorNulo);
    comprobar('el seed asigna autor a las recetas que no lo tengan',
        arreglada.autor === 'mario' && arregladaNula.autor === 'mario');

    // ------------------------------------------------------------------
    // Perfil de usuario y edicion (y borrado) de la cuenta
    // ------------------------------------------------------------------
    const perfilPropio = await registro.get('/usuario/' + usuario);
    comprobar('el propio perfil se abre con el boton de editar',
        perfilPropio.status === 200 && perfilPropio.texto.includes('Editar perfil y cuenta'));

    const perfilAjeno = await anonimo.get('/usuario/' + usuario);
    comprobar('el perfil ajeno no ofrece editar la cuenta',
        perfilAjeno.status === 200 && !perfilAjeno.texto.includes('Editar perfil y cuenta'));

    const perfilInexistente = await anonimo.get('/usuario/usuario-que-no-existe');
    comprobar('un perfil que no existe responde 404', perfilInexistente.status === 404);

    //Cuenta de prueba propia:  se edita y se borra sin tocar a las demas
    const conCuenta = crearNavegador();
    const passwordCuenta = 'clave-de-la-cuenta-1';
    const cuentaPropia = 'cuenta-' + Date.now();
    const altaCuenta = await conCuenta.post('/signup', {
        username: cuentaPropia, password: passwordCuenta, confirmacion: passwordCuenta
    });
    comprobar('la cuenta de prueba se crea con sesion iniciada', altaCuenta.status === 302);

    const bioGuardada = 'Cocino poco pero me encanta la reposteria.';
    const guardarBio = await conCuenta.post('/cuenta', { bio: bioGuardada });
    comprobar('la descripcion de la cuenta se guarda', guardarBio.status === 302);

    const perfilConBio = await conCuenta.get('/usuario/' + cuentaPropia);
    comprobar('la descripcion sale en el perfil', perfilConBio.texto.includes(bioGuardada));

    const bioLarga = await conCuenta.post('/cuenta', { bio: 'x'.repeat(501) });
    comprobar('la descripcion que pasa del limite se rechaza', bioLarga.status === 400);

    const avatarGrande = await sharp({
        create: { width: 900, height: 600, channels: 3, background: '#393' }
    }).png().withMetadata({ exif: { IFD0: { Copyright: 'ReceMario' } } }).toBuffer();
    const subidaAvatar = new FormData();
    subidaAvatar.append('bio', bioGuardada);
    subidaAvatar.append('avatar', new Blob([avatarGrande], { type: 'image/png' }), 'avatar.png');
    const conFotoDePerfil = await conCuenta.subir('/cuenta', subidaAvatar);
    comprobar('la foto de perfil se guarda', conFotoDePerfil.status === 302);

    const perfilAvatar = await conCuenta.get('/usuario/' + cuentaPropia);
    const nombreAvatar = (perfilAvatar.texto.match(/\/avatars\/([a-f0-9]+\.png)/) || [])[1];
    const barraConAvatar = await conCuenta.get('/');
    comprobar('el avatar sale en el perfil y en la barra de navegacion',
        Boolean(nombreAvatar)
        && perfilAvatar.texto.includes('/avatars/' + nombreAvatar)
        && barraConAvatar.texto.includes('/avatars/' + nombreAvatar));

    const metadatosAvatar = nombreAvatar
        ? await sharp(path.join(CARPETA_AVATARES, nombreAvatar)).metadata()
        : null;
    comprobar('el avatar sale cuadrado y sin datos EXIF',
        Boolean(metadatosAvatar)
        && metadatosAvatar.width === 512 && metadatosAvatar.height === 512
        && metadatosAvatar.exif === undefined,
        metadatosAvatar
            ? metadatosAvatar.width + 'x' + metadatosAvatar.height + ' exif:' + Boolean(metadatosAvatar.exif)
            : 'sin avatar en disco');

    const imagenAvatar = await anonimo.get('/avatars/' + nombreAvatar);
    comprobar('el avatar se sirve como fichero estatico', imagenAvatar.status === 200);

    const avatarMalo = new FormData();
    avatarMalo.append('avatar', new Blob([Buffer.from('no soy imagen')], { type: 'text/plain' }), 'nota.txt');
    const subidaAvatarMalo = await conCuenta.subir('/cuenta', avatarMalo);
    comprobar('un archivo que no es imagen no vale de avatar', subidaAvatarMalo.status === 400,
        'estado ' + subidaAvatarMalo.status + ' -> ' + subidaAvatarMalo.texto.slice(0, 120));

    const passwordMala = await conCuenta.post('/cuenta/password', {
        actual: 'no-es-esta', nueva: 'otra-clave-12', confirmacion: 'otra-clave-12'
    });
    comprobar('cambiar la contraseña pide la actual', passwordMala.status === 400);

    const passwordNueva = 'clave-nueva-de-la-cuenta-2';
    const passwordBuena = await conCuenta.post('/cuenta/password', {
        actual: passwordCuenta, nueva: passwordNueva, confirmacion: passwordNueva
    });
    comprobar('la contraseña nueva se guarda', passwordBuena.status === 302);

    const soloLogin = crearNavegador();
    const loginViejo = await soloLogin.post('/login', { username: cuentaPropia, password: passwordCuenta });
    const loginNuevo = await soloLogin.post('/login', { username: cuentaPropia, password: passwordNueva });
    comprobar('con la contraseña nueva se entra y con la vieja no',
        loginViejo.status === 401 && loginNuevo.status === 302);

    //Una receta con foto, para ver que borrar la cuenta lo lleva todo
    const recetaDeCuenta = new FormData();
    recetaDeCuenta.append('titulo', 'Receta de prueba de la cuenta');
    recetaDeCuenta.append('tiempo', '10');
    recetaDeCuenta.append('dificultad', 'facil');
    recetaDeCuenta.append('momento', 'cena');
    recetaDeCuenta.append('ingredientes', 'Sal');
    recetaDeCuenta.append('preparacion', 'Se mezcla todo.');
    recetaDeCuenta.append('fotos', new Blob([PNG], { type: 'image/png' }), 'plato.png');
    const creadaDeCuenta = await conCuenta.subir('/receta', recetaDeCuenta);
    const idDeCuenta = (creadaDeCuenta.cabeceras.get('location') || '').split('?')[0].split('/').pop();
    const detalleDeCuenta = await conCuenta.get('/receta/' + idDeCuenta);
    const fotoDeCuenta = (detalleDeCuenta.texto.match(/\/fotos\/([a-f0-9]+\.png)/) || [])[1];
    comprobar('la cuenta de prueba tiene su receta con foto',
        creadaDeCuenta.status === 302 && Boolean(fotoDeCuenta));

    //Sus comentarios se prueban aqui, que es donde se borra la cuenta:
    //uno en su propia receta y otro en una ajena que sigue viva
    await conCuenta.post('/receta/' + idDeCuenta + '/comentarios', { texto: 'Comentario en la receta propia' });
    await conCuenta.post('/receta/' + idCantidadesExtra + '/comentarios', { texto: 'Comentario en receta ajena' });

    const sinContrasena = await conCuenta.post('/cuenta/borrar', { password: '' });
    comprobar('borrar la cuenta pide la contraseña', sinContrasena.status === 400);

    const cuentaBorrada = await conCuenta.post('/cuenta/borrar', { password: passwordNueva });
    comprobar('con la contraseña correcta la cuenta se borra', cuentaBorrada.status === 302);

    const perfilTrasBorrar = await anonimo.get('/usuario/' + cuentaPropia);
    const recetaTrasBorrar = await anonimo.get('/receta/' + idDeCuenta);
    const avatarTrasBorrar = await anonimo.get('/avatars/' + nombreAvatar);
    const fotoTrasBorrar = await anonimo.get('/fotos/' + fotoDeCuenta);
    comprobar('borrar la cuenta se lleva sus recetas y sus ficheros',
        perfilTrasBorrar.status === 404
        && recetaTrasBorrar.status === 404
        && avatarTrasBorrar.status === 404
        && fotoTrasBorrar.status === 404);

    const comentariosDeLaBorrada = await gestorDB.obtenerComentarios(idDeCuenta);
    const comentariosEnAjena = await gestorDB.obtenerComentarios(idCantidadesExtra);
    comprobar('borrar la cuenta se lleva sus comentarios',
        comentariosDeLaBorrada.length === 0 && comentariosEnAjena.length === 0);

    const cuentaCerrada = await conCuenta.get('/cuenta');
    comprobar('al borrar la cuenta se cierra la sesion', cuentaCerrada.status === 302);

    // ------------------------------------------------------------------
    // Menu semanal
    // ------------------------------------------------------------------
    const semanaSinSesion = await anonimo.get('/semana');
    comprobar('el menu semanal pide identificarse', semanaSinSesion.status === 302);

    const lunes = lunesDe();
    const diasSemana = diasDeSemana(lunes);
    const semanaAbierta = await registro.get('/semana?sem=' + lunes);
    comprobar('la semana se abre con sus siete dias',
        semanaAbierta.status === 200
        && ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
            .every(function (dia) { return semanaAbierta.texto.includes('>' + dia); })
        && /Del \d+ al \d+ de .+ de \d{4}/.test(semanaAbierta.texto));

    comprobar('los enlaces de semana se mueven de lunes a lunes',
        semanaAbierta.texto.includes('/semana?sem=' + sumarDias(lunes, -7))
        && semanaAbierta.texto.includes('/semana?sem=' + sumarDias(lunes, 7)));

    //Recetas con titulo sin signos raros, para poder compararlos con lo que
    //pinta la lista de la compra
    const sinSignos = function (receta) { return !/[&<>"']/.test(receta.titulo); };
    const paraComida = (await gestorDB.obtenerRecetas({ momento: 'comida' })).find(sinSignos);
    const paraCena = (await gestorDB.obtenerRecetas({ momento: 'cena' })).find(sinSignos);

    const anadidaComida = await registro.post('/semana/anadir', {
        sem: lunes, dia: diasSemana[0], momento: 'comida', receta: String(paraComida._id)
    });
    const conUna = await registro.get('/semana?sem=' + lunes);
    comprobar('la receta anadida ocupa su hueco de la semana',
        anadidaComida.status === 302 && (conUna.texto.match(/semana\/quitar/g) || []).length === 1);

    const repetir = await registro.post('/semana/anadir', {
        sem: lunes, dia: diasSemana[0], momento: 'comida', receta: String(paraComida._id)
    });
    const trasRepetir = await registro.get(repetir.cabeceras.get('location'));
    comprobar('la misma receta no se anade dos veces al mismo hueco',
        (trasRepetir.texto.match(/semana\/quitar/g) || []).length === 1
        && trasRepetir.texto.includes('ya esta en ese hueco'));

    const recetaMala = await registro.post('/semana/anadir', {
        sem: lunes, dia: diasSemana[0], momento: 'comida', receta: 'id-invalido'
    });
    const trasRecetaMala = await registro.get(recetaMala.cabeceras.get('location'));
    comprobar('una receta inexistente no se anade',
        (trasRecetaMala.texto.match(/semana\/quitar/g) || []).length === 1
        && trasRecetaMala.texto.includes('Esa receta no existe'));

    const otroDia = await registro.post('/semana/anadir', {
        sem: lunes, dia: sumarDias(lunes, 7), momento: 'comida', receta: String(paraCena._id)
    });
    const trasOtroDia = await registro.get(otroDia.cabeceras.get('location'));
    comprobar('no se anade a un dia que pertenece a otra semana',
        (trasOtroDia.texto.match(/semana\/quitar/g) || []).length === 1
        && trasOtroDia.texto.includes('no pertenece a la semana'));

    const anadidaCena = await registro.post('/semana/anadir', {
        sem: lunes, dia: diasSemana[1], momento: 'cena', receta: String(paraCena._id)
    });
    const conLista = await registro.get('/semana?sem=' + lunes);
    comprobar('la semana ofrece la lista de la compra con sus platos',
        anadidaCena.status === 302
        && conLista.texto.includes('/lista?recetas=' + String(paraComida._id) + ',' + String(paraCena._id)));

    const hrefDeLaLista = (conLista.texto.match(/href="(\/lista\?recetas=[^"]+)"/) || ['', '/lista'])[1];
    const listaDeLaSemana = await registro.get(hrefDeLaLista.replace(/&amp;/g, '&'));
    comprobar('la lista de la semana trae los ingredientes de sus platos',
        listaDeLaSemana.status === 200
        && listaDeLaSemana.texto.includes(paraComida.titulo)
        && listaDeLaSemana.texto.includes(paraCena.titulo));

    const rellenar = await registro.post('/semana/rellenar', { sem: lunes });
    const rellena = await registro.get('/semana?sem=' + lunes);
    comprobar('rellenar la semana llena los huecos vacios',
        rellenar.status === 302 && (rellena.texto.match(/semana\/quitar/g) || []).length > 2);

    const vaciar = await registro.post('/semana/vaciar', { sem: lunes });
    const vacia = await registro.get('/semana?sem=' + lunes);
    comprobar('vacia la semana entera',
        vaciar.status === 302 && (vacia.texto.match(/semana\/quitar/g) || []).length === 0);

    const otraSemana = await registro.get('/semana?sem=' + sumarDias(lunes, 7));
    const semanaRara = await registro.get('/semana?sem=banana');
    comprobar('se pasa de semana y una fecha escrita raro no rompe',
        otraSemana.status === 200
        && (otraSemana.texto.match(/semana\/quitar/g) || []).length === 0
        && semanaRara.status === 200);

    // ------------------------------------------------------------------
    // Importar recetas de otra pagina (JSON-LD de schema.org)
    // ------------------------------------------------------------------
    comprobar('una duracion ISO de schema.org se entiende como minutos',
        minutosDe('PT45M') === 45 && minutosDe('PT1H30M') === 90 && minutosDe('tarde') === null);

    const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
            { '@type': 'WebSite', name: 'De mentiras' },
            {
                '@type': 'Recipe',
                name: 'Tortilla de mentiras',
                totalTime: 'PT45M',
                recipeYield: '4 porciones',
                recipeIngredient: ['3 huevos', '2 patatas <b>pequenas</b>'],
                recipeInstructions: [
                    {
                        '@type': 'HowToSection',
                        name: 'Preparacion',
                        itemListElement: [
                            { '@type': 'HowToStep', text: 'Pela las patatas.' },
                            { '@type': 'HowToStep', text: 'Mezcla todo y <em>cuaja</em>.' }
                        ]
                    }
                ],
                keywords: 'rapido, vegetariano'
            }
        ]
    };
    const paginaMentira = '<html><head>'
        + '<script type="application/ld+json">' + JSON.stringify(jsonLd) + '</script>'
        + '</head><body><p>Una pagina de mentiras.</p></body></html>';

    const recetaImportada = extraerReceta(paginaMentira);
    comprobar('el JSON-LD de la pagina se mapea a la receta',
        Boolean(recetaImportada)
        && recetaImportada.titulo === 'Tortilla de mentiras'
        && recetaImportada.tiempo === 45
        && recetaImportada.raciones === 4
        && recetaImportada.ingredientes.length === 2
        && recetaImportada.ingredientes[1] === '2 patatas pequenas'
        && recetaImportada.preparacion[1] === 'Mezcla todo y cuaja.'
        && recetaImportada.etiquetas.includes('vegetariano'));
    comprobar('una pagina sin receta devuelve null',
        extraerReceta('<html><body><p>Hola</p></body></html>') === null);

    const importarAnonimo = await anonimo.get('/receta/importar');
    comprobar('importar una receta pide identificarse', importarAnonimo.status === 302);

    //Servidor local de mentiras, para probar el importador de punta a punta
    const servidorMentira = http.createServer(function (peticion, respuesta) {
        respuesta.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        respuesta.end(peticion.url === '/sin-receta'
            ? '<html><body>Hola</body></html>'
            : paginaMentira);
    });
    await new Promise(function (resolve) { servidorMentira.listen(0, '127.0.0.1', resolve); });
    const urlLocal = 'http://127.0.0.1:' + servidorMentira.address().port;

    const formularioImportado = await registro.post('/receta/importar', { url: urlLocal + '/tortilla' });
    comprobar('la receta de la url sale en el formulario de alta',
        formularioImportado.status === 200
        && formularioImportado.texto.includes('Tortilla de mentiras')
        && formularioImportado.texto.includes('3 huevos')
        && formularioImportado.texto.includes('Pela las patatas.')
        && formularioImportado.texto.includes('value="45"'));

    const sinRecetaAlli = await registro.post('/receta/importar', { url: urlLocal + '/sin-receta' });
    comprobar('una pagina sin receta avisa al importarla',
        sinRecetaAlli.status === 400 && sinRecetaAlli.texto.includes('ninguna receta'));

    const redInterna = await registro.post('/receta/importar', { url: 'http://10.1.2.3/receta' });
    comprobar('no se importa de una red interna',
        redInterna.status === 400 && redInterna.texto.includes('red interna'));

    const protocoloRaro = await registro.post('/receta/importar', { url: 'ftp://ejemplo.com/receta' });
    comprobar('solo se aceptan paginas http o https',
        protocoloRaro.status === 400 && protocoloRaro.texto.includes('http o https'));

    servidorMentira.close();

    // ------------------------------------------------------------------
    // Las sesiones viven en MongoDB, no solo en la memoria del servidor
    // ------------------------------------------------------------------
    const sesionesGuardadas = await clienteSesiones.db().collection('sessions').find({}).toArray();
    await clienteSesiones.close();
    comprobar('las sesiones se guardan en la base de datos',
        sesionesGuardadas.length > 0 && sesionesGuardadas.some(function (guardada) {
            const sesion = sesionDe(guardada);
            return sesion && sesion.usuario === usuario;
        }));
    comprobar('la sesion tambien guarda las marcas de la lista',
        sesionesGuardadas.some(function (guardada) {
            const sesion = sesionDe(guardada);
            return sesion && Array.isArray(sesion.marcados);
        }));

    // ------------------------------------------------------------------
    // Limpieza de los datos creados por esta prueba
    // ------------------------------------------------------------------
    const titulosDePrueba = {
        titulo: { $regex: '^Receta (de prueba|con foto|sin titulo|sin preparacion|con cantidades)' }
    };
    const dePrueba = await gestorDB.obtenerRecetas(titulosDePrueba);
    for (const receta of dePrueba) {
        await borrarFotos(receta.fotos);
    }
    await gestorDB.borrarComentariosDeRecetas(dePrueba.map(function (receta) { return String(receta._id); }));
    await gestorDB.eliminarReceta(titulosDePrueba);
    await gestorDB.eliminarReceta({ titulo: 'No deberia guardarse' });
    await gestorDB.borrarFavoritosDe(usuario);
    await gestorDB.borrarValoracionesDe(usuario);
    await gestorDB.borrarComentariosDe(usuario);
    await gestorDB.borrarFavoritosDe(usuario2);
    await gestorDB.borrarValoracionesDe(usuario2);
    await gestorDB.borrarComentariosDe(usuario2);
    await gestorDB.borrarEtiqueta(etiquetaNueva);
    await gestorDB.borrarEtiqueta('receta de prueba, con coma');
    await gestorDB.borrarEtiqueta('receta de prueba (editada)');
    await gestorDB.borrarUsuario({ username: usuario });
    await gestorDB.borrarUsuario({ username: usuario2 });
    await gestorDB.borrarUsuario({ username: otroUsuario });

    //La cuenta de prueba del perfil:  si el borrado fallo a medias, aqui se
    //acaba de limpiar (el avatar, primero, para no dejarlo en disco)
    const cuentasDePrueba = await gestorDB.obtenerUsuarios({ username: cuentaPropia });
    for (const cuentaDePrueba of cuentasDePrueba) {
        await borrarAvatar(cuentaDePrueba.avatar || null);
    }
    await gestorDB.borrarUsuario({ username: cuentaPropia });
    await gestorDB.borrarSemanasDe(usuario);

    await gestorDB.close();
    servidorDePruebas.kill();

    console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
    process.exit(fallos ? 1 : 0);
}

main().catch(function (err) {
    if (servidorDePruebas) servidorDePruebas.kill();
    console.error('ERROR', err);
    process.exit(1);
});
