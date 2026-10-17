/**
 * Cantidades de los ingredientes.
 *
 * Los ingredientes se escriben como texto libre ("200 g de harina", "2
 * cebollas", "sal"), porque asi sirven tambien para buscar, filtrar y
 * recomendar. Aqui se intenta leer la cantidad que traen delante para poder
 * escalarla al cambiar el numero de raciones o sumarla en la lista de la
 * compra; lo que no traiga cantidad se queda tal cual.
 */

//Unidades que reconocemos detras de la cantidad. Lo demas se considera parte
//del nombre ("2 cebollas" lleva el nombre pegado al numero).
const UNIDADES = [
    'kg', 'g', 'gr', 'grs', 'mg', 'l', 'dl', 'cl', 'ml',
    'ud', 'uds', 'unidades', 'cucharada', 'cucharadas', 'cucharadita', 'cucharaditas',
    'taza', 'tazas', 'diente', 'dientes', 'hoja', 'hojas', 'rebanada', 'rebanadas',
    'pizca', 'pizcas'
];

/**
 * Intenta leer un ingrediente como "cantidad unidad nombre".
 * Devuelve { cantidad, unidad, preposicion, nombre } o null si no empieza por
 * cantidad. La preposicion ("de" o "del") se guarda aparte para poder
 * devolver el ingrediente tal como se escribio:  "800 g de tomate", y no
 * "800 g tomate".
 */
function parsear(texto) {
    const limpio = String(texto || '').trim().toLowerCase();
    const principio = limpio.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!principio) {
        return null;
    }

    const cantidad = parseFloat(principio[1].replace(',', '.'));
    if (!Number.isFinite(cantidad)) {
        return null;
    }

    let resto = principio[2].trim();
    let unidad = '';

    //La unidad solo cuenta si esta sola o seguida de un espacio, asi "gr de
    //pimienta" no lo come la "g"
    for (const candidata of UNIDADES) {
        if (resto === candidata || resto.startsWith(candidata + ' ')) {
            unidad = candidata;
            resto = resto.slice(candidata.length).trim();
            break;
        }
    }

    //La preposicion se guarda sin el espacio que la sigue
    const preposicionCompleta = (resto.match(/^(de|del)\s+/) || [''])[0];
    resto = resto.slice(preposicionCompleta.length).trim();
    if (!resto) {
        return null;
    }

    return {
        cantidad: cantidad,
        unidad: unidad,
        preposicion: preposicionCompleta.trim(),
        nombre: resto
    };
}

/**
 * Pinta una cantidad con lo justo de decimales:  3, 1.5, 0.25...
 */
function formatear(cantidad) {
    const redondeado = Math.round(cantidad * 100) / 100;
    return String(redondeado);
}

/**
 * Devuelve el ingrediente multiplicado por el factor. Lo que no traiga
 * cantidad no se toca.
 */
function escalar(texto, factor) {
    const parseado = parsear(texto);
    if (!parseado || !factor || factor === 1) {
        return texto;
    }

    const nueva = parseado.cantidad * factor;
    return formatear(nueva)
        + (parseado.unidad ? ' ' + parseado.unidad : '')
        + (parseado.preposicion ? ' ' + parseado.preposicion : '')
        + ' ' + parseado.nombre;
}

/**
 * Escala una lista entera de ingredientes.
 */
function escalarIngredientes(ingredientes, factor) {
    return (ingredientes || []).map(function (ingrediente) {
        return escalar(ingrediente, factor);
    });
}

module.exports = { parsear, formatear, escalar, escalarIngredientes, UNIDADES };
