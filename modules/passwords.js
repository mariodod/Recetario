const crypto = require('node:crypto');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);

/**
 * Hash de contrasenas con scrypt (funcion derivada de proposito general)
 * y sal aleatoria por usuario. Se guarda como "sal:hash" en hexadecimal.
 */
async function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = await scrypt(password, salt, 64);
    return salt + ':' + hash.toString('hex');
}

/**
 * Compara en tiempo constante la contrasena introducida con el hash guardado.
 * Devuelve false si el formato almacenado no es valido.
 */
async function verifyPassword(password, almacenado) {
    if (typeof almacenado !== 'string') return false;

    const [salt, hash] = almacenado.split(':');
    if (!salt || !hash) return false;

    const hashIntroducido = Buffer.from(hash, 'hex');
    const hashCalculado = await scrypt(password, salt, 64);

    if (hashIntroducido.length !== hashCalculado.length) return false;
    return crypto.timingSafeEqual(hashIntroducido, hashCalculado);
}

module.exports = { hashPassword, verifyPassword };
