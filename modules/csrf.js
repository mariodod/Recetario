/**
 * Middleware de proteccion CSRF (token sincronizador).
 *
 * Cada sesion tiene su token: app.js lo genera, lo reparte a las plantillas
 * como variable y lo espeja en una cookie (solo para clientes de
 * programacion; la validacion es SIEMPRE contra la sesion). Todo formulario
 * POST lo lleva escondido y toda peticion POST debe traerlo: si no coincide
 * con el de la sesion, la peticion no toca nada. Asi un sitio ajeno no puede
 * aprovechar las cookies del usuario para enviar formularios por el.
 *
 * En las rutas con subida de archivos el middleware va DETRAS de multer:
 * el cuerpo multipart no se puede leer antes y el campo _csrf viaja dentro.
 */
const crypto = require('node:crypto');

function mismoValor(a, b) {
    //Comparacion en tiempo constante de huellas, sin ni siquiera el tamanyo
    const huella = function (valor) {
        return crypto.createHash('sha256').update(String(valor)).digest();
    };
    return crypto.timingSafeEqual(huella(a), huella(b));
}

module.exports = function csrf(req, res, next) {
    const esperado = req.session && req.session.csrf;
    const recibido = req.body && req.body._csrf;

    if (!esperado || typeof recibido !== 'string' || !mismoValor(esperado, recibido)) {
        return res.status(403).send(
            'Peticion rechazada: el formulario no es valido o ha caducado. ' +
            'Vuelve a la pagina e intenta otra vez.'
        );
    }
    next();
};
