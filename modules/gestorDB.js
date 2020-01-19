module.exports = {
    app: null,
    mongo: null,
    init: function (app, mongo) {
        this.app = app;
        this.mongo = mongo;
    },
    insertarReceta: function (receta, callback) {
        this.mongo.MongoClient.connect(this.app.get('db'), function (err, db) {
            if (err) {
                callback(null);
            } else {
                var recetas = db.collection('recetas');
                /**
                 * insertedCount-> numero de documentos insertados
                 * ops -> array con los documentos insertados
                 * insertedIds -> array con los _id de los documentos insertados
                 */
                recetas.insert(receta, function (err, result) {
                    if (err) {
                        callback(null);
                    } else {
                        callback(result.ops[0]._id);
                    }
                    db.close();
                });
            }
        });
    },
    eliminarReceta: function (criterio, callback) {
        this.mongo.MongoClient.connect(this.app.get('db'), function (err, db) {
            if (err) {
                callback(null);
            } else {
                var recetas = db.collection('recetas');
                /**
                 * Criterios:
                 *  - {'tipo' : 'casa'} -> tipo casa
                 *  - {'precio' : {$gte:31}} -> precio >= 31
                 *      - $gt -> mayor que '>'
                 *      - $gte -> mayor o igual '>='
                 *      - $lt -> menor que '<'
                 *      - $lte -> menor o igual '<='
                 *  - {$or:[{'edad':20}, {'edad':30}, {'edad':40}]} -> edad = 20 OR 30 OR 40
                 *  - {$and:[{'edad':20}, {'empresa':''Google}]} -> edad = 20 AND empresa = Google 
                 */
                recetas.remove(criterio, function (err, obj) {
                    if (err) {
                        callback(null);
                    } else {
                        callback(obj.result.n);
                    }
                    db.close();
                });
            }
        });
    },
    /**
     * Sustituye completamente los documentos que coiciden con el criterio de busqueda por el nuevo
     */
    reemplazarReceta: function (criterio, receta, callback) {
        this.mongo.MongoClient.connect(this.app.get('db'), function (err, db) {
            if (err) {
                callback(null);
            } else {
                var recetas = db.collection('recetas');
                /**
                 * Criterios:
                 *  - {'tipo' : 'casa'} -> tipo casa
                 *  - {'precio' : {$gte:31}} -> precio >= 31
                 *      - $gt -> mayor que '>'
                 *      - $gte -> mayor o igual '>='
                 *      - $lt -> menor que '<'
                 *      - $lte -> menor o igual '<='
                 *  - {$or:[{'edad':20}, {'edad':30}, {'edad':40}]} -> edad = 20 OR 30 OR 40
                 *  - {$and:[{'edad':20}, {'empresa':''Google}]} -> edad = 20 AND empresa = Google 
                 */
                recetas.update(criterio, receta, function (err, obj) {
                    if (err) {
                        callback(null);
                    } else {
                        callback(obj.result.n);
                    }
                    db.close();
                });
            }
        });
    },
    /**
     * Sustituye o agrega los nuevos atributos al documento
     */
    actualizarReceta: function (criterio, receta, callback) {
        this.mongo.MongoClient.connect(this.app.get('db'), function (err, db) {
            if (err) {
                callback(null);
            } else {
                var recetas = db.collection('recetas');
                /**
                 * Criterios:
                 *  - {'tipo' : 'casa'} -> tipo casa
                 *  - {'precio' : {$gte:31}} -> precio >= 31
                 *      - $gt -> mayor que '>'
                 *      - $gte -> mayor o igual '>='
                 *      - $lt -> menor que '<'
                 *      - $lte -> menor o igual '<='
                 *  - {$or:[{'edad':20}, {'edad':30}, {'edad':40}]} -> edad = 20 OR 30 OR 40
                 *  - {$and:[{'edad':20}, {'empresa':''Google}]} -> edad = 20 AND empresa = Google 
                 */
                recetas.update(criterio, { $set: receta }, function (err, obj) {
                    if (err) {
                        callback(null);
                    } else {
                        callback(obj.result.n);
                    }
                    db.close();
                });
            }
        });
    },
    obtenerRecetas: function (criterio, callback) {
        this.mongo.MongoClient.connect(this.app.get('db'), function (err, db) {
            if (err) {
                callback(null);
            } else {
                var recetas = db.collection('recetas');
                /**
                 * Criterios:
                 *  - {} -> todos los documentos
                 *  - {'tipo' : 'casa'} -> tipo casa
                 *  - {'tipo' : 'casa' , 'metros' : 100} -> tipo casa y metros = 100 igual que AND
                 *  - {'precio' : {$gte:31}} -> precio >= 31
                 *      - $gt -> mayor que '>'
                 *      - $gte -> mayor o igual '>='
                 *      - $lt -> menor que '<'
                 *      - $lte -> menor o igual '<='
                 *      - $in -> valor contenido en un array
                 *      - $nin -> valor NO contenido en un array
                 *  - {$or:[{'edad':20}, {'edad':30}, {'edad':40}]} -> edad = 20 OR 30 OR 40
                 *  - {$and:[{'edad':20}, {'empresa':''Google}]} -> edad = 20 AND empresa = Google 
                 */
                recetas.find(criterio).toArray(function (err, recetas) {
                    if (err) {
                        callback(null);
                    } else {
                        callback(recetas);
                    }
                    db.close();
                });
            }
        });
    },
    obtenerRecetasPg: function (criterio, pg, callback) {
        this.mongo.MongoClient.connect(this.app.get('db'), function (err, db) {
            if (err) {
                callback(null, null);
            } else {
                var recetas = db.collection('recetas');
                /**
                 * Criterios:
                 *  - {} -> todos los documentos
                 *  - {'tipo' : 'casa'} -> tipo casa
                 *  - {'tipo' : 'casa' , 'metros' : 100} -> tipo casa y metros = 100 igual que AND
                 *  - {'precio' : {$gte:31}} -> precio >= 31
                 *      - $gt -> mayor que '>'
                 *      - $gte -> mayor o igual '>='
                 *      - $lt -> menor que '<'
                 *      - $lte -> menor o igual '<='
                 *      - $in -> valor contenido en un array
                 *      - $nin -> valor NO contenido en un array
                 *  - {$or:[{'edad':20}, {'edad':30}, {'edad':40}]} -> edad = 20 OR 30 OR 40
                 *  - {$and:[{'edad':20}, {'empresa':''Google}]} -> edad = 20 AND empresa = Google 
                 */
                recetas.count(function (err, total) {
                    recetas.find(criterio).skip((pg - 1) * 10).limit(10).toArray(function (err, recetas) {
                        if (err) {
                            callback(null, null);
                        } else {
                            callback(recetas, total);
                        }
                        db.close();
                    });
                });
            }
        });
    },
    obtenerUsuarios: function (criterio, callback) {
        this.mongo.MongoClient.connect(this.app.get('db'), function (err, db) {
            if (err) {
                callback(null);
            } else {
                var usuarios = db.collection('usuarios');
                /**
                 * Criterios:
                 *  - {} -> todos los documentos
                 *  - {'tipo' : 'casa'} -> tipo casa
                 *  - {'tipo' : 'casa' , 'metros' : 100} -> tipo casa y metros = 100 igual que AND
                 *  - {'precio' : {$gte:31}} -> precio >= 31
                 *      - $gt -> mayor que '>'
                 *      - $gte -> mayor o igual '>='
                 *      - $lt -> menor que '<'
                 *      - $lte -> menor o igual '<='
                 *      - $in -> valor contenido en un array
                 *      - $nin -> valor NO contenido en un array
                 *  - {$or:[{'edad':20}, {'edad':30}, {'edad':40}]} -> edad = 20 OR 30 OR 40
                 *  - {$and:[{'edad':20}, {'empresa':''Google}]} -> edad = 20 AND empresa = Google 
                 */
                usuarios.find(criterio).toArray(function (err, usuarios) {
                    if (err) {
                        callback(null);
                    } else {
                        callback(usuarios);
                    }
                    db.close();
                });
            }
        });
    }
};