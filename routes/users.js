const { hashPassword, verifyPassword } = require('../modules/passwords.js');

module.exports = function (app, gestorDB) {
    app.get('/usuarios', function (req, res) {
        res.send('ver usuarios');
    });

    app.get('/login', function (req, res) {
        if (req.session.usuario) {
            return res.redirect('/');
        }

        res.render('login.html', { username: '', error: null });
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
        req.session.avatar = usuario.avatar || null;
        res.redirect('/?mensaje=Bienvenido+' + encodeURIComponent(usuario.username) + '&tipoMensaje=alert-success');
    });

    app.get('/signup', function (req, res) {
        if (req.session.usuario) {
            return res.redirect('/');
        }

        res.render('signup.html', { username: '', error: null });
    });

    app.post('/signup', async function (req, res) {
        const username = (req.body.username || '').trim();
        const password = req.body.password || '';
        const confirmacion = req.body.confirmacion || '';

        const errores = [];
        if (username.length < 3) {
            errores.push('El usuario debe tener al menos 3 caracteres');
        }
        if (password.length < 6) {
            errores.push('La contraseña debe tener al menos 6 caracteres');
        }
        if (password !== confirmacion) {
            errores.push('Las contraseñas no coinciden');
        }

        if (errores.length === 0) {
            const existentes = await gestorDB.obtenerUsuarios({ username: username });
            if (existentes.length > 0) {
                errores.push('Ese usuario ya existe');
            }
        }

        if (errores.length > 0) {
            return res.status(400).render('signup.html', {
                username: username,
                error: errores[0]
            });
        }

        await gestorDB.insertarUsuario({
            username: username,
            password: await hashPassword(password),
            creadaEn: new Date()
        });

        req.session.usuario = username;
        req.session.avatar = null;
        res.redirect('/?mensaje=Cuenta+creada&tipoMensaje=alert-success');
    });

    app.get('/logout', function (req, res) {
        req.session.destroy(function () {
            res.redirect('/login?mensaje=Sesion+cerrada&tipoMensaje=alert-info');
        });
    });
};
