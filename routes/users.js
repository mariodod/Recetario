module.exports = function (app, swig, gestorDB, encriptador) {
    app.get('/usuarios', function (req, res) {
        res.send('ver usuarios');
    });

    app.get('/login', function (req, res) {
        var respuesta = swig.renderFile('views/login.html', {});

        res.send(respuesta);
    });

    app.post('/login', function (req, res) {
        //Pueden ser null o undefined
        var encpass = encriptador.update(req.body.password).digest('hex');

        var usuario = {
            username: req.body.username,
            password: encpass
        }

        gestorDB.obtenerUsuarios(usuario, function (usuarios) {
            if (usuarios == null || usuarios.lenght == 0) {
                req.session.usuario = null;
                res.send("El usuario o la contraseña no existen");
            } else {
                req.session.usuario = usuarios[0].username;
                res.send("Autenticado");
            }
        });
    });

    app.get('/logout', function (req, res) {
        req.session.usuario = null;
        res.send('Usuario desconectado');
    });
};