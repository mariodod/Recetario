/**
 * Lectura de los campos de los formularios.
 *
 * Un formulario de verdad manda texto, pero el cuerpo de una peticion es
 * texto que el cliente controla:  si alguien manda "usuario[algo]=x" (que es
 * lo que acepta el parser de formularios anidados), el campo llega como
 * objeto. Sin mirar el tipo, compararlo o guardarlo revienta la peticion
 * (500) o, peor, guarda basura como "[object Object]".
 *
 * `textoDe` devuelve el texto tal cual, "" si el campo no vino, y null si
 * vino algo que no es texto:  quien lo llama decide que hacer con ese null
 * (normalmente, responder con un 400 y el formulario de nuevo).
 */
function textoDe(campo) {
    if (campo === undefined || campo === null) return '';
    if (typeof campo !== 'string') return null;
    return campo;
}

module.exports = { textoDe };
