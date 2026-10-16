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
        preparacion: [
            'Sofrie la carne picada con cebolla y ajo hasta que dore.',
            'Añade el tomate y deja cocinar a fuego suave 20 minutos.',
            'Monta la lasaña alternando capas de pasta, carne, bechamel y queso.',
            'Hornea a 180 grados durante 30 minutos.'
        ],
        etiquetas: ['tradicional']
    },
    {
        titulo: 'Ensalada César', tiempo: 20, dificultad: 'facil', momento: 'comida',
        ingredientes: ['pollo', 'lechuga', 'parmesano', 'salsa césar'],
        preparacion: [
            'Cuece el pollo a la plancha y córtalo en tiras.',
            'Mezcla la lechuga con la salsa y el pollo.',
            'Termina con virutas de parmesano.'
        ],
        etiquetas: ['rapido', 'ligero']
    },
    {
        titulo: 'Tortilla de patatas', tiempo: 30, dificultad: 'facil', momento: 'comida',
        ingredientes: ['huevos', 'patata', 'cebolla', 'aceite'],
        preparacion: [
            'Corta la patata y la cebolla en láminas finas.',
            'Póchalas en aceite a fuego suave hasta que estén tiernas.',
            'Bate los huevos, mézclalos con la patata y cuaja por los dos lados.'
        ],
        etiquetas: ['tradicional', 'vegetariano']
    },
    {
        titulo: 'Paella valenciana', tiempo: 60, dificultad: 'media', momento: 'comida',
        ingredientes: ['arroz', 'pollo', 'conejo', 'judías verdes', 'azafrán'],
        preparacion: [
            'Dora las carnes en la paellera y resérvalas.',
            'Sofrie las verduras, añade el agua y deja hervir 30 minutos.',
            'Incorpora el arroz y el azafrán y cocínalo 18 minutos sin moverlo.'
        ],
        etiquetas: ['tradicional']
    },
    {
        titulo: 'Gazpacho andaluz', tiempo: 15, dificultad: 'facil', momento: 'comida',
        ingredientes: ['tomate', 'pepino', 'pimiento', 'ajo', 'aceite'],
        preparacion: [
            'Lava y pica todas las verduras.',
            'Tritúralas con el aceite y un chorrito de vinagre.',
            'Refrigera al menos dos horas antes de servir.'
        ],
        etiquetas: ['rapido', 'vegetariano', 'verano']
    },
    {
        titulo: 'Brownie de chocolate', tiempo: 45, dificultad: 'media', momento: 'postre',
        ingredientes: ['chocolate', 'mantequilla', 'huevo', 'harina', 'azúcar'],
        preparacion: [
            'Derrite el chocolate con la mantequilla al baño María.',
            'Bate los huevos con el azúcar e incorpora la mezcla de chocolate.',
            'Añade la harina y hornea a 180 grados durante 25 minutos.'
        ],
        etiquetas: ['dulce']
    },
    {
        titulo: 'Cocido madrileño', tiempo: 120, dificultad: 'dificil', momento: 'comida',
        ingredientes: ['garbanzos', 'pollo', 'lacón', 'chorizo', 'verduras'],
        preparacion: [
            'Deja los garbanzos en remojo la noche anterior.',
            'Cuece las carnes con las verduras y sube el fuego al final para dar sabor al caldo.',
            'Separa el caldo, los garbanzos y la carne antes de servir.'
        ],
        etiquetas: ['tradicional']
    },
    {
        titulo: 'Crema de calabaza', tiempo: 35, dificultad: 'facil', momento: 'comida',
        ingredientes: ['calabaza', 'cebolla', 'caldo'],
        preparacion: [
            'Sofrie la cebolla sin que se dore.',
            'Añade la calabaza en dados y el caldo, y cuece 20 minutos.',
            'Tritura hasta que quede fina y ajusta de sal.'
        ],
        etiquetas: ['vegetariano', 'ligero']
    },
    {
        titulo: 'Croquetas de jamón', tiempo: 50, dificultad: 'media', momento: 'cena',
        ingredientes: ['jamón', 'bechamel', 'harina', 'huevo', 'aceite'],
        preparacion: [
            'Prepara una bechamel espesa con la harina y la leche.',
            'Añade el jamón picado y deja enfriar la masa.',
            'Forma las croquetas, empanalízalas y fríelas.'
        ],
        etiquetas: ['tradicional']
    },
    {
        titulo: 'Pisto manchego', tiempo: 40, dificultad: 'facil', momento: 'cena',
        ingredientes: ['calabacín', 'tomate', 'pimiento', 'cebolla', 'huevo'],
        preparacion: [
            'Sofrie por separado las verduras en aceite de oliva.',
            'Junta todas con el tomate y cuece a fuego suave 15 minutos.',
            'Termina con un huevo frito encima.'
        ],
        etiquetas: ['vegetariano']
    },
    {
        titulo: 'Merluza al horno', tiempo: 35, dificultad: 'facil', momento: 'cena',
        ingredientes: ['merluza', 'patata', 'pimiento', 'aceite'],
        preparacion: [
            'Corta las patatas en rodajas finas y ponlas en la fuente.',
            'Coloca la merluza encima con pimiento y un buen chorro de aceite.',
            'Hornea a 200 grados durante 20 minutos.'
        ],
        etiquetas: ['ligero', 'pescado']
    },
    {
        titulo: 'Tarta de queso', tiempo: 60, dificultad: 'media', momento: 'postre',
        ingredientes: ['queso crema', 'huevo', 'azúcar', 'galleta'],
        preparacion: [
            'Tritura las galletas con mantequilla y forma la base.',
            'Bate el queso con el huevo y el azúcar hasta que quede homogéneo.',
            'Hornea a 180 grados y deja enfriar antes de desmoldar.'
        ],
        etiquetas: ['dulce']
    },
    {
        titulo: 'Fabada asturiana', tiempo: 110, dificultad: 'media', momento: 'comida',
        ingredientes: ['fabes', 'chorizo', 'morcilla', 'lacón'],
        preparacion: [
            'Remoja las fabes durante ocho horas.',
            'Cuezas con la carne y las verduras a fuego muy suave, sin que rompa el hervor.',
            'Saca la carne, tritura parte de las fabes y devuélvelas al caldo para espesar.'
        ],
        etiquetas: ['tradicional']
    },
    {
        titulo: 'Avena energética', tiempo: 10, dificultad: 'facil', momento: 'desayuno',
        ingredientes: ['avena', 'leche', 'plátano', 'miel'],
        preparacion: [
            'Remoja la avena en leche 5 minutos.',
            'Añade el plátano en rodillas y un hilo de miel.'
        ],
        etiquetas: ['rapido', 'fitness']
    },
    {
        titulo: 'Tortilla francesa', tiempo: 10, dificultad: 'facil', momento: 'desayuno',
        ingredientes: ['huevos', 'mantequilla', 'sal'],
        preparacion: [
            'Bate los huevos con una pizca de sal.',
            'Cuaja a fuego suave removiendo poco a poco.'
        ],
        etiquetas: ['rapido', 'vegetariano']
    },
    {
        titulo: 'Salmón a la plancha', tiempo: 20, dificultad: 'facil', momento: 'cena',
        ingredientes: ['salmón', 'limón', 'perejil', 'aceite'],
        preparacion: [
            'Sazona el salmón con sal, pimienta y perejil.',
            'Pocha dos minutos por cada lado en plancha bien caliente.',
            'Termina con unas gotas de limón.'
        ],
        etiquetas: ['fitness', 'ligero', 'pescado']
    },
    {
        titulo: 'Pollo al curry', tiempo: 35, dificultad: 'media', momento: 'cena',
        ingredientes: ['pollo', 'curry', 'leche de coco', 'arroz', 'cebolla'],
        preparacion: [
            'Dora el pollo y resérvalo.',
            'Sofrie la cebolla con el curry, añade la leche de coco y el pollo.',
            'Cuece 15 minutos y sirve sobre arroz.'
        ],
        etiquetas: ['picante']
    },
    {
        titulo: 'Quiche lorraine', tiempo: 55, dificultad: 'media', momento: 'comida',
        ingredientes: ['masa', 'huevos', 'nata', 'beicon', 'queso'],
        preparacion: [
            'Extiende la masa en el molde y pincha el fondo.',
            'Mezcla los huevos con la nata, el beicon y el queso.',
            'Hornea a 180 grados durante 35 minutos.'
        ],
        etiquetas: []
    },
    {
        titulo: 'Flan de huevo', tiempo: 40, dificultad: 'facil', momento: 'postre',
        ingredientes: ['huevos', 'leche', 'azúcar', 'caramelo'],
        preparacion: [
            'Prepara el caramelo y repártelo en los moldes.',
            'Bate los huevos con la leche y el azúcar.',
            'Cuece al baño María 40 minutos y refrigera antes de desmoldar.'
        ],
        etiquetas: ['dulce', 'tradicional']
    },
    {
        titulo: 'Batido de frutas', tiempo: 5, dificultad: 'facil', momento: 'desayuno',
        ingredientes: ['plátano', 'fresa', 'yogur', 'miel'],
        preparacion: [
            'Lava y pica las frutas.',
            'Tritúralas con el yogur y la miel hasta que quede cremoso.'
        ],
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
            await gestorDB.insertarReceta(Object.assign({}, receta, {
                autor: USUARIO.username,
                creadaEn: new Date()
            }));
        }
        console.log('Insertadas ' + RECETAS.length + ' recetas de ejemplo.');
    }

    //Recetas anteriores a la autoria:  sin autor no puede editarlas nadie, asi
    //que se las asignamos al usuario de ejemplo
    const sinAutor = await gestorDB.obtenerRecetas({ autor: { $exists: false } });
    for (const receta of sinAutor) {
        await gestorDB.actualizarReceta({ _id: receta._id }, { autor: USUARIO.username });
    }
    if (sinAutor.length > 0) {
        console.log('Asignadas ' + sinAutor.length + ' recetas antiguas a "' + USUARIO.username + '".');
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
