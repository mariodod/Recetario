const requiereSesion = require('../modules/autenticacion.js');
const { parsearReceta } = require('../modules/receta.js');
const { subirFoto, borrarFoto } = require('../modules/fotos.js');
const { embeberVideo } = require('../modules/video.js');
const { escalar } = require('../modules/raciones.js');
const {
    DIFICULTADES,
    MOMENTOS,
    extraerFiltros,
    criterioDeFiltros,
    consultaDeFiltros
} = require('../modules/filtros.js');

/**
 * El formulario escribe los arrays como texto (uno por linea o separados
 * por comas):  aqui se deshace el cambio para repintarlo.
 */
function paraElFormulario(receta) {
    return Object.assign({}, receta, {
        ingredientes: (receta.ingredientes || []).join('\n'),
        preparacion: (receta.preparacion || []).join('\n'),
        etiquetas: (receta.etiquetas || []).join(', '),
        video: receta.video || ''
    });
}

/**
 * Solo el autor de una receta puede editarla o borrarla. Las recetas sin
 * autor no las puede tocar nadie.
 */
function esDelAutor(receta, req) {
    return Boolean(receta.autor) && receta.autor === req.session.usuario;
}

/**
 * Vuelve al detalle de la receta avisando de que no toca.
 */
function sinPermisos(res, receta, accion) {
    const mensaje = 'Solo el autor de la receta puede ' + accion;
    return res.redirect(
        '/receta/' + receta._id + '?mensaje=' + encodeURIComponent(mensaje) + '&tipoMensaje=alert-danger'
    );
}

/**
 * Raciones que hay que mostrar:  las que pida la url si son utilizables, las
 * propias de la receta o ninguna.
 */
function racionesAMostrar(pedido, propias) {
    const numero = parseInt(pedido, 10);
    if (Number.isFinite(numero) && numero >= 1 && numero <= 50) {
        return numero;
    }
    return propias && propias >= 1 && propias <= 50 ? propias : null;
}

