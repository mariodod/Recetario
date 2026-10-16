/**
 * Filtros del listado de recetas y del menu aleatorio.
 *
 * Los filtros viajan por la querystring (?titulo=...&dificultad=facil), de
 * modo que se pueden compartir con un enlace y combinarse con la paginacion.
 * `q` es la busqueda textual y se combina con el resto igual que cualquier
 * otro filtro.
 */

const DIFICULTADES = ['facil', 'media', 'dificil'];
const MOMENTOS = ['desayuno', 'comida', 'cena', 'postre'];

/**
 * Deja la querystring como objeto de filtros validado. Lo que este vacio o
 * no tenga sentido se descarta para que no se aplique.
 */
function extraerFiltros(query = {}) {
    const filtros = {
        q: String(query.q || '').trim(),
        titulo: String(query.titulo || '').trim(),
        tiempo: parseInt(query.tiempo, 10),
        dificultad: DIFICULTADES.includes(query.dificultad) ? query.dificultad : '',
        etiqueta: String(query.etiqueta || '').trim().toLowerCase(),
        ingrediente: String(query.ingrediente || '').trim()
    };

    if (!Number.isFinite(filtros.tiempo) || filtros.tiempo < 1) {
        filtros.tiempo = null;
    }

    return filtros;
}

/**
 * Convierte los filtros en un criterio de busqueda de MongoDB.
 * El titulo y el ingrediente se buscan como subcadena, sin distinguir
 * mayusculas, y escapando lo que pueda interpretarse como expresion regular.
 * La busqueda textual (`q`) usa el indice de texto: busca en el titulo, las
 * etiquetas, los ingredientes y la preparacion, y se puede combinar con el
 * resto de filtros.
 */
function criterioDeFiltros(filtros) {
    const criterio = {};

    if (filtros.q) {
        criterio.$text = { $search: filtros.q };
    }
    if (filtros.titulo) {
        criterio.titulo = { $regex: escaparRegExp(filtros.titulo), $options: 'i' };
    }
    if (filtros.tiempo) {
        criterio.tiempo = { $lte: filtros.tiempo };
    }
    if (filtros.dificultad) {
        criterio.dificultad = filtros.dificultad;
    }
    if (filtros.etiqueta) {
        criterio.etiquetas = filtros.etiqueta;
    }
    if (filtros.ingrediente) {
        criterio.ingredientes = { $regex: escaparRegExp(filtros.ingrediente), $options: 'i' };
    }

    return criterio;
}

function escaparRegExp(texto) {
    return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Devuelve los filtros como querystring (sin la pagina) para que los enlaces
 * de paginacion no los pierdan. Acaba en '&' o viene vacio.
 */
function consultaDeFiltros(filtros) {
    const params = new URLSearchParams();

    if (filtros.q) params.set('q', filtros.q);
    if (filtros.titulo) params.set('titulo', filtros.titulo);
    if (filtros.tiempo) params.set('tiempo', String(filtros.tiempo));
    if (filtros.dificultad) params.set('dificultad', filtros.dificultad);
    if (filtros.etiqueta) params.set('etiqueta', filtros.etiqueta);
    if (filtros.ingrediente) params.set('ingrediente', filtros.ingrediente);

    const cadena = params.toString();
    return cadena ? cadena + '&' : '';
}

/**
 * Opciones del menu aleatorio:  solo comidas, solo cenas, ambos o postres.
 */
function momentosDelMenu(opcion) {
    switch (opcion) {
        case 'comida': return ['comida'];
        case 'cena': return ['cena'];
        case 'postre': return ['postre'];
        case 'ambos':
        default: return ['comida', 'cena'];
    }
}

module.exports = {
    DIFICULTADES,
    MOMENTOS,
    extraerFiltros,
    criterioDeFiltros,
    consultaDeFiltros,
    momentosDelMenu
};
