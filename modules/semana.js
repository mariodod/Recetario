/**
 * Menu semanal.
 *
 * La semana arranca en lunes y se identifica por la fecha de ese lunes en
 * formato "YYYY-MM-DD". Dentro, los platos se guardan por dia y por momento
 * (desayuno, comida, cena, postre), de modo que el documento que se guarda
 * en MongoDB es pequeno y cada anadir o quitar es un solo post.
 *
 * Todo lo de fechas vive aqui para que las rutas solo hablen de claves y las
 * pruebas puedan calcular los mismos lunes que la aplicacion.
 */
//De lunes a domingo, en el mismo orden que devuelven las fechas
const DIAS = [
    { nombre: 'Lunes', corto: 'lun' },
    { nombre: 'Martes', corto: 'mar' },
    { nombre: 'Miércoles', corto: 'mie' },
    { nombre: 'Jueves', corto: 'jue' },
    { nombre: 'Viernes', corto: 'vie' },
    { nombre: 'Sábado', corto: 'sab' },
    { nombre: 'Domingo', corto: 'dom' }
];

//Los momentos del dia, con su etiqueta para la tabla
const MOMENTOS_SEMANA = [
    { valor: 'desayuno', etiqueta: 'Desayuno' },
    { valor: 'comida', etiqueta: 'Comida' },
    { valor: 'cena', etiqueta: 'Cena' },
    { valor: 'postre', etiqueta: 'Postre' }
];

const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/**
 * "YYYY-MM-DD" valido en el calendario (un "2026-02-31" no lo es).
 */
function esClaveValida(clave) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(clave || ''))) {
        return false;
    }
    const partes = String(clave).split('-').map(Number);
    const fecha = new Date(partes[0], partes[1] - 1, partes[2]);
    return fecha.getFullYear() === partes[0]
        && fecha.getMonth() === partes[1] - 1
        && fecha.getDate() === partes[2];
}

/**
 * La fecha de una clave, como Date local (sin sorpresas de UTC).
 */
function fechaDe(clave) {
    const partes = String(clave).split('-').map(Number);
    return new Date(partes[0], partes[1] - 1, partes[2]);
}

/**
 * La clave de una fecha.
 */
function claveDe(fecha) {
    const anio = fecha.getFullYear();
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    const dia = String(fecha.getDate()).padStart(2, '0');
    return anio + '-' + mes + '-' + dia;
}

/**
 * Lunes de la semana que contiene esa fecha. Si la clave no es valida, la de
 * hoy: asi una semana escrita a mano a mitad de camino se normaliza sola.
 */
function lunesDe(clave) {
    const fecha = esClaveValida(clave) ? fechaDe(clave) : new Date();
    const desdeLunes = (fecha.getDay() + 6) % 7;
    fecha.setDate(fecha.getDate() - desdeLunes);
    return claveDe(fecha);
}

/**
 * Las siete fechas de la semana, de lunes a domingo.
 */
function diasDeSemana(lunes) {
    const base = fechaDe(lunes);
    const dias = [];
    for (let i = 0; i < 7; i++) {
        const fecha = new Date(base);
        fecha.setDate(base.getDate() + i);
        dias.push(claveDe(fecha));
    }
    return dias;
}

/**
 * Clave de otra semana, sumando o restando dias.
 */
function sumarDias(clave, dias) {
    const fecha = fechaDe(clave);
    fecha.setDate(fecha.getDate() + dias);
    return claveDe(fecha);
}

/**
 * Titulo legible de la semana:  "Del 12 al 18 de octubre de 2026".
 */
function etiquetaDeSemana(lunes) {
    const dias = diasDeSemana(lunes);
    const primero = fechaDe(dias[0]);
    const ultimo = fechaDe(dias[6]);

    if (primero.getMonth() === ultimo.getMonth()) {
        return 'Del ' + primero.getDate() + ' al ' + ultimo.getDate()
            + ' de ' + MESES[primero.getMonth()] + ' de ' + primero.getFullYear();
    }
    return 'Del ' + primero.getDate() + ' de ' + MESES[primero.getMonth()]
        + ' al ' + ultimo.getDate() + ' de ' + MESES[ultimo.getMonth()]
        + ' de ' + ultimo.getFullYear();
}

/**
 * Los momentos del dia siguen siendo los del resto de la aplicacion:  aqui
 * solo se les pone etiqueta.
 */
module.exports = {
    DIAS,
    MOMENTOS_SEMANA,
    lunesDe,
    diasDeSemana,
    sumarDias,
    etiquetaDeSemana
};