module.exports = function (app, gestorDB) {

    /**
     * Pinta el formulario de recetas, tanto para crear como para editar.
     */
    async function pintarFormulario(res, opciones) {
        //Solo en edicion hace falta la lista de usuarios:  para ceder la
        //autoría a otro
        const autores = opciones.modo === 'editar'
            ? await gestorDB.obtenerNombresDeUsuario()
            : [];

        res.status(opciones.estado || 200).render('receta-form.html', {
            receta: opciones.receta,
            errores: opciones.errores || [],
            modo: opciones.modo || 'crear',
            etiquetas: await gestorDB.obtenerEtiquetas(),
            autores: autores,
            dificultades: DIFICULTADES,
            momentos: MOMENTOS
        });
    }

    function noExiste(res) {
        return res.status(404).render('receta.html', { receta: null, video: null });
    }

    /**
     * Listado paginado, con los filtros de tiempo, dificultad, etiqueta,
     * ingrediente y titulo. Todo por querystring para poder compartir la url.
     */
    app.get('/recetas', async function (req, res) {
        const filtros = extraerFiltros(req.query);
        const criterio = criterioDeFiltros(filtros);
        const pg = Math.max(parseInt(req.query.pg, 10) || 1, 1);

        //Con busqueda textual se ordena por relevancia y sin ella, por titulo
        const orden = filtros.q ? { score: { $meta: 'textScore' } } : { titulo: 1 };

        const [datos, etiquetas, ingredientes, autores] = await Promise.all([
            gestorDB.obtenerRecetasPg(criterio, pg, orden),
            gestorDB.obtenerEtiquetas(),
            gestorDB.obtenerIngredientes(),
            gestorDB.obtenerNombresDeUsuario()
        ]);

        const pgUltima = Math.max(Math.ceil(datos.total / 10), 1);

        //Fuera de rango: redirigimos a la ultima pagina que existe
        if (pg > pgUltima) {
            return res.redirect('/recetas?' + consultaDeFiltros(filtros) + 'pg=' + pgUltima);
        }

        //Composicion y retorno de la respuesta
        res.render('recetas.html', {
            recetas: datos.recetas,
            total: datos.total,
            pgActual: pg,
            pgUltima: pgUltima,
            filtros: filtros,
            consulta: consultaDeFiltros(filtros),
            dificultades: DIFICULTADES,
            etiquetas: etiquetas,
            ingredientes: ingredientes,
            autores: autores,
            hayFiltros: Object.values(filtros).some(function (valor) { return valor !== null && valor !== ''; })
        });
    });

    /**
     * Detalle de una receta. Se puede pedir como pagina o como JSON:
     *   curl -H "Accept: application/json" localhost:8081/receta/<id>
     */
    app.get('/receta/:id', async function (req, res) {
        const receta = await gestorDB.obtenerRecetaPorId(req.params.id);
        if (!receta) {
            return noExiste(res);
        }

        //Todo esto solo hace falta en la pagina, no en el JSON
        const esPagina = Boolean(req.accepts('html'));
        const [relacionadas, valoracion, favorita] = await Promise.all([
            esPagina ? gestorDB.obtenerRecetasRelacionadas(receta, 4) : Promise.resolve([]),
            esPagina ? gestorDB.obtenerValoracion(receta._id, req.session.usuario) : Promise.resolve(null),
            esPagina ? gestorDB.esFavorito(req.session.usuario, receta._id) : Promise.resolve(false)
        ]);

        //Raciones pedidas en la url (?raciones=6):  el factor escala las
        //cantidades de los ingredientes que traigan cantidad
        const raciones = racionesAMostrar(req.query.raciones, receta.raciones);
        const factor = raciones && receta.raciones ? raciones / receta.raciones : 1;
        const ingredientes = (receta.ingredientes || []).map(function (nombre) {
            return { nombre: nombre, texto: escalar(nombre, factor) };
        });

        res.format({
            html: function () {
                res.render('receta.html', {
                    receta: receta,
                    video: embeberVideo(receta.video),
                    relacionadas: relacionadas,
                    ingredientes: ingredientes,
                    raciones: raciones,
                    valoracion: valoracion,
                    estrellas: [1, 2, 3, 4, 5],
                    esFavorito: favorita
                });
            },
            json: function () { res.json(receta); }
        });
    });

    /**
     * Formulario de alta. Solo para usuarios identificados.
     */
    app.get('/receta', requiereSesion, async function (req, res) {
        await pintarFormulario(res, {
            receta: paraElFormulario({ ingredientes: [], preparacion: [], etiquetas: [] }),
            modo: 'crear'
        });
    });

    app.post('/receta', requiereSesion, subirFoto, async function (req, res) {
        const resultado = parsearReceta(req.body, {
            fotoActual: req.file ? req.file.filename : null
        });

        if (req.errorFoto || resultado.errores.length > 0) {
            //La foto no se guarda si el resto del formulario no es valido
            if (req.file) {
                await borrarFoto(req.file.filename);
                resultado.receta.foto = null;
            }
            return pintarFormulario(res, {
                receta: paraElFormulario(resultado.receta),
                errores: req.errorFoto ? [req.errorFoto] : resultado.errores,
                modo: 'crear',
                estado: 400
            });
        }

        //El autor sale de la sesion, nunca del formulario
        const receta = Object.assign({}, resultado.receta, {
            autor: req.session.usuario,
            creadaEn: new Date()
        });
        const id = await gestorDB.insertarReceta(receta);

        //Las etiquetas nuevas pasan a formar parte del listado general,
        //de donde salen el filtro y el autocompletado
        for (const etiqueta of receta.etiquetas) {
            await gestorDB.insertarEtiqueta(etiqueta);
        }

        res.redirect('/receta/' + id + '?mensaje=Receta+creada&tipoMensaje=alert-success');
    });

    /**
     * Edicion y borrado de recetas.
     */
    app.get('/receta/:id/editar', requiereSesion, async function (req, res) {
        const existente = await gestorDB.obtenerRecetaPorId(req.params.id);
        if (!existente) {
            return noExiste(res);
        }
        if (!esDelAutor(existente, req)) {
            return sinPermisos(res, existente, 'editarla');
        }

        await pintarFormulario(res, { receta: paraElFormulario(existente), modo: 'editar' });
    });

    app.post('/receta/:id', requiereSesion, subirFoto, async function (req, res) {
        const existente = await gestorDB.obtenerRecetaPorId(req.params.id);
        if (!existente) {
            if (req.file) await borrarFoto(req.file.filename);
            return noExiste(res);
        }
        if (!esDelAutor(existente, req)) {
            if (req.file) await borrarFoto(req.file.filename);
            return sinPermisos(res, existente, 'editarla');
        }

        //La foto nueva sustituye a la vieja; si no hay nueva se conserva,
        //salvo que se pida eliminarla expresamente
        let foto = existente.foto;
        if (req.file) {
            foto = req.file.filename;
        } else if (req.body.quitarFoto === 'on') {
            foto = null;
        }

        const resultado = parsearReceta(req.body, { fotoActual: foto });

        if (req.errorFoto || resultado.errores.length > 0) {
            if (req.file) {
                await borrarFoto(req.file.filename);
                resultado.receta.foto = existente.foto;
            }
            return pintarFormulario(res, {
                receta: paraElFormulario(resultado.receta),
                errores: req.errorFoto ? [req.errorFoto] : resultado.errores,
                modo: 'editar',
                estado: 400
            });
        }

        //Solo quien tiene la receta puede cederla, y solo a alguien con
        //cuenta: si el usuario no existe no se guarda nada
        const receta = Object.assign({}, resultado.receta, {
            autor: existente.autor,
            actualizadaEn: new Date()
        });
        let mensaje = 'Receta+actualizada';

        const cederA = String(req.body.autor || '').trim();
        if (cederA && cederA !== existente.autor) {
            const cuentas = await gestorDB.obtenerUsuarios({ username: cederA });
            if (cuentas.length === 0) {
                if (req.file) {
                    await borrarFoto(req.file.filename);
                    receta.foto = existente.foto;
                }
                return pintarFormulario(res, {
                    receta: paraElFormulario(receta),
                    errores: ['No hay ninguna cuenta con el usuario "' + cederA + '"'],
                    modo: 'editar',
                    estado: 400
                });
            }

            receta.autor = cederA;
            mensaje = 'Receta+cedida+a+' + encodeURIComponent(cederA);
        }

        await gestorDB.actualizarReceta({ _id: existente._id }, receta);

        //La foto que se deja de usar ya no hace falta
        if (existente.foto && existente.foto !== receta.foto) {
            await borrarFoto(existente.foto);
        }

        for (const etiqueta of receta.etiquetas) {
            await gestorDB.insertarEtiqueta(etiqueta);
        }

        res.redirect('/receta/' + existente._id + '?mensaje=' + mensaje + '&tipoMensaje=alert-success');
    });

    app.post('/receta/:id/borrar', requiereSesion, async function (req, res) {
        const existente = await gestorDB.obtenerRecetaPorId(req.params.id);
        if (!existente) {
            return noExiste(res);
        }
        if (!esDelAutor(existente, req)) {
            return sinPermisos(res, existente, 'borrarla');
        }

        await gestorDB.eliminarReceta({ _id: existente._id });
        await borrarFoto(existente.foto);

        res.redirect('/recetas?mensaje=Receta+borrada&tipoMensaje=alert-success');
    });

    /**
     * Mis recetas:  las guardadas como favoritas y las creadas por mi.
     */
    app.get('/mis-recetas', requiereSesion, async function (req, res) {
        const usuario = req.session.usuario;

        const [guardadas, creadas] = await Promise.all([
            gestorDB.obtenerFavoritos(usuario),
            gestorDB.obtenerRecetas({ autor: usuario }, { sort: { titulo: 1 } })
        ]);

        res.render('mis-recetas.html', { guardadas: guardadas, creadas: creadas });
    });

    /**
     * Guardar o quitar de favoritos:  mismo boton, un poste de conmutador.
     */
    app.post('/receta/:id/favorito', requiereSesion, async function (req, res) {
        const receta = await gestorDB.obtenerRecetaPorId(req.params.id);
        if (!receta) {
            return noExiste(res);
        }

        const usuario = req.session.usuario;
        if (await gestorDB.esFavorito(usuario, receta._id)) {
            await gestorDB.borrarFavorito(usuario, receta._id);
            return res.redirect('/receta/' + receta._id + '?mensaje=Quitada+de+favoritos&tipoMensaje=alert-success');
        }

        await gestorDB.insertarFavorito(usuario, receta._id);
        res.redirect('/receta/' + receta._id + '?mensaje=Guardada+en+favoritos&tipoMensaje=alert-success');
    });

    /**
     * Valoracion de una receta:  de 1 a 5 estrellas, una por usuario, la
     * ultima votacion sustituye a la anterior.
     */
    app.post('/receta/:id/valoracion', requiereSesion, async function (req, res) {
        const receta = await gestorDB.obtenerRecetaPorId(req.params.id);
        if (!receta) {
            return noExiste(res);
        }

        const estrellas = parseInt(req.body.estrellas, 10);
        if (!Number.isFinite(estrellas) || estrellas < 1 || estrellas > 5) {
            return res.redirect('/receta/' + receta._id
                + '?mensaje=La+valoracion+tiene+que+ser+de+1+a+5+estrellas&tipoMensaje=alert-warning');
        }

        await gestorDB.guardarValoracion(req.session.usuario, receta._id, estrellas);
        res.redirect('/receta/' + receta._id + '?mensaje=Valoracion+guardada&tipoMensaje=alert-success');
    });
};
