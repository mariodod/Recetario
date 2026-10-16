/**
 * Carga de datos de ejemplo:  recetas + un usuario de prueba.
 *
 *   npm run seed
 *
 * Solo inserta lo que no exista ya, asi que se puede ejecutar varias veces.
 */
require('dotenv').config();

const gestorDB = require('../modules/gestorDB.js');
const { hashPassword } = require('../modules/passwords.js');

const RECETAS = [
    { titulo: 'Lasaña de la abuela', tiempo: 75, dificultad: 'media' },
    { titulo: 'Ensalada César', tiempo: 20, dificultad: 'facil' },
    { titulo: 'Tortilla de patatas', tiempo: 30, dificultad: 'facil' },
    { titulo: 'Paella valenciana', tiempo: 60, dificultad: 'media' },
    { titulo: 'Gazpacho andaluz', tiempo: 15, dificultad: 'facil' },
    { titulo: 'Brownie de chocolate', tiempo: 45, dificultad: 'media' },
    { titulo: 'Cocido madrileño', tiempo: 120, dificultad: 'dificil' },
    { titulo: 'Crema de calabaza', tiempo: 35, dificultad: 'facil' },
    { titulo: 'Croquetas de jamón', tiempo: 50, dificultad: 'media' },
    { titulo: 'Pisto manchego', tiempo: 40, dificultad: 'facil' },
    { titulo: 'Merluza al horno', tiempo: 35, dificultad: 'facil' },
    { titulo: 'Tarta de queso', tiempo: 60, dificultad: 'media' },
    { titulo: 'Fabada asturiana', tiempo: 110, dificultad: 'media' }
];

const USUARIO = {
    username: 'mario',
    password: process.env.SEED_PASSWORD || 'recetario123'
};

async function main() {
    gestorDB.init(process.env.MONGODB_URI || 'mongodb://localhost:27017/recetario');
    await gestorDB.connect();

    //Recetas
    const existentes = await gestorDB.obtenerRecetas({});
    if (existentes.length > 0) {
        console.log('Ya hay ' + existentes.length + ' recetas: no se inserta ninguna.');
    } else {
        for (const receta of RECETAS) {
            await gestorDB.insertarReceta(Object.assign({}, receta, { creadaEn: new Date() }));
        }
        console.log('Insertadas ' + RECETAS.length + ' recetas de ejemplo.');
    }

    //Usuario de prueba
    const usuarios = await gestorDB.obtenerUsuarios({ username: USUARIO.username });
    if (usuarios.length > 0) {
        console.log('El usuario "' + USUARIO.username + '" ya existe.');
    } else {
        await gestorDB.insertarUsuario({
            username: USUARIO.username,
            password: await hashPassword(USUARIO.password),
            creadaEn: new Date()
        });
        console.log('Creado el usuario "' + USUARIO.username + '" con la contrasena "' + USUARIO.password + '".');
    }

    await gestorDB.close();
}

main().catch(function (err) {
    console.error('Error al cargar los datos de ejemplo: ' + err.message);
    process.exit(1);
});
