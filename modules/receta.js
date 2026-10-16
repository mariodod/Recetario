const { DIFICULTADES, MOMENTOS } = require('./filtros.js');

/**
 * Receta vacia para pintar el formulario de alta por primera vez.
 */
function recetaVacia() {
    return {
        titulo: '',
        tiempo: null,
        dificultad: '',
        momento: '',
        ingredientes: [],
        etiquetas: []
    };
}

/**
 * Lectura y validacion del formulario de recetas.
 *
 * Los ingredientes y las etiquetas se escriben separados por comas y se
 * guardan como arrays en minusculas y sin repetidos.
 *
 * Devuelve { receta, errores }:  la receta siempre se devuelve completa para
 * poder repintar el formulario con lo que ya habia escrito el usuario.
 */
function parsearReceta(body = {}) {
    const receta = recetaVacia();
    receta.titulo = String(body.titulo || '').trim();
    receta.tiempo = parseInt(body.tiempo, 10);
    receta.dificultad = DIFICULTADES.includes(body.dificultad) ? body.dificultad : '';
    receta.momento = MOMENTOS.includes(body.momento) ? body.momento : '';
    receta.ingredientes = lista(body.ingredientes);
    receta.etiquetas = lista(body.etiquetas);

    const errores = [];

    if (!receta.titulo) {
        errores.push('El titulo es obligatorio');
    }
    if (!Number.isFinite(receta.tiempo) || receta.tiempo < 1) {
        receta.tiempo = null;
    }
    if (!receta.dificultad) {
        errores.push('Indica la dificultad');
    }
    if (!receta.momento) {
        errores.push('Indica para que momento del dia es');
    }
    if (receta.etiquetas.length > 10) {
        errores.push('Puedes poner como maximo 10 etiquetas');
    }
    if (receta.ingredientes.length > 30) {
        errores.push('Puedes poner como maximo 30 ingredientes');
    }

    return { receta: receta, errores: errores };
}

function lista(texto) {
    const elementos = String(texto || '')
        .split(',')
        .map(function (elemento) { return elemento.trim().toLowerCase(); })
        .filter(Boolean);

    return Array.from(new Set(elementos));
}

module.exports = { parsearReceta, recetaVacia };
