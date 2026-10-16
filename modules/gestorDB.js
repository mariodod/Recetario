const { MongoClient } = require('mongodb');

/**
 * Capa de acceso a datos sobre MongoDB (driver oficial v7, solo promesas).
 *
 * Los metodos devuelven promesas, de modo que en las rutas se usan con
 * async/await. Si algo falla la promesa se rechaza y Express (v5) la
 * encarga automaticamente al manejador de errores.
 *
 * Criterios de busqueda (query modifiers de MongoDB):
 *  - {} -> todos los documentos
 *  - {'tipo' : 'casa'} -> tipo casa
 *  - {'tipo' : 'casa' , 'metros' : 100} -> tipo casa y metros = 100 (igual que AND)
 *  - {'precio' : {$gte:31}} -> precio >= 31
 *      - $gt -> mayor que '>'
 *      - $gte -> mayor o igual '>='
 *      - $lt -> menor que '<'
 *      - $lte -> menor o igual '<='
 *      - $in -> valor contenido en un array
 *      - $nin -> valor NO contenido en un array
 *  - {$or:[{'edad':20}, {'edad':30}]} -> edad = 20 OR 30
 *  - {$and:[{'edad':20}, {'empresa':'Google'}]} -> edad = 20 AND empresa = Google
 */

let client = null;
let uri = null;

/**
 * Devuelve la coleccion solicitada. El nombre de la base de datos se toma
 * de la propia cadena de conexion (mongodb://host:puerto/nombreDB).
 */
function coleccion(nombre) {
    if (!client) {
        throw new Error('gestorDB no esta conectado: llama a gestorDB.connect() antes de usar la base de datos.');
    }
    return client.db().collection(nombre);
}

/**
 * Indices de la base de datos. Un indice unico evita usuarios o etiquetas
 * duplicadas aunque dos peticiones lleguen a la vez. Si ya existen indices
 * incompatibles se avisa pero no se bloquea el arranque.
 */
async function crearIndices() {
    const db = client.db();
    try {
        await db.collection('usuarios').createIndex({ username: 1 }, { unique: true });
        await db.collection('etiquetas').createIndex({ nombre: 1 }, { unique: true });
        await db.collection('recetas').createIndex({ momento: 1 });
        await db.collection('recetas').createIndex({ etiquetas: 1 });
    } catch (err) {
        console.warn('Aviso al crear los indices de MongoDB: ' + err.message);
    }
}

module.exports = {
    /**
     * Guarda la cadena de conexion. Se llama una sola vez al arrancar.
     */
    init: function (conexion) {
        uri = conexion;
    },

    /**
     * Abre el cliente compartido por toda la aplicacion. El driver gestiona
     * el pool de conexiones:  se conecta una vez y se reutiliza.
     */
    connect: async function () {
        if (client) return client;
        client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
        await client.connect();
        await crearIndices();
        return client;
    },

    close: async function () {
        if (client) {
            await client.close();
            client = null;
        }
    },

    /**
     * Inserta una receta y devuelve su _id.
     */
    insertarReceta: async function (receta) {
        const resultado = await coleccion('recetas').insertOne(receta);
        return resultado.insertedId;
    },

    /**
     * Elimina todos los documentos que coinciden con el criterio.
     * Devuelve el numero de documentos eliminados.
     */
    eliminarReceta: async function (criterio) {
        const resultado = await coleccion('recetas').deleteMany(criterio);
        return resultado.deletedCount;
    },

    /**
     * Sustituye completamente los documentos que coinciden con el criterio
     * por la nueva receta. Devuelve el numero de documentos sustituidos.
     */
    reemplazarReceta: async function (criterio, receta) {
        const resultado = await coleccion('recetas').replaceOne(criterio, receta);
        return resultado.matchedCount;
    },

    /**
     * Sustituye o agrega los nuevos atributos al documento.
     * Devuelve el numero de documentos afectados.
     */
    actualizarReceta: async function (criterio, receta) {
        const resultado = await coleccion('recetas').updateOne(criterio, { $set: receta });
        return resultado.matchedCount;
    },

    /**
     * Devuelve todas las recetas que coinciden con el criterio.
     * Con `opciones` se puede, por ejemplo, reducir los campos devueltos:
     *   obtenerRecetas({}, { projection: { titulo: 1, tiempo: 1 } })
     */
    obtenerRecetas: async function (criterio = {}, opciones = {}) {
        return coleccion('recetas').find(criterio, opciones).toArray();
    },

    /**
     * Devuelve una pagina de 10 recetas junto al total de documentos que
     * cumplen el criterio (necesario para calcular la ultima pagina).
     */
    obtenerRecetasPg: async function (criterio = {}, pg = 1) {
        const recetas = coleccion('recetas');
        const [total, pagina] = await Promise.all([
            recetas.countDocuments(criterio),
            recetas.find(criterio).skip((pg - 1) * 10).limit(10).toArray()
        ]);
        return { recetas: pagina, total: total };
    },

    /**
     * Inserta un usuario y devuelve su _id.
     */
    insertarUsuario: async function (usuario) {
        const resultado = await coleccion('usuarios').insertOne(usuario);
        return resultado.insertedId;
    },

    /**
     * Devuelve n recetas al azar entre las que cumplen el criterio.
     * Se hace en la propia base de datos con $sample.
     */
    obtenerRecetasAleatorias: async function (criterio = {}, n = 3) {
        return coleccion('recetas').aggregate([
            { $match: criterio },
            { $sample: { size: n } }
        ]).toArray();
    },

    /**
     * Guarda una etiqueta si no existia ya. Devuelve su nombre.
     * El indice unico sobre 'nombre' garantiza que no se duplique.
     */
    insertarEtiqueta: async function (nombre) {
        await coleccion('etiquetas').updateOne(
            { nombre: nombre },
            { $setOnInsert: { nombre: nombre, creadaEn: new Date() } },
            { upsert: true }
        );
        return nombre;
    },

    /**
     * Devuelve todas las etiquetas conocidas, ordenadas.
     */
    obtenerEtiquetas: async function () {
        return coleccion('etiquetas').find({}, { sort: { nombre: 1 } }).toArray();
    },

    /**
     * Devuelve los ingredientes distintos que ya aparecen en alguna receta.
     */
    obtenerIngredientes: async function () {
        const ingredientes = await coleccion('recetas').distinct('ingredientes');
        return ingredientes.sort(function (a, b) { return a.localeCompare(b, 'es'); });
    },

    /**
     * Devuelve todos los usuarios que coinciden con el criterio.
     */
    obtenerUsuarios: async function (criterio = {}) {
        return coleccion('usuarios').find(criterio).toArray();
    },

    /**
     * Borra la etiqueta del listado general (no toca las recetas).
     */
    borrarEtiqueta: async function (nombre) {
        const resultado = await coleccion('etiquetas').deleteOne({ nombre: nombre });
        return resultado.deletedCount;
    },

    /**
     * Borra los usuarios que coinciden con el criterio.
     */
    borrarUsuario: async function (criterio) {
        const resultado = await coleccion('usuarios').deleteMany(criterio);
        return resultado.deletedCount;
    }
};
