const requiereSesion = require('../modules/autenticacion.js');
const csrf = require('../modules/csrf.js');
const { parsearReceta } = require('../modules/receta.js');
const { subirFotos, nombresDe, borrarFotos, MAX_FOTOS } = require('../modules/fotos.js');
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
        etiquetas: (receta.etiquetas || []).join('\n'),
        fotos: receta.fotos || [],
        video: receta.video || ''
    });
}

/**
 * Los comentarios, con el avatar de quien los dejo y la fecha ya escrita
 * para no pintar el formato crudo de JavaScript.
 */
async function decorarComentarios(gestorDB, comentarios) {
    if (comentarios.length === 0) {
        return [];
    }

    const usuarios = await gestorDB.obtenerUsuarios({
        username: { $in: Array.from(new Set(comentarios.map(function (comentario) {
            return comentario.usuario;
        }))) }
    });
    const avatares = {};
    for (const usuario of usuarios) {
        avatares[usuario.username] = usuario.avatar || null;
    }

    return comentarios.map(function (comentario) {
        return Object.assign({}, comentario, {
            _id: String(comentario._id),
            avatar: avatares[comentario.usuario] || null,
            fecha: new Date(comentario.creadaEn).toLocaleDateString('es-ES', {
                day: 'numeric', month: 'long', year: 'numeric'
            })
        });
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
            autores: autores,
            maximoFotos: MAX_FOTOS,
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
        const [relacionadas, valoracion, favorita, comentariosCrudos] = await Promise.all([
            esPagina ? gestorDB.obtenerRecetasRelacionadas(receta, 4) : Promise.resolve([]),
            esPagina ? gestorDB.obtenerValoracion(receta._id, req.session.usuario) : Promise.resolve(null),
            esPagina ? gestorDB.esFavorito(req.session.usuario, receta._id) : Promise.resolve(false),
            esPagina ? gestorDB.obtenerComentarios(receta._id) : Promise.resolve([])
        ]);
        const comentarios = await decorarComentarios(gestorDB, comentariosCrudos);

        //Raciones pedidas en la url (?raciones=6):  el factor escala las
        //cantidades de los ingredientes que traigan cantidad
        const raciones = racionesAMostrar(req.query.raciones, receta.raciones);
        const factor = raciones && receta.raciones ? raciones / receta.raciones : 1;
        const ingredientes = (receta.ingredientes || []).map(function (nombre) {
            return { nombre: nombre, texto: escalar(nombre, factor) };
        });

        //Pasos marcados en la sesion:  para cocinar sin perderte por donde vas
        const pasosMarcados = {};
        for (const paso of (req.session.pasos || {})[String(receta._id)] || []) {
            pasosMarcados[paso] = true;
        }

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
                    esFavorito: favorita,
                    pasosMarcados: pasosMarcados,
                    comentarios: comentarios
                });
            },
            json: function () { res.json(receta); }
        });
    });

    /**
     * Modo cocina:  la receta ahi sola, con letra grande y sin la barra de
     * navegacion ni una sola linea de javascript. Los pasos marcados son
     * los mismos que en el detalle (viven en la sesion): se marca desde
     * aqui o desde alla y los dos sitios se entienden.
     */
    app.get('/receta/:id/cocina', async function (req, res) {
        const receta = await gestorDB.obtenerRecetaPorId(req.params.id);
        if (!receta) {
            return noExiste(res);
        }

        const raciones = racionesAMostrar(req.query.raciones, receta.raciones);
        const factor = raciones && receta.raciones ? raciones / receta.raciones : 1;
        const ingredientes = (receta.ingredientes || []).map(function (nombre) {
            return { nombre: nombre, texto: escalar(nombre, factor) };
        });

        const pasosMarcados = {};
        for (const paso of (req.session.pasos || {})[String(receta._id)] || []) {
            pasosMarcados[paso] = true;
        }

        res.render('cocina.html', {
            receta: receta,
            ingredientes: ingredientes,
            raciones: raciones,
            pasosMarcados: pasosMarcados
        });
    });

    /**
     * Formulario de alta. Solo para usuarios identificados.
     */
    app.get('/receta', requiereSesion, async function (req, res) {
        await pintarFormulario(res, {
            receta: paraElFormulario({ ingredientes: [], preparacion: [], etiquetas: [], fotos: [] }),
            modo: 'crear'
        });
    });

    app.post('/receta', requiereSesion, subirFotos, csrf, async function (req, res) {
        const resultado = parsearReceta(req.body, { fotosActuales: nombresDe(req.files) });

        if (req.errorFotos || resultado.errores.length > 0) {
            //Las fotos no se guardan si el resto del formulario no es valido
            await borrarFotos(nombresDe(req.files));
            resultado.receta.fotos = [];
            return pintarFormulario(res, {
                receta: paraElFormulario(resultado.receta),
                errores: req.errorFotos ? [req.errorFotos] : resultado.errores,
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

    app.post('/receta/:id', requiereSesion, subirFotos, csrf, async function (req, res) {
        const existente = await gestorDB.obtenerRecetaPorId(req.params.id);
        if (!existente) {
            await borrarFotos(nombresDe(req.files));
            return noExiste(res);
        }
        if (!esDelAutor(existente, req)) {
            await borrarFotos(nombresDe(req.files));
            return sinPermisos(res, existente, 'editarla');
        }

        //Las fotos marcadas en el formulario se quitan de la receta y las
        //nuevas se anaden a las que se quedan
        const quitar = [].concat(req.body.quitarFoto || []);
        const fotosQueSeQuedan = (existente.fotos || []).filter(function (foto) {
            return !quitar.includes(foto);
        });

        const resultado = parsearReceta(req.body, {
            fotosActuales: fotosQueSeQuedan.concat(nombresDe(req.files))
        });

        if (req.errorFotos || resultado.errores.length > 0) {
            //Las fotos recien subidas no se quedan si el resto no es valido
            await borrarFotos(nombresDe(req.files));
            resultado.receta.fotos = existente.fotos || [];
            return pintarFormulario(res, {
                receta: paraElFormulario(resultado.receta),
                errores: req.errorFotos ? [req.errorFotos] : resultado.errores,
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
                await borrarFotos(nombresDe(req.files));
                receta.fotos = existente.fotos || [];
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

        //Las fotos que se dejan de usar ya no hacen falta
        await borrarFotos((existente.fotos || []).filter(function (foto) {
            return !receta.fotos.includes(foto);
        }));

        for (const etiqueta of receta.etiquetas) {
            await gestorDB.insertarEtiqueta(etiqueta);
        }

        res.redirect('/receta/' + existente._id + '?mensaje=' + mensaje + '&tipoMensaje=alert-success');
    });

    app.post('/receta/:id/borrar', requiereSesion, csrf, async function (req, res) {
        const existente = await gestorDB.obtenerRecetaPorId(req.params.id);
        if (!existente) {
            return noExiste(res);
        }
        if (!esDelAutor(existente, req)) {
            return sinPermisos(res, existente, 'borrarla');
        }

        await gestorDB.eliminarReceta({ _id: existente._id });
        await gestorDB.borrarComentariosDeRecetas([String(existente._id)]);
        await borrarFotos(existente.fotos);

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
    app.post('/receta/:id/favorito', requiereSesion, csrf, async function (req, res) {
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
    app.post('/receta/:id/valoracion', requiereSesion, csrf, async function (req, res) {
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

    /**
     * Pasos marcados de la preparacion, para ir cocinando sin perderte por
     * donde vas. Van en la sesion, como las marcas de la lista de la compra:
     * cada navegador guarda los suyos y solo se aceptan numeros de paso que
     * existan en la receta. Lo que se envia sustituye a lo guardado para
     * ESTA receta, asi que desmarcar tambien funciona.
     */
    app.post('/receta/:id/pasos', csrf, async function (req, res) {
        const receta = await gestorDB.obtenerRecetaPorId(req.params.id);
        if (!receta) {
            return noExiste(res);
        }

        const ultima = (receta.preparacion || []).length;
        const validos = [];
        for (const crudo of [].concat(req.body.paso || [])) {
            const numero = parseInt(crudo, 10);
            if (Number.isFinite(numero) && numero >= 0 && numero < ultima && !validos.includes(numero)) {
                validos.push(numero);
            }
        }

        const pasos = req.session.pasos || {};
        if (validos.length) {
            pasos[String(receta._id)] = validos.sort(function (a, b) { return a - b; });
        } else {
            delete pasos[String(receta._id)];
        }
        req.session.pasos = pasos;

        //El modo cocina pide volver ahi tras marcar:  el formulario manda
        //su destino y solo se acepta 'cocina', para no acabar redirigido
        //a un enlace de otro sitio
        const volver = req.body.destino === 'cocina'
            ? '/receta/' + receta._id + '/cocina'
            : '/receta/' + receta._id;
        res.redirect(volver);
    });
};
