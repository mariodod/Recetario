/**
 * Fotos de las recetas.
 *
 * Se guardan en public/fotos, que express sirve como estatico, con nombre
 * aleatorio y extension tomada del tipo real del archivo: el nombre que
 * ponga el navegador nunca decide como se guarda el fichero.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');

const CARPETA = path.join(__dirname, '..', 'public', 'fotos');
const TAMANYO_MAXIMO = 5 * 1024 * 1024; //5 MB

const EXTENSIONES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
};

const subida = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            fs.mkdir(CARPETA, { recursive: true }, function (err) {
                cb(err, CARPETA);
            });
        },
        filename: function (req, file, cb) {
            const nombre = crypto.randomBytes(10).toString('hex') + EXTENSIONES[file.mimetype];
            cb(null, nombre);
        }
    }),
    limits: { fileSize: TAMANYO_MAXIMO, files: 1 },
    fileFilter: function (req, file, cb) {
        if (EXTENSIONES[file.mimetype]) {
            return cb(null, true);
        }
        cb(new Error('tipo-no-permitido'));
    }
});

/**
 * Middleware de subida:  si el archivo no llega bien se anota el motivo en
 * req.errorFoto y se sigue adelante, para devolver el formulario con el
 * mensaje en lugar de un error 500.
 */
function subirFoto(req, res, next) {
    subida.single('foto')(req, res, function (err) {
        if (!err) return next();

        if (err.code === 'LIMIT_FILE_SIZE') {
            req.errorFoto = 'La foto no puede pesar mas de 5 MB';
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.message === 'tipo-no-permitido') {
            req.errorFoto = 'La foto debe ser una imagen JPEG, PNG, WEBP o GIF';
        } else {
            req.errorFoto = 'No se ha podido leer la foto';
        }
        next();
    });
}

/**
 * Borra una foto ya guardada. Se ignora el error: si no esta, no pasa nada.
 */
function borrarFoto(nombre) {
    if (!nombre) return Promise.resolve();
    return fs.promises.unlink(path.join(CARPETA, nombre)).catch(function () { });
}

module.exports = { subirFoto, borrarFoto, CARPETA };
