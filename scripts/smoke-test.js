/**
 * Prueba rapida de todas las rutas. Requiere el servidor levantado:
 *
 *   npm test
 */
const fs = require('node:fs');
const path = require('node:path');
const BASE = 'http://localhost:8081';
const gestorDB = require('../modules/gestorDB.js');
const { extraerFiltros, consultaDeFiltros } = require('../modules/filtros.js');
const { CARPETA, borrarFoto } = require('../modules/fotos.js');

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
    gestorDB.init(process.env.MONGODB_URI || 'mongodb://localhost:27017/recetario');
    await gestorDB.connect();
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
    comprobar('el formulario de receta trae el autocompletado de etiquetas',
        formularioReceta.texto.includes('id="lista-etiquetas"'));
    comprobar('el formulario pide la preparacion y la foto',
        formularioReceta.texto.includes('name="preparacion"') && formularioReceta.texto.includes('name="foto"'));

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
        etiquetas: etiquetaNueva + ', Receta de prueba',
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

    const etiquetasGuardadas = await gestorDB.obtenerEtiquetas();
    comprobar('las etiquetas nuevas pasan al listado general (filtro y autocompletado)',
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
    // Fotos
    // ------------------------------------------------------------------
    const subida = new FormData();
    subida.append('titulo', 'Receta con foto');
    subida.append('tiempo', '15');
    subida.append('dificultad', 'facil');
    subida.append('momento', 'cena');
    subida.append('ingredientes', 'Huevo');
    subida.append('preparacion', 'Se hace en un minuto.');
    subida.append('foto', new Blob([PNG], { type: 'image/png' }), 'foto.png');

    const conFoto = await registro.subir('/receta', subida);
    const destinoFoto = conFoto.cabeceras.get('location') || '';
    comprobar('una receta con foto se guarda', conFoto.status === 302 && destinoFoto.startsWith('/receta/'));

    const idConFoto = destinoFoto.split('?')[0].split('/').pop();
    const detalleConFoto = await anonimo.get('/receta/' + idConFoto);
    const nombreFoto = (detalleConFoto.texto.match(/\/fotos\/([a-f0-9]+\.png)/) || [])[1];
    comprobar('la foto se guarda en disco y se muestra en el detalle',
        Boolean(nombreFoto) && fs.existsSync(path.join(CARPETA, nombreFoto)));

    const listadoConFoto = await anonimo.get('/recetas?titulo=Receta+con+foto');
    comprobar('la miniatura de la foto sale en el listado',
        listadoConFoto.texto.includes('/fotos/' + nombreFoto));

    const subidaMala = new FormData();
    subidaMala.append('titulo', 'Receta con archivo raro');
    subidaMala.append('preparacion', 'No importa.');
    subidaMala.append('foto', new Blob([Buffer.from('no soy una imagen')], { type: 'text/plain' }), 'nota.txt');
    const archivoMalo = await registro.subir('/receta', subidaMala);
    comprobar('solo se aceptan imagenes', archivoMalo.status === 400
        && archivoMalo.texto.includes('JPEG, PNG, WEBP o GIF'));

    const borrada = await registro.post('/receta/' + idConFoto + '/borrar', null);
    comprobar('una receta se puede borrar', borrada.status === 302);
    comprobar('al borrar la receta desaparece su foto del disco',
        !fs.existsSync(path.join(CARPETA, nombreFoto || 'no-existe')));
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
    // Limpieza de los datos creados por esta prueba
    // ------------------------------------------------------------------
    const dePrueba = await gestorDB.obtenerRecetas({ titulo: { $regex: '^Receta (de prueba|con foto|sin titulo|sin preparacion)' } });
    for (const receta of dePrueba) {
        await borrarFoto(receta.foto);
    }
    await gestorDB.eliminarReceta({ titulo: { $regex: '^Receta (de prueba|con foto|sin titulo|sin preparacion)' } });
    await gestorDB.eliminarReceta({ titulo: 'No deberia guardarse' });
    await gestorDB.borrarEtiqueta(etiquetaNueva);
    await gestorDB.borrarEtiqueta('receta de prueba');
    await gestorDB.borrarEtiqueta('receta de prueba (editada)');
    await gestorDB.borrarUsuario({ username: usuario });
    await gestorDB.close();

    console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
    process.exit(fallos ? 1 : 0);
}

main().catch(function (err) {
    console.error('ERROR', err);
    process.exit(1);
});
