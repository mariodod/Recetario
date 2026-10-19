const { MongoClient, ObjectId } = require('mongodb');

/**
 * Capa de acceso a datos sobre MongoDB (driver oficial v7, solo promesas).
 *
 * Los metodos devuelven promesas, de modo que en las rutas se usan con
 * async/await. Si algo falla la promesa se rechaza y Express (v5) la
 * encarga automaticamente al manejador de errores.
 *
 * Los criterios son los de MongoDB ({ }, { campo: valor }, { campo: { $gte:
 * 31 } }, { campo: { $in: [...] } }, { $or: [...] }...).
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
 * Busca varias recetas por sus ids y las devuelve en el mismo orden en que
 * se pidieron. Los ids que no sean ids o no existan se ignoran.
 */
async function buscarRecetasPorIds(ids) {
    const oids = [];
    for (const id of ids) {
        try {
            oids.push(new ObjectId(id));
        } catch (err) {
            //Id erroneo: se ignora
        }
    }
    if (oids.length === 0) {
        return [];
    }

    const encontradas = await coleccion('recetas').find({ _id: { $in: oids } }).toArray();
    const porId = new Map(encontradas.map(function (receta) { return [String(receta._id), receta]; }));
    return ids.map(function (id) { return porId.get(String(id)); }).filter(Boolean);
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

        //Un favorito y una valoracion por usuario y receta:  el indice unico
        //evita duplicados aunque dos peticiones lleguen a la vez
        await db.collection('favoritos').createIndex({ usuario: 1, receta: 1 }, { unique: true });
        await db.collection('valoraciones').createIndex({ usuario: 1, receta: 1 }, { unique: true });

        //Una semana del menu por usuario y lunes, tambien sin duplicados
        await db.collection('semanas').createIndex({ usuario: 1, semana: 1 }, { unique: true });

        //Los comentarios se listan por receta, del mas reciente al antiguo
        await db.collection('comentarios').createIndex({ receta: 1, creadaEn: -1 });

        //Busqueda textual sobre titulo, etiquetas, ingredientes y preparacion.
        //El peso decide cuanta mas relevancia tiene un acierto en cada campo y
        //el stemmer en espanol busca por raiz, asi que 'cocinar', 'cocina' y
        //'cocinando' dan con la misma receta.
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
     * Sustituye o agrega los nuevos atributos al documento.
     * Devuelve el numero de documentos afectados.
     */
    actualizarReceta: async function (criterio, receta) {
        const resultado = await coleccion('recetas').updateOne(criterio, { $set: receta });
        return resultado.matchedCount;
    },

    /**
     * Quita un campo de todas las recetas que lo traigan. Para las
     * migraciones del seed.
     */
    quitarCampoDeRecetas: async function (campo) {
        const resultado = await coleccion('recetas').updateMany({}, { $unset: { [campo]: '' } });
        return resultado.modifiedCount;
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
     * Varias recetas por sus ids, manteniendo el orden pedido.
     */
    obtenerRecetasPorIds: async function (ids) {
        return buscarRecetasPorIds(ids);
    },

    /**
     * Favoritos de un usuario. Devuelve sus recetas completas, de la mas
     * recientemente guardada a la mas antigua.
     */
    obtenerFavoritos: async function (usuario) {
        const favoritos = await coleccion('favoritos')
            .find({ usuario: usuario }, { sort: { creadaEn: -1 } })
            .toArray();
        return buscarRecetasPorIds(favoritos.map(function (favorito) { return favorito.receta; }));
    },

    insertarFavorito: async function (usuario, receta) {
        await coleccion('favoritos').updateOne(
            { usuario: usuario, receta: receta },
            { $setOnInsert: { usuario: usuario, receta: receta, creadaEn: new Date() } },
            { upsert: true }
        );
    },

    borrarFavorito: async function (usuario, receta) {
        await coleccion('favoritos').deleteOne({ usuario: usuario, receta: receta });
    },

    esFavorito: async function (usuario, receta) {
        if (!usuario) return false;
        const favorito = await coleccion('favoritos').findOne({ usuario: usuario, receta: receta });
        return Boolean(favorito);
    },

    borrarFavoritosDe: async function (usuario) {
        const resultado = await coleccion('favoritos').deleteMany({ usuario: usuario });
        return resultado.deletedCount;
    },

    borrarValoracionesDe: async function (usuario) {
        const resultado = await coleccion('valoraciones').deleteMany({ usuario: usuario });
        return resultado.deletedCount;
    },

    /**
     * Borra los favoritos y las valoraciones que apunten a esas recetas
     * (los de los demas usuarios):  se usa al borrar una cuenta con sus
     * recetas. Devuelve cuantos documentos de cada uno se han ido.
     */
    borrarFavoritosYValoracionesDeRecetas: async function (ids) {
        const criterio = { receta: { $in: ids } };
        const [favoritos, valoraciones] = await Promise.all([
            coleccion('favoritos').deleteMany(criterio),
            coleccion('valoraciones').deleteMany(criterio)
        ]);
        return { favoritos: favoritos.deletedCount, valoraciones: valoraciones.deletedCount };
    },

    /**
     * Guarda la valoracion de un usuario (una sola por receta: la ultima
     * votacion manda).
     */
    guardarValoracion: async function (usuario, receta, estrellas) {
        await coleccion('valoraciones').updateOne(
            { usuario: usuario, receta: receta },
            { $set: { usuario: usuario, receta: receta, estrellas: estrellas, valoradaEn: new Date() } },
            { upsert: true }
        );
    },

    /**
     * Resumen de las valoraciones de una receta:  media, cuantas hay y
     * cual es la del usuario actual (0 si aun no ha valorado).
     */
    obtenerValoracion: async function (receta, usuario) {
        const [resumen, mia] = await Promise.all([
            coleccion('valoraciones').aggregate([
                { $match: { receta: receta } },
                { $group: { _id: '$receta', media: { $avg: '$estrellas' }, total: { $sum: 1 } } }
            ]).toArray(),
            usuario
                ? coleccion('valoraciones').findOne({ receta: receta, usuario: usuario })
                : Promise.resolve(null)
        ]);

        return {
            media: resumen[0] ? Math.round(resumen[0].media * 10) / 10 : 0,
            entera: resumen[0] ? Math.round(resumen[0].media) : 0,
            total: resumen[0] ? resumen[0].total : 0,
            mia: mia ? mia.estrellas : 0
        };
    },

    /**
     * Comentarios de una receta, del mas reciente al antiguo y sin pasar
     * de los ultimos 50:  nadie pasa de ahi leyendo. El id de la receta se
     * guarda como texto, como en favoritos y valoraciones.
     */
    insertarComentario: async function (comentario) {
        await coleccion('comentarios').insertOne(comentario);
        return comentario;
    },

    obtenerComentarios: async function (receta, limite = 50) {
        return coleccion('comentarios')
            .find({ receta: String(receta) })
            .sort({ creadaEn: -1 })
            .limit(limite)
            .toArray();
    },

    obtenerComentario: async function (id) {
        let oid;
        try {
            oid = new ObjectId(id);
        } catch (err) {
            return null;
        }
        return coleccion('comentarios').findOne({ _id: oid });
    },

    borrarComentario: async function (id) {
        let oid;
        try {
            oid = new ObjectId(id);
        } catch (err) {
            return 0;
        }
        const resultado = await coleccion('comentarios').deleteOne({ _id: oid });
        return resultado.deletedCount;
    },

    /**
     * Los comentarios se borran con su receta y con su autor:  se usan al
     * borrar una receta o una cuenta entera.
     */
    borrarComentariosDe: async function (usuario) {
        const resultado = await coleccion('comentarios').deleteMany({ usuario: usuario });
        return resultado.deletedCount;
    },

    borrarComentariosDeRecetas: async function (ids) {
        const resultado = await coleccion('comentarios').deleteMany({ receta: { $in: ids } });
        return resultado.deletedCount;
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
     * Solo los nombres de usuario, ordenados. Para el selector de ceder la
     * autoría y para el filtro del listado: nunca se pasa la contrasena ni
     * la sal a las plantillas.
     */
    obtenerNombresDeUsuario: async function () {
        const usuarios = await coleccion('usuarios')
            .find({}, { projection: { username: 1 } })
            .sort({ username: 1 })
            .toArray();
        return usuarios.map(function (usuario) { return usuario.username; });
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
    },

    /**
     * Actualiza campos de un usuario (nunca se le pasa la contrasena por
     * aqui sin haberla hasheado antes en la ruta).
     */
    actualizarUsuario: async function (criterio, campos) {
        const resultado = await coleccion('usuarios').updateOne(criterio, { $set: campos });
        return resultado.matchedCount;
    },

    /**
     * La semana del menu de un usuario (la del lunes dado), o null si aun
     * no ha montado ninguna.
     */
    obtenerSemana: async function (usuario, semana) {
        return coleccion('semanas').findOne({ usuario: usuario, semana: semana });
    },

    /**
     * Guarda (o sustituye) la semana del menu de un usuario. Los platos
     * llegan ya montados desde la ruta:  { 'YYYY-MM-DD': { comida: [ids] } }.
     */
    guardarSemana: async function (usuario, semana, platos) {
        await coleccion('semanas').updateOne(
            { usuario: usuario, semana: semana },
            {
                $set: { usuario: usuario, semana: semana, platos: platos, actualizadaEn: new Date() },
                $setOnInsert: { creadaEn: new Date() }
            },
            { upsert: true }
        );
        return semana;
    },

    /**
     * Borra una semana concreta del menu de un usuario.
     */
    borrarSemana: async function (usuario, semana) {
        const resultado = await coleccion('semanas').deleteMany({ usuario: usuario, semana: semana });
        return resultado.deletedCount;
    },

    /**
     * Borra todas las semanas del menu de un usuario (al borrar la cuenta).
     */
    borrarSemanasDe: async function (usuario) {
        const resultado = await coleccion('semanas').deleteMany({ usuario: usuario });
        return resultado.deletedCount;
    }
};
