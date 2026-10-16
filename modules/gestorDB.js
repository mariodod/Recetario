const { MongoClient, ObjectId } = require('mongodb');

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

        //Busqueda textual sobre titulo, etiquetas, ingredientes y preparacion.
        //El peso decide cuanta mas relevancia tiene un acierto en cada campo y
        //el idioma espanol descarta las palabras vacias (de, la, con...).
        await db.collection('recetas').createIndex(
            { titulo: 'text', etiquetas: 'text', ingredientes: 'text', preparacion: 'text' },
            {
                name: 'busqueda_textual',
                default_language: 'spanish',
                weights: { titulo: 10, etiquetas: 5, ingredientes: 3, preparacion: 1 }
            }
        );
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
     * Con `orden` se puede cambiar el criterio de ordenacion; para la
     * busqueda textual se ordena por relevancia con { score: { $meta:
     * 'textScore' } }.
     */
    obtenerRecetasPg: async function (criterio = {}, pg = 1, orden = null) {
        const recetas = coleccion('recetas');
        let consulta = recetas.find(criterio);
        if (orden) {
            consulta = consulta.sort(orden);
        }

        const [total, pagina] = await Promise.all([
            recetas.countDocuments(criterio),
            consulta.skip((pg - 1) * 10).limit(10).toArray()
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
     * Devuelve una receta por su id, o null si el id no es valido o no
     * existe.
     */
    obtenerRecetaPorId: async function (id) {
        let oid;
        try {
            oid = new ObjectId(id);
        } catch (err) {
            return null;
        }

        const recetas = await coleccion('recetas').find({ _id: oid }).limit(1).toArray();
        return recetas[0] || null;
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
     * Devuelve recetas relacionadas con la dada:  las que comparten etiquetas
     * o ingredientes, por ese orden de importancia, la propia receta siempre
     * fuera y un numero limitado de resultados.
     */
    obtenerRecetasRelacionadas: async function (receta, limite = 4) {
        const etiquetas = receta.etiquetas || [];
        const ingredientes = receta.ingredientes || [];

        if (etiquetas.length === 0 && ingredientes.length === 0) {
            return [];
        }

        return coleccion('recetas').aggregate([
            {
                $match: {
                    _id: { $ne: receta._id },
                    $or: [
                        { etiquetas: { $in: etiquetas } },
                        { ingredientes: { $in: ingredientes } }
                    ]
                }
            },
            {
                //Cuenta lo que comparten:  cada etiqueta y cada ingrediente
                //comun suma uno, y las que mas suman salen primero
                $addFields: {
                    coincidencias: {
                        $add: [
                            { $size: { $setIntersection: [{ $ifNull: ['$etiquetas', []] }, etiquetas] } },
                            { $size: { $setIntersection: [{ $ifNull: ['$ingredientes', []] }, ingredientes] } }
                        ]
                    }
                }
            },
            { $sort: { coincidencias: -1, titulo: 1 } },
            { $limit: limite },
            { $project: { coincidencias: 0 } }
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
