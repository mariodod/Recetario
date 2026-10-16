/**
 * Carga de datos de ejemplo:  recetas, etiquetas y un usuario de prueba.
 *
 *   npm run seed
 *
 * Solo inserta lo que no exista ya, asi que se puede ejecutar varias veces.
 */
require('dotenv').config();

const gestorDB = require('../modules/gestorDB.js');
const { hashPassword } = require('../modules/passwords.js');

const RECETAS = [
    {
        titulo: 'Lasaña de la abuela', tiempo: 75, dificultad: 'media', momento: 'comida',
        ingredientes: ['lasaña', 'carne picada', 'bechamel', 'tomate', 'queso'],
        etiquetas: ['tradicional']
    },
    {
        titulo: 'Ensalada César', tiempo: 20, dificultad: 'facil', momento: 'comida',
        ingredientes: ['pollo', 'lechuga', 'parmesano', 'salsa césar'],
        etiquetas: ['rapido', 'ligero']
    },
    {
        titulo: 'Tortilla de patatas', tiempo: 30, dificultad: 'facil', momento: 'comida',
        ingredientes: ['huevos', 'patata', 'cebolla', 'aceite'],
        etiquetas: ['tradicional', 'vegetariano']
    },
    {
        titulo: 'Paella valenciana', tiempo: 60, dificultad: 'media', momento: 'comida',
        ingredientes: ['arroz', 'pollo', 'conejo', 'judías verdes', 'azafrán'],
        etiquetas: ['tradicional']
    },
    {
        titulo: 'Gazpacho andaluz', tiempo: 15, dificultad: 'facil', momento: 'comida',
        ingredientes: ['tomate', 'pepino', 'pimiento', 'ajo', 'aceite'],
        etiquetas: ['rapido', 'vegetariano', 'verano']
    },
    {
        titulo: 'Brownie de chocolate', tiempo: 45, dificultad: 'media', momento: 'postre',
        ingredientes: ['chocolate', 'mantequilla', 'huevo', 'harina', 'azúcar'],
        etiquetas: ['dulce']
    },
    {
        titulo: 'Cocido madrileño', tiempo: 120, dificultad: 'dificil', momento: 'comida',
        ingredientes: ['garbanzos', 'pollo', 'lacón', 'chorizo', 'verduras'],
        etiquetas: ['tradicional']
    },
    {
        titulo: 'Crema de calabaza', tiempo: 35, dificultad: 'facil', momento: 'comida',
        ingredientes: ['calabaza', 'cebolla', 'caldo'],
        etiquetas: ['vegetariano', 'ligero']
    },
    {
        titulo: 'Croquetas de jamón', tiempo: 50, dificultad: 'media', momento: 'cena',
        ingredientes: ['jamón', 'bechamel', 'harina', 'huevo', 'aceite'],
        etiquetas: ['tradicional']
    },
    {
        titulo: 'Pisto manchego', tiempo: 40, dificultad: 'facil', momento: 'cena',
        ingredientes: ['calabacín', 'tomate', 'pimiento', 'cebolla', 'huevo'],
        etiquetas: ['vegetariano']
    },
    {
        titulo: 'Merluza al horno', tiempo: 35, dificultad: 'facil', momento: 'cena',
        ingredientes: ['merluza', 'patata', 'pimiento', 'aceite'],
        etiquetas: ['ligero', 'pescado']
    },
    {
        titulo: 'Tarta de queso', tiempo: 60, dificultad: 'media', momento: 'postre',
        ingredientes: ['queso crema', 'huevo', 'azúcar', 'galleta'],
        etiquetas: ['dulce']
    },
    {
        titulo: 'Fabada asturiana', tiempo: 110, dificultad: 'media', momento: 'comida',
        ingredientes: ['fabes', 'chorizo', 'morcilla', 'lacón'],
        etiquetas: ['tradicional']
    },
    {
        titulo: 'Avena energética', tiempo: 10, dificultad: 'facil', momento: 'desayuno',
        ingredientes: ['avena', 'leche', 'plátano', 'miel'],
        etiquetas: ['rapido', 'fitness']
    },
    {
        titulo: 'Tortilla francesa', tiempo: 10, dificultad: 'facil', momento: 'desayuno',
        ingredientes: ['huevos', 'mantequilla', 'sal'],
        etiquetas: ['rapido', 'vegetariano']
    },
    {
        titulo: 'Salmón a la plancha', tiempo: 20, dificultad: 'facil', momento: 'cena',
        ingredientes: ['salmón', 'limón', 'perejil', 'aceite'],
        etiquetas: ['fitness', 'ligero', 'pescado']
    },
    {
        titulo: 'Pollo al curry', tiempo: 35, dificultad: 'media', momento: 'cena',
        ingredientes: ['pollo', 'curry', 'leche de coco', 'arroz', 'cebolla'],
        etiquetas: ['picante']
    },
    {
        titulo: 'Quiche lorraine', tiempo: 55, dificultad: 'media', momento: 'comida',
        ingredientes: ['masa', 'huevos', 'nata', 'beicon', 'queso'],
        etiquetas: []
    },
    {
        titulo: 'Flan de huevo', tiempo: 40, dificultad: 'facil', momento: 'postre',
        ingredientes: ['huevos', 'leche', 'azúcar', 'caramelo'],
        etiquetas: ['dulce', 'tradicional']
    },
    {
        titulo: 'Batido de frutas', tiempo: 5, dificultad: 'facil', momento: 'desayuno',
        ingredientes: ['plátano', 'fresa', 'yogur', 'miel'],
        etiquetas: ['rapido', 'fitness', 'vegetariano']
    }
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

    //Etiquetas usadas por las recetas, para el filtro y el autocompletado
    const etiquetas = new Set();
    for (const receta of RECETAS) {
        for (const etiqueta of receta.etiquetas) {
            etiquetas.add(etiqueta);
        }
    }
    for (const nombre of etiquetas) {
        await gestorDB.insertarEtiqueta(nombre);
    }
    console.log('Guardadas ' + etiquetas.size + ' etiquetas.');

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
