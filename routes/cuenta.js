const requiereSesion = require('../modules/autenticacion.js');
const csrf = require('../modules/csrf.js');
const { hashPassword, verifyPassword } = require('../modules/passwords.js');
const { subirAvatar, borrarAvatar, borrarFotos } = require('../modules/fotos.js');

const LIMITE_BIO = 500;

module.exports = function (app, gestorDB) {

    function noExiste(res) {
        res.status(404).send('Recurso no disponible');
    }

    /**
     * Los datos que muestra el perfil, con la fecha ya escrita para no
     * pintar el formato crudo de JavaScript.
     */
    function perfilVista(usuario) {
        let creadaEn = null;
        if (usuario.creadaEn) {
            creadaEn = new Date(usuario.creadaEn).toLocaleDateString('es-ES', {
                day: 'numeric', month: 'long', year: 'numeric'
            });
        }
        return {
            username: usuario.username,
            bio: usuario.bio || '',
            avatar: usuario.avatar || null,
            creadaEn: creadaEn
        };
    }

    /**
     * El usuario de la sesion actual, o null (y con la sesion ya cerrada)
     * si la cuenta ha desaparecido mientras tanto.
     */
    async function usuarioActual(req, res) {
        const usuarios = await gestorDB.obtenerUsuarios({ username: req.session.usuario });
        if (usuarios.length === 0) {
            req.session.destroy(function () {
                res.redirect('/login?mensaje=Sesion+caducada&tipoMensaje=alert-info');
            });
            return null;
        }
        return usuarios[0];
    }

    /**
     * Vista completa de /cuenta: perfil, cuantas recetas se pierden al
     * borrarla y los avisos de cada formulario (mas el bio si vuelve sin
     * guardar).
     */
    async function pintarCuenta(usuario, extra) {
        extra = extra || {};
        const recetas = await gestorDB.obtenerRecetas(
            { autor: usuario.username },
            { projection: { _id: 1 } }
        );

        return Object.assign({
            perfil: perfilVista(usuario),
            nRecetas: recetas.length,
            bio: usuario.bio || '',
            error: null,
            errorPassword: null,
            errorBorrado: null
        }, extra);
    }

    /**
     * Perfil publico:  descripcion, avatar y recetas de quien la tenga.
     */
    app.get('/usuario/:nombre', async function (req, res) {
        const usuarios = await gestorDB.obtenerUsuarios({ username: req.params.nombre });
        if (usuarios.length === 0) {
            return noExiste(res);
        }
        const perfil = usuarios[0];

        let pg = parseInt(req.query.pg, 10);
        if (!Number.isFinite(pg) || pg < 1) pg = 1;

        let pagina = await gestorDB.obtenerRecetasPg({ autor: perfil.username }, pg, { titulo: 1 });
        const pgUltima = Math.max(1, Math.ceil(pagina.total / 10));
        if (pg > pgUltima) {
            pg = pgUltima;
            pagina = await gestorDB.obtenerRecetasPg({ autor: perfil.username }, pg, { titulo: 1 });
        }

        res.render('usuario.html', {
            perfil: perfilVista(perfil),
            esPropio: req.session.usuario === perfil.username,
            recetas: pagina.recetas,
            total: pagina.total,
            pgActual: pg,
            pgUltima: pgUltima
        });
    });

    /**
     * Edicion de la propia cuenta.
     */
    app.get('/cuenta', requiereSesion, async function (req, res) {
        const usuario = await usuarioActual(req, res);
        if (!usuario) return;

        res.render('cuenta.html', await pintarCuenta(usuario));
    });

    /**
     * Guarda la descripcion y, si se adjunta, la foto de perfil. La subida
     * puede fallar sin error 500:  el motivo vuelve pintado en la pagina.
     */
    app.post('/cuenta', requiereSesion, subirAvatar, csrf, async function (req, res) {
        const usuario = await usuarioActual(req, res);
        if (!usuario) return;

        const bio = String(req.body.bio || '').trim();
        const error = req.errorAvatar
            || (bio.length > LIMITE_BIO ? 'La descripcion no puede pasar de ' + LIMITE_BIO + ' caracteres' : null);

        if (error) {
            //Lo que se haya subido de todas formas no se queda a medias
            await borrarAvatar(req.file ? req.file.filename : null);
            return res.status(400).render(
                'cuenta.html',
                await pintarCuenta(usuario, { error: error, bio: bio })
            );
        }

        const campos = { bio: bio };
        if (req.file) {
            campos.avatar = req.file.filename;
        }
        await gestorDB.actualizarUsuario({ username: usuario.username }, campos);

        if (req.file) {
            if (usuario.avatar && usuario.avatar !== req.file.filename) {
                await borrarAvatar(usuario.avatar);
            }
            //La barra de navegacion sale en la misma peticion siguiente
            req.session.avatar = req.file.filename;
        }

        res.redirect('/cuenta?mensaje=Perfil+guardado&tipoMensaje=alert-success');
    });

    /**
     * Cambio de contrasena:  pide la actual, como el borrado.
     */
    app.post('/cuenta/password', requiereSesion, csrf, async function (req, res) {
        const usuario = await usuarioActual(req, res);
        if (!usuario) return;

        const actual = req.body.actual || '';
        const nueva = req.body.nueva || '';
        const confirmacion = req.body.confirmacion || '';

        const errores = [];
        if (!(await verifyPassword(actual, usuario.password))) {
            errores.push('La contraseña actual no es correcta');
        }
        if (nueva.length < 6) {
            errores.push('La nueva contraseña debe tener al menos 6 caracteres');
        }
        if (nueva !== confirmacion) {
            errores.push('Las contraseñas nuevas no coinciden');
        }

        if (errores.length > 0) {
            return res.status(400).render(
                'cuenta.html',
                await pintarCuenta(usuario, { errorPassword: errores[0] })
            );
        }

        await gestorDB.actualizarUsuario(
            { username: usuario.username },
            { password: await hashPassword(nueva) }
        );
        res.redirect('/cuenta?mensaje=Contrasena+cambiada&tipoMensaje=alert-success');
    });

    /**
     * Borrado de la cuenta con todo lo suyo. Se pide la contrasena para
     * que un simple enlace accidental no la borre.
     */
    app.post('/cuenta/borrar', requiereSesion, csrf, async function (req, res) {
        const usuario = await usuarioActual(req, res);
        if (!usuario) return;

        const password = req.body.password || '';
        if (!(await verifyPassword(password, usuario.password))) {
            return res.status(400).render(
                'cuenta.html',
                await pintarCuenta(usuario, { errorBorrado: 'La contraseña no es correcta' })
            );
        }

        //Sus recetas con sus fotos...
        const propias = await gestorDB.obtenerRecetas(
            { autor: usuario.username },
            { projection: { _id: 1, fotos: 1 } }
        );
        for (const receta of propias) {
            await borrarFotos(receta.fotos || []);
        }
        await gestorDB.eliminarReceta({ autor: usuario.username });

        //...los demas datos de esas recetas y los suyos propios
        const ids = propias.map(function (receta) { return String(receta._id); });
        if (ids.length > 0) {
            await gestorDB.borrarFavoritosYValoracionesDeRecetas(ids);
        }
        await Promise.all([
            gestorDB.borrarFavoritosDe(usuario.username),
            gestorDB.borrarValoracionesDe(usuario.username),
            gestorDB.borrarSemanasDe(usuario.username)
        ]);
        await gestorDB.borrarUsuario({ username: usuario.username });
        await borrarAvatar(usuario.avatar || null);

        //Esta sesion se cierra; las demas paginas de cuenta detectarian que
        //la cuenta ya no existe y se cerrarian solas
        req.session.destroy(function () {
            res.redirect('/?mensaje=Cuenta+borrada&tipoMensaje=alert-info');
        });
    });
};
