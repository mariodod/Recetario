/**
 * Cantidades de los ingredientes.
 *
 * Los ingredientes se escriben como texto libre ("200 g de harina", "2
 * cebollas", "sal"), porque asi sirven tambien para buscar, filtrar y
 * recomendar. Aqui se lee la cantidad que traen delante para poder escalarla
 * al cambiar el numero de raciones o sumarla en la lista de la compra; lo que
 * no traiga una cantidad reconocible se queda tal cual.
 *
 * Ademas de enteros y decimales ("200 g", "1,5 l") se entienden fracciones
 * ("1/2 taza", "1 1/2 taza", "media taza"), rangos ("2-3 huevos":  escalan de
 * extremo a extremo, pero no se suman) y palabras de numero seguidas de una
 * unidad conocida ("una cucharada", "un puñado"); una palabra de numero sin
 * unidad detras no se toca, porque "dosis" no es "dos".
 */

//Unidades que reconocemos detras de la cantidad. Lo demas se considera parte
//del nombre ("2 cebollas" lleva el nombre pegado al numero).
const UNIDADES = [
    'kg', 'g', 'gr', 'grs', 'mg', 'l', 'dl', 'cl', 'ml',
    'ud', 'uds', 'unidades', 'cucharada', 'cucharadas', 'cucharadita', 'cucharaditas',
    'taza', 'tazas', 'diente', 'dientes', 'hoja', 'hojas', 'rebanada', 'rebanadas',
    'pizca', 'pizcas', 'puñado', 'puñados', 'vaso', 'vasos', 'loncha', 'lonchas',
    'rodaja', 'rodajas', 'lata', 'latas', 'caja', 'cajas', 'bote', 'botes',
    'bolsa', 'bolsas', 'rama', 'ramas', 'trozo', 'trozos', 'porcion', 'porciones',
    'porción', 'manoja', 'manojos', 'chorro', 'chorros', 'chorrito', 'chorritos',
    'cucharon', 'cucharones'
];

//Palabras de numero que se entienden delante de una unidad:  siempre van
//seguidas de espacio (y de una unidad), o no se interpretan
const PALABRAS_DE_NUMERO = [
    'unos', 'unas', 'uno', 'una', 'un',
    'medios', 'medias', 'medio', 'media'
];
const VALOR_DE_PALABRA = {
    un: 1, uno: 1, una: 1, unos: 1, unas: 1,
    medio: 0.5, media: 0.5, medios: 0.5, medias: 0.5
};

//Fracciones en forma de simbolo unicode
const FRACCION_DE_SIMBOLO = {
    '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3,
    '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875
};

//Como puede empezar un ingrediente con cantidad:  fraccion ("1/2 taza" o el
//simbolo "½ taza"), mixta ("1 1/2 taza"), numero ("200 g") o palabra de numero
//("una cucharada");  el orden de las alternativas importa, porque una fraccion
//tambien empieza por numero
const INICIO = new RegExp(
    '^('
    + '\\d+\\s+\\d+\\s*\\/\\s*\\d+'
    + '|\\d+\\s*\\/\\s*\\d+'
    + '|\\d+(?:[.,]\\d+)?'
    + '|' + PALABRAS_DE_NUMERO.join('|')
    + '|[' + Object.keys(FRACCION_DE_SIMBOLO).join('') + ']'
    + ')[ \\t]*(.*)$'
);

/**
 * El valor numerico de lo que se haya escrito delante.
 */
function cantidadDe(escrito) {
    if (Object.prototype.hasOwnProperty.call(FRACCION_DE_SIMBOLO, escrito)) {
        return FRACCION_DE_SIMBOLO[escrito];
    }
    if (Object.prototype.hasOwnProperty.call(VALOR_DE_PALABRA, escrito)) {
        return VALOR_DE_PALABRA[escrito];
    }

    //Mixta:  "1 1/2"
    const mixta = escrito.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
    if (mixta) {
        return parseInt(mixta[1], 10) + parseInt(mixta[2], 10) / parseInt(mixta[3], 10);
    }

    //Fraccion:  "1/2"
    const fraccion = escrito.match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)$/);
    if (fraccion) {
        return parseFloat(fraccion[1].replace(',', '.')) / parseFloat(fraccion[2].replace(',', '.'));
    }

    const numero = parseFloat(escrito.replace(',', '.'));
    return Number.isFinite(numero) ? numero : NaN;
}

/**
 * Intenta leer un ingrediente como "cantidad [unidad] nombre".
 * Devuelve { cantidad, hasta, unidad, preposicion, nombre } o null si no
 * empieza por cantidad. `hasta` solo rellena en los rangos ("2-3 huevos").
 * La preposicion ("de" o "del") se guarda aparte para poder devolver el
 * ingrediente tal como se escribio:  "800 g de tomate", y no "800 g tomate".
 */
function parsear(texto) {
    const limpio = String(texto || '').trim().toLowerCase();
    const principio = limpio.match(INICIO);
    if (!principio) {
        return null;
    }

    const escrito = principio[1].trim();

    //La palabra de numero exige espacio o fin por detras:  "dosis de ajo" no
    //empieza por "dos"
    if (/^[a-záéíóúüñ]/.test(escrito) && !/^(?:\s|$)/.test(limpio.slice(escrito.length))) {
        return null;
    }

    const cantidad = cantidadDe(escrito);
    if (!Number.isFinite(cantidad)) {
        return null;
    }

    let resto = principio[2].trim();

    //Rango ("2-3 huevos"):  el extremo superior se guarda para escalarlo
    let hasta = null;
    const rango = resto.match(/^[-–]\s*(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (rango) {
        hasta = parseFloat(rango[1].replace(',', '.'));
        if (!Number.isFinite(hasta)) {
            return null;
        }
        resto = rango[2].trim();
    }

    //La unidad solo cuenta si esta sola o seguida de un espacio, asi "gr de
    //pimienta" no lo come la "g"
    let unidad = '';
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
        hasta: hasta,
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
 * cantidad no se toca; un rango se escala de extremo a extremo ("2-3"
 * pasa a "4-6").
 */
function escalar(texto, factor) {
    const parseado = parsear(texto);
    if (!parseado || !factor || factor === 1) {
        return texto;
    }

    const cantidad = formatear(parseado.cantidad * factor);
    const rango = parseado.hasta != null
        ? '-' + formatear(parseado.hasta * factor)
        : '';

    return cantidad + rango
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
