const { hashPassword, verifyPassword } = require('../modules/passwords.js');
const csrf = require('../modules/csrf.js');
const { rateLimit } = require('express-rate-limit');

module.exports = function (app, gestorDB) {

    //Fuerza bruta contra el login y el registro:  un tope generoso para que
    //el uso normal (y la suite de pruebas) nunca lo toquen, pero un bot si
    const limitador = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 50,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: function (req, res) {
            res.status(429).send('Demasiados intentos de acceso, prueba dentro de un rato');
        }
    });

    /**
     * Identifica al usuario en una sesion NUEVA:  nada de lo que hubiera en
     * la anterior viaja con ella. El token CSRF se muda a la sesion nueva,
     * para que los formularios abiertos no caduquen al entrar.
     */
    function entrarEnSesion(req, res, username, avatar, mensaje) {
        req.session.regenerate(function () {
            req.session.usuario = username;
            req.session.avatar = avatar || null;
            if (res.locals.csrf) {
                req.session.csrf = res.locals.csrf;
            }
            res.redirect('/?mensaje=' + mensaje);
        });
    }

    app.get('/usuarios', function (req, res) {
        res.send('ver usuarios');
    });

    app.get('/login', function (req, res) {
        if (req.session.usuario) {
            return res.redirect('/');
        }

        res.render('login.html', { username: '', error: null });
    });

    app.post('/login', limitador, csrf, async function (req, res) {
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

        entrarEnSesion(req, res, usuario.username, usuario.avatar,
            'Bienvenido+' + encodeURIComponent(usuario.username) + '&tipoMensaje=alert-success');
    });

    app.get('/signup', function (req, res) {
        if (req.session.usuario) {
            return res.redirect('/');
        }

        res.render('signup.html', { username: '', error: null });
    });

    app.post('/signup', limitador, csrf, async function (req, res) {
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

        entrarEnSesion(req, res, username, null, 'Cuenta+creada&tipoMensaje=alert-success');
    });

    //Cerrar la sesion es una accion:  por POST, con su token, para que una
    //pagina ajena no pueda cerrarsela a alguien con un simple enlace
    app.post('/logout', csrf, function (req, res) {
        req.session.destroy(function () {
            res.redirect('/login?mensaje=Sesion+cerrada&tipoMensaje=alert-info');
        });
    });
};
