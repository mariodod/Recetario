const { DIFICULTADES, MOMENTOS } = require('./filtros.js');
const { esVideoValido } = require('./video.js');
const { MAX_FOTOS } = require('./fotos.js');

/**
 * Receta vacia para pintar el formulario de alta por primera vez.
 */
function recetaVacia() {
    return {
        titulo: '',
        tiempo: null,
        raciones: null,
        dificultad: '',
        momento: '',
        ingredientes: [],
        preparacion: [],
        etiquetas: [],
        video: '',
        fotos: []
    };
}

/**
 * Lectura y validacion del formulario de recetas.
 *
 * Los ingredientes y los pasos van en un textarea, uno por linea; las
 * etiquetas se escriben separadas por comas. Todo se guarda como arrays en
 * minusculas y sin repetidos.
 *
 * `fotosActuales` son las fotos que ya tenia la receta: se conservan si el
 * formulario no trae ninguna nueva (el formulario decide cuales se quitan).
 *
 * Devuelve { receta, errores }:  la receta siempre se devuelve completa para
 * poder repintar el formulario con lo que ya habia escrito el usuario.
 */
function parsearReceta(body = {}, opciones = {}) {
    const receta = recetaVacia();
    receta.titulo = String(body.titulo || '').trim();
    receta.tiempo = parseInt(body.tiempo, 10);
    receta.raciones = parseInt(body.raciones, 10);
    receta.dificultad = DIFICULTADES.includes(body.dificultad) ? body.dificultad : '';
    receta.momento = MOMENTOS.includes(body.momento) ? body.momento : '';
    receta.ingredientes = enMinusculas(lineas(body.ingredientes));
    receta.preparacion = lineas(body.preparacion);
    receta.etiquetas = lista(body.etiquetas);
    receta.video = String(body.video || '').trim();
    receta.fotos = Array.isArray(opciones.fotosActuales) ? opciones.fotosActuales : [];

    const errores = [];

    if (!receta.titulo) {
        errores.push('El titulo es obligatorio');
    }
    if (!Number.isFinite(receta.tiempo) || receta.tiempo < 1) {
        receta.tiempo = null;
    }
    if (!Number.isFinite(receta.raciones) || receta.raciones < 1 || receta.raciones > 50) {
        receta.raciones = null;
    }
    if (!receta.dificultad) {
        errores.push('Indica la dificultad');
    }
    if (!receta.momento) {
        errores.push('Indica para que momento del dia es');
    }
    if (receta.preparacion.length === 0) {
        errores.push('Cuenta como se prepara: añade al menos un paso');
    }
    if (receta.preparacion.length > 50) {
        errores.push('Puedes poner como maximo 50 pasos');
    }
    if (receta.ingredientes.length > 30) {
        errores.push('Puedes poner como maximo 30 ingredientes');
    }
    if (receta.etiquetas.length > 10) {
        errores.push('Puedes poner como maximo 10 etiquetas');
    }
    if (receta.fotos.length > MAX_FOTOS) {
        errores.push('Puedes guardar como maximo ' + MAX_FOTOS + ' fotos por receta');
    }
    if (!esVideoValido(receta.video)) {
        errores.push('El video debe ser un enlace valido, por ejemplo el de YouTube o Vimeo');
    }

    return { receta: receta, errores: errores };
}

/**
 * Una linea del textarea es un paso de la preparacion.
 */
function lineas(texto) {
    return Array.from(new Set(
        String(texto || '')
            .split(/\r?\n/)
            .map(function (linea) { return linea.trim(); })
            .filter(Boolean)
    ));
}

/**
 * Los ingredientes van uno por linea y se guardan en minusculas.
 */
function enMinusculas(elementos) {
    return Array.from(new Set(
        elementos.map(function (elemento) { return elemento.toLowerCase(); })
    ));
}

/**
 * Las etiquetas se escriben separadas por comas.
 */
function lista(texto) {
    return Array.from(new Set(
        String(texto || '')
            .split(',')
            .map(function (elemento) { return elemento.trim().toLowerCase(); })
            .filter(Boolean)
    ));
}

module.exports = { parsearReceta, recetaVacia };
