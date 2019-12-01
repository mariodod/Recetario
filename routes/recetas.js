module.exports = function (app, swig) {
    app.get('/recetas', function (req, res) {
        var recetas = gestor.getRecetas();

        //Composicion y retorno de la respuesta
        var respuesta = swig.renderFile('views/recetas.html', {
            recetas: recetas
        });

        res.send(respuesta);
    });

    app.get('/receta', function (req, res) {
        //Obtener parametro id
        var id = req.query.id;

        //Logica
        if (id != null && typeof (id) != "undefined")
            var receta = gestor.getReceta(id);

        res.send('ver receta '+id);
    });

    app.get('/receta/:id', function (req, res) {
        res.send('info receta');
    });

    app.post('/receta', function (req, res) {
        //Pueden ser null o undefined
        var titulo = req.body.titulo;

        res.send('registrada receta ' + titulo);
    })

    app.put('/receta', function (req, res) {
        res.send('actualizar receta');
    })
};