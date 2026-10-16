const requiereSesion = require('../modules/autenticacion.js');
const { parsearReceta } = require('../modules/receta.js');
const { subirFoto, borrarFoto } = require('../modules/fotos.js');
const { embeberVideo } = require('../modules/video.js');
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

module.exports = function (app, gestorDB) {

    /**
     * Pinta el formulario de recetas, tanto para crear como para editar.
     */
    async function pintarFormulario(res, opciones) {
        const etiquetas = await gestorDB.obtenerEtiquetas();

        res.status(opciones.estado || 200).render('receta-form.html', {
            receta: opciones.receta,
            errores: opciones.errores || [],
            modo: opciones.modo || 'crear',
            etiquetas: etiquetas,
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

        const [datos, etiquetas, ingredientes] = await Promise.all([
            gestorDB.obtenerRecetasPg(criterio, pg),
            gestorDB.obtenerEtiquetas(),
            gestorDB.obtenerIngredientes()
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

        res.format({
            html: function () {
                res.render('receta.html', { receta: receta, video: embeberVideo(receta.video) });
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

        const receta = Object.assign({}, resultado.receta, { creadaEn: new Date() });
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

        await pintarFormulario(res, { receta: paraElFormulario(existente), modo: 'editar' });
    });

    app.post('/receta/:id', requiereSesion, subirFoto, async function (req, res) {
        const existente = await gestorDB.obtenerRecetaPorId(req.params.id);
        if (!existente) {
            if (req.file) await borrarFoto(req.file.filename);
            return noExiste(res);
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

        const receta = Object.assign({}, resultado.receta, { actualizadaEn: new Date() });
        await gestorDB.actualizarReceta({ _id: existente._id }, receta);

        //La foto que se deja de usar ya no hace falta
        if (existente.foto && existente.foto !== receta.foto) {
            await borrarFoto(existente.foto);
        }

        for (const etiqueta of receta.etiquetas) {
            await gestorDB.insertarEtiqueta(etiqueta);
        }

        res.redirect('/receta/' + existente._id + '?mensaje=Receta+actualizada&tipoMensaje=alert-success');
    });

    app.post('/receta/:id/borrar', requiereSesion, async function (req, res) {
        const existente = await gestorDB.obtenerRecetaPorId(req.params.id);
        if (!existente) {
            return noExiste(res);
        }

        await gestorDB.eliminarReceta({ _id: existente._id });
        await borrarFoto(existente.foto);

        res.redirect('/recetas?mensaje=Receta+borrada&tipoMensaje=alert-success');
    });
};
