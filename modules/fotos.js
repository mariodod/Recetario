/**
 * Fotos de las recetas y avatares de perfil.
 *
 * Cada receta puede llevar varias. Se guardan en public/fotos, que express
 * sirve como estatico, con nombre aleatorio y extension tomada del tipo real
 * del archivo: el nombre que ponga el navegador nunca decide como se guarda
 * el fichero. La foto de perfil (avatar) funciona igual, pero en su propia
 * carpeta, public/avatars, para no mezclarla con las de las recetas.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const multer = require('multer');

const CARPETA = path.join(__dirname, '..', 'public', 'fotos');
const CARPETA_AVATARES = path.join(__dirname, '..', 'public', 'avatars');
const TAMANYO_MAXIMO = 5 * 1024 * 1024; //5 MB
const MAX_FOTOS = 6;                    //por receta
const TAMANYO_AVATAR = 2 * 1024 * 1024; //2 MB

const EXTENSIONES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
};

//Almacenamiento identico para fotos y avatares:  solo cambia la carpeta
function almacenamiento(carpeta) {
    return multer.diskStorage({
        destination: function (req, file, cb) {
            fs.mkdir(carpeta, { recursive: true }, function (err) {
                cb(err, carpeta);
            });
        },
        filename: function (req, file, cb) {
            const nombre = crypto.randomBytes(10).toString('hex') + EXTENSIONES[file.mimetype];
            cb(null, nombre);
        }
    });
}

const subida = multer({
    storage: almacenamiento(CARPETA),
    limits: { fileSize: TAMANYO_MAXIMO, files: MAX_FOTOS },
    fileFilter: function (req, file, cb) {
        if (EXTENSIONES[file.mimetype]) {
            return cb(null, true);
        }
        cb(new Error('tipo-no-permitido'));
    }
});

const subidaAvatar = multer({
    storage: almacenamiento(CARPETA_AVATARES),
    limits: { fileSize: TAMANYO_AVATAR, files: 1 },
    fileFilter: function (req, file, cb) {
        if (EXTENSIONES[file.mimetype]) {
            return cb(null, true);
        }
        cb(new Error('tipo-no-permitido'));
    }
});

/**
 * Middleware de subida de varias fotos a la vez (campo "fotos"). Si algo no
 * llega bien se anota el motivo en req.errorFotos y se sigue adelante, para
 * devolver el formulario con el mensaje en lugar de un error 500.
 */
function subirFotos(req, res, next) {
    subida.array('fotos', MAX_FOTOS)(req, res, function (err) {
        if (!err) return next();

        if (err.code === 'LIMIT_FILE_SIZE') {
            req.errorFotos = 'Cada foto no puede pesar mas de 5 MB';
        } else if (err.code === 'LIMIT_FILE_COUNT') {
            req.errorFotos = 'Puedes subir como maximo ' + MAX_FOTOS + ' fotos';
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.message === 'tipo-no-permitido') {
            req.errorFotos = 'Las fotos deben ser imagenes JPEG, PNG, WEBP o GIF';
        } else {
            req.errorFotos = 'No se han podido leer las fotos';
        }
        next();
    });
}

/**
 * Igual que subirFotos, pero con un unico archivo en el campo "avatar".
 */
function subirAvatar(req, res, next) {
    subidaAvatar.single('avatar')(req, res, function (err) {
        if (!err) return next();

        if (err.code === 'LIMIT_FILE_SIZE') {
            req.errorAvatar = 'La foto de perfil no puede pesar mas de 2 MB';
        } else if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.message === 'tipo-no-permitido') {
            req.errorAvatar = 'La foto de perfil debe ser una imagen JPEG, PNG, WEBP o GIF';
        } else {
            req.errorAvatar = 'No se ha podido leer la imagen';
        }
        next();
    });
}

/**
 * Nombres de las fotos de una subida (nada si no trajo ninguna).
 */
function nombresDe(files) {
    return (files || []).map(function (file) { return file.filename; });
}

/**
 * Borra una foto ya guardada. Se ignora el error: si no esta, no pasa nada.
 */
function borrarFoto(nombre) {
    if (!nombre) return Promise.resolve();
    return fs.promises.unlink(path.join(CARPETA, nombre)).catch(function () { });
}

/**
 * Borra varias de una vez.
 */
function borrarFotos(nombres) {
    return Promise.all((nombres || []).map(borrarFoto));
}

/**
 * Borra el avatar de una carpeta distinta a la de las fotos.
 */
function borrarAvatarDe(carpeta, nombre) {
    if (!nombre) return Promise.resolve();
    return fs.promises.unlink(path.join(carpeta, nombre)).catch(function () { });
}

module.exports = {
    subirFotos,
    subirAvatar,
    nombresDe,
    borrarFoto,
    borrarFotos,
    borrarAvatar: function (nombre) { return borrarAvatarDe(CARPETA_AVATARES, nombre); },
    MAX_FOTOS,
    CARPETA,
    CARPETA_AVATARES
};
