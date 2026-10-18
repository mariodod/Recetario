/**
 * Prueba rapida de todas las rutas. Requiere el servidor levantado:
 *
 *   npm test
 */
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config();

const BASE = 'http://localhost:8081';
const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/recetario';
const gestorDB = require('../modules/gestorDB.js');
const { MongoClient } = require('mongodb');
const { extraerFiltros, consultaDeFiltros } = require('../modules/filtros.js');
const { CARPETA, borrarFotos } = require('../modules/fotos.js');

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
 * Cada flujo tiene su propio navegador, con su cookie de sesion.
 */
function crearNavegador() {
    let cookie = null;

    async function peticion(ruta, opciones = {}) {
        const headers = Object.assign({}, opciones.headers);
        if (cookie) headers.Cookie = cookie;

        let body;
        if (opciones.formData) {
            body = opciones.formData;
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

        const setCookie = res.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];

        return { status: res.status, texto: await res.text(), cabeceras: res.headers };
    }

    return {
        get: function (ruta, opciones) { return peticion(ruta, opciones); },
        post: function (ruta, body, opciones) {
            return peticion(ruta, Object.assign({ method: 'POST', body: body }, opciones));
        },
        subir: function (ruta, formData, opciones) {
            return peticion(ruta, Object.assign({ method: 'POST', formData: formData }, opciones));
        }
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

    const logout = await login.get('/logout');
    const trasLogout = await login.get('/');
    comprobar('el logout cierra la sesion',
        logout.status === 302 && trasLogout.texto.includes('Identifícate'));
    const detalleSinSesion = await anonimo.get('/receta/' + id);
    comprobar('sin sesion no aparecen los botones de editar',
        !detalleSinSesion.texto.includes('/editar'));

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
    await gestorDB.eliminarReceta(titulosDePrueba);
    await gestorDB.eliminarReceta({ titulo: 'No deberia guardarse' });
    await gestorDB.borrarFavoritosDe(usuario);
    await gestorDB.borrarValoracionesDe(usuario);
    await gestorDB.borrarFavoritosDe(usuario2);
    await gestorDB.borrarValoracionesDe(usuario2);
    await gestorDB.borrarEtiqueta(etiquetaNueva);
    await gestorDB.borrarEtiqueta('receta de prueba, con coma');
    await gestorDB.borrarEtiqueta('receta de prueba (editada)');
    await gestorDB.borrarUsuario({ username: usuario });
    await gestorDB.borrarUsuario({ username: usuario2 });
    await gestorDB.close();

    console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
    process.exit(fallos ? 1 : 0);
}

main().catch(function (err) {
    console.error('ERROR', err);
    process.exit(1);
});
