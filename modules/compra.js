/**
 * Lista de la compra.
 *
 * Junta los ingredientes de varias recetas, agrupando los que son el mismo
 * producto. Las cantidades se suman solo si todas las recetas que lo piden
 * traen cantidad y en la misma unidad; si alguna viene sin cantidad, el grupo
 * se queda sin ella, porque sumar "harina" con "200 g de harina" seria
 * inventarse la cantidad.
 */
const { parsear, formatear } = require('./raciones.js');

/**
 * `listas` es una lista de { receta, ingredientes[] }.
 * Devuelve [{ clave, nombre, unidad, cantidad, texto, recetas[] }] ordenada
 * por nombre. La `clave` identifica al grupo (nombre y unidad) y es la que se
 * usa para marcarlo como comprado.
 */
function agruparIngredientes(listas) {
    const grupos = new Map();

    for (const lista of listas) {
        for (const linea of lista.ingredientes || []) {
            const parseado = parsear(linea) || {
                cantidad: null,
                unidad: '',
                preposicion: '',
                nombre: String(linea || '').trim().toLowerCase()
            };
            if (!parseado.nombre) continue;

            const clave = parseado.nombre + '|' + parseado.unidad;
            if (!grupos.has(clave)) {
                grupos.set(clave, {
                    //Identidad estable del grupo:  es la que se usa para
                    //marcarlo como comprado en la lista de la compra
                    clave: clave,
                    nombre: parseado.nombre,
                    unidad: parseado.unidad,
                    preposicion: parseado.preposicion || '',
                    cantidad: 0,
                    completa: true,
                    recetas: []
                });
            }

            const grupo = grupos.get(clave);
            if (Number.isFinite(parseado.cantidad)) {
                grupo.cantidad += parseado.cantidad;
            } else {
                grupo.completa = false;
            }
            if (!grupo.recetas.includes(lista.receta)) {
                grupo.recetas.push(lista.receta);
            }
        }
    }

    return Array.from(grupos.values())
        .map(function (grupo) {
            grupo.texto = grupo.completa && grupo.cantidad > 0
                ? formatear(grupo.cantidad)
                    + (grupo.unidad ? ' ' + grupo.unidad : '')
                    + (grupo.preposicion ? ' ' + grupo.preposicion : '')
                    + ' ' + grupo.nombre
                : grupo.nombre;
            return grupo;
        })
        .sort(function (a, b) {
            return a.nombre.localeCompare(b.nombre, 'es');
        });
}

module.exports = { agruparIngredientes };
