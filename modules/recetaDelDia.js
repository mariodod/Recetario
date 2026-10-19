/**
 * Receta del dia:  se elige con la fecha, sin guardar estado, de manera que
 * la misma receta se muestra durante todo el dia y cambia al dia siguiente.
 */

function indiceDelDia(texto) {
    let hash = 0;
    for (let i = 0; i < texto.length; i++) {
        //desplazamiento de 32 bits para no desbordar el entero
        hash = (hash * 31 + texto.charCodeAt(i)) >>> 0;
    }
    return hash;
}

/**
 * Fecha en local (no UTC) para que el cambio sea a medianoche del usuario.
 */
function fechaLocal(fecha = new Date()) {
    const dia = String(fecha.getDate()).padStart(2, '0');
    const mes = String(fecha.getMonth() + 1).padStart(2, '0');
    return fecha.getFullYear() + '-' + mes + '-' + dia;
}

function elegirRecetaDelDia(recetas, fecha = new Date()) {
    if (!Array.isArray(recetas) || recetas.length === 0) {
        return null;
    }
    return recetas[indiceDelDia(fechaLocal(fecha)) % recetas.length];
}

module.exports = { elegirRecetaDelDia };
