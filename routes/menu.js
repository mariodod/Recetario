module.exports = function (app, swig, gestorDB) {

    app.get('/menu', function (req, res) {
        var respuesta = swig.renderFile('views/menu.html', {});

        res.send(respuesta);
    });

};