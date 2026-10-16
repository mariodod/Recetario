const { ObjectId } = require('mongodb');
const requiereSesion = require('../modules/autenticacion.js');
const { parsearReceta, recetaVacia } = require('../modules/receta.js');
const {
    DIFICULTADES,
    MOMENTOS,
    extraerFiltros,
    criterioDeFiltros,
    consultaDeFiltros
} = require('../modules/filtros.js');

module.exports = function (app, gestorDB) {
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
        let criterio;
        try {
            criterio = { "_id": new ObjectId(req.params.id) };
        } catch (err) {
            return res.status(404).render('receta.html', { receta: null });
        }

        const recetas = await gestorDB.obtenerRecetas(criterio);

        if (recetas.length === 0) {
            return res.status(404).render('receta.html', { receta: null });
        }

        const receta = recetas[0];
        res.format({
            html: function () { res.render('receta.html', { receta: receta }); },
            json: function () { res.json(receta); }
        });
    });

    /**
     * Formulario de alta. Solo para usuarios identificados.
     */
    app.get('/receta', requiereSesion, async function (req, res) {
        const [etiquetas, ingredientes] = await Promise.all([
            gestorDB.obtenerEtiquetas(),
            gestorDB.obtenerIngredientes()
        ]);

        res.render('receta-form.html', {
            receta: recetaVacia(),
            error: null,
            etiquetas: etiquetas,
            ingredientes: ingredientes,
            dificultades: DIFICULTADES,
            momentos: MOMENTOS
        });
    });

    app.post('/receta', requiereSesion, async function (req, res) {
        const resultado = parsearReceta(req.body);

        const [etiquetas, ingredientes] = await Promise.all([
            gestorDB.obtenerEtiquetas(),
            gestorDB.obtenerIngredientes()
        ]);

        //Formulario incompleto: se vuelve a pintar con lo que ya habia
        if (resultado.errores.length > 0) {
            return res.status(400).render('receta-form.html', {
                receta: resultado.receta,
                error: resultado.errores[0],
                etiquetas: etiquetas,
                ingredientes: ingredientes,
                dificultades: DIFICULTADES,
                momentos: MOMENTOS
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

    app.put('/receta', function (req, res) {
        res.send('actualizar receta');
    });
};
