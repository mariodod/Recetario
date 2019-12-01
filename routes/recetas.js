module.exports = function (app, swig, gestorDB) {
    app.get('/recetas', function (req, res) {
        if (req.query.pg == null) {
            var recetas = gestorDB.obtenerRecetas({}, function (recetas) {
                //Composicion y retorno de la respuesta
                var respuesta = swig.renderFile('views/recetas.html', {
                    recetas: recetas
                });

                res.send(respuesta);
            });
        } else {
            var pg = parseInt(req.query.pg);
            var recetas = gestorDB.obtenerRecetasPg({}, function (recetas, total) {
                //Composicion y retorno de la respuesta
                var pgUltima = total / 10;
                if (total % 10 > 0)
                    pgUltima++;

                var respuesta = swig.renderFile('views/recetasPg.html', {
                    recetas: recetas,
                    pgActual: pg,
                    pgUltima: pgUltima
                });

                res.send(respuesta);
            });
        }
    });

    app.get('/receta/:id', function (req, res) {
        var oid = gestorDB.mongo.ObjectID(req.params.id);
        var criterio = { "_id": oid };

        gestorDB.obtenerRecetas(criterio, function (recetas) {
            if (recetas == null) {
                res.send("La receta no existe");
            } else {
                res.json(recetas);
            }
        });
    });

    app.post('/receta', function (req, res) {
        //Pueden ser null o undefined
        var receta = {
            titulo: req.body.titulo,
            tiempo: req.body.tiempo
        }

        gestorDB.insertarReceta(receta, function (id) {
            if (id == null) {
                res.send("Error al insertar");
            } else {
                res.send("Agregada id: " + id);
            }
        });
        res.send('registrada receta ' + titulo);
    })

    app.put('/receta', function (req, res) {
        res.send('actualizar receta');
    })
};