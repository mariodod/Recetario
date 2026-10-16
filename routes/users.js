const { verifyPassword } = require('../modules/passwords.js');

module.exports = function (app, gestorDB) {
    app.get('/usuarios', function (req, res) {
        res.send('ver usuarios');
    });

    app.get('/login', function (req, res) {
        if (req.session.usuario) {
            return res.redirect('/');
        }

        res.render('login.html', { username: '' });
    });

    app.post('/login', async function (req, res) {
        const username = (req.body.username || '').trim();
        const password = req.body.password || '';

        //Solo se busca por usuario: la contrasena se compara despues,
        //con su sal y en tiempo constante
        const usuarios = await gestorDB.obtenerUsuarios({ username: username });
        const usuario = usuarios[0];

        const correcta = usuario
            ? await verifyPassword(password, usuario.password)
            : false;

        if (!correcta) {
            return res.status(401).render('login.html', {
                username: username,
                error: "El usuario o la contraseña no existen"
            });
        }

        req.session.usuario = usuario.username;
        res.redirect('/?mensaje=Bienvenido+' + encodeURIComponent(usuario.username) + '&tipoMensaje=alert-success');
    });

    app.get('/logout', function (req, res) {
        req.session.destroy(function () {
            res.redirect('/login?mensaje=Sesion+cerrada&tipoMensaje=alert-info');
        });
    });
};
