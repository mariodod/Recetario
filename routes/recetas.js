const { ObjectId } = require('mongodb');

module.exports = function (app, gestorDB) {
    app.get('/recetas', async function (req, res) {
        if (req.query.pg == null) {
            const recetas = await gestorDB.obtenerRecetas({});

            //Composicion y retorno de la respuesta
            res.render('recetas.html', {
                recetas: recetas
            });
        } else {
            const pg = Math.max(parseInt(req.query.pg, 10) || 1, 1);
            const datos = await gestorDB.obtenerRecetasPg({}, pg);

            const pgUltima = Math.max(Math.ceil(datos.total / 10), 1);

            //Fuera de rango: redirigimos a la ultima pagina que existe
            if (pg > pgUltima) {
                return res.redirect('/recetas?pg=' + pgUltima);
            }

            //Composicion y retorno de la respuesta
            res.render('recetasPg.html', {
                recetas: datos.recetas,
                pgActual: pg,
                pgUltima: pgUltima
            });
        }
    });

    app.get('/receta/:id', async function (req, res) {
        //ObjectId valida el identificador: si no lo es lanza BSONError
        let criterio;
        try {
            criterio = { "_id": new ObjectId(req.params.id) };
        } catch (err) {
            return res.status(404).send("La receta no existe");
        }

        const recetas = await gestorDB.obtenerRecetas(criterio);

        if (recetas.length === 0) {
            res.status(404).send("La receta no existe");
        } else {
            res.json(recetas[0]);
        }
    });

    app.get('/receta', function (req, res) {
        res.render('receta-form.html', { receta: {} });
    });

    app.post('/receta', async function (req, res) {
        const titulo = (req.body.titulo || '').trim();
        const tiempo = parseInt(req.body.tiempo, 10);

        if (!titulo) {
            return res.status(400).render('receta-form.html', {
                receta: req.body,
                error: 'El titulo es obligatorio'
            });
        }

        const receta = {
            titulo: titulo,
            tiempo: Number.isFinite(tiempo) && tiempo > 0 ? tiempo : null,
            creadaEn: new Date()
        };

        const id = await gestorDB.insertarReceta(receta);

        res.redirect('/recetas?mensaje=Receta+creada&tipoMensaje=alert-success');
    });

    app.put('/receta', function (req, res) {
        res.send('actualizar receta');
    });
};
