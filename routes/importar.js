const requiereSesion = require('../modules/autenticacion.js');
const csrf = require('../modules/csrf.js');
const { comprobarUrl, traerHtml, extraerReceta } = require('../modules/importar.js');
const { MAX_FOTOS } = require('../modules/fotos.js');
const { DIFICULTADES, MOMENTOS } = require('../modules/filtros.js');
const { rateLimit } = require('express-rate-limit');

module.exports = function (app, gestorDB) {

    //Bajar paginas ajenas cuesta de verdad (red, cpu):  cada usuario puede
    //importar un puñado de recetas por rato, ni mas
    const limitador = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 15,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: function (req, res) {
            res.status(429).send('Demasiadas importaciones, prueba dentro de un rato');
        }
    });

    function pintarImportar(res, estado, datos) {
        res.status(estado).render('importar.html', Object.assign({ url: '', error: null }, datos));
    }

    app.get('/receta/importar', requiereSesion, function (req, res) {
        pintarImportar(res, 200, {});
    });

    /**
     * Baja la pagina, le saca la receta JSON-LD y pinta el formulario de
     * alta con lo importado:  se revisa, se completa (dificultad, momento,
     * fotos...) y se guarda como cualquier otra.
     */
    app.post('/receta/importar', requiereSesion, limitador, csrf, async function (req, res) {
        const url = String(req.body.url || '').trim();

        const comprobada = await comprobarUrl(url);
        if (!comprobada.ok) {
            return pintarImportar(res, 400, { url: url, error: comprobada.motivo });
        }

        let html;
        try {
            html = await traerHtml(comprobada.url);
        } catch (error) {
            return pintarImportar(res, 400, {
                url: url,
                error: 'No se ha podido bajar la pagina: ' + error.message
            });
        }

        const receta = extraerReceta(html);
        if (!receta) {
            return pintarImportar(res, 400, {
                url: url,
                error: 'La pagina no trae ninguna receta (sin datos JSON-LD de tipo Recipe)'
            });
        }

        res.render('receta-form.html', {
            receta: {
                titulo: receta.titulo,
                tiempo: receta.tiempo,
                raciones: receta.raciones,
                dificultad: '',
                momento: '',
                ingredientes: receta.ingredientes.join('\n'),
                preparacion: receta.preparacion.join('\n'),
                etiquetas: receta.etiquetas.join('\n'),
                video: '',
                fotos: []
            },
            errores: [],
            modo: 'crear',
            autores: [],
            maximoFotos: MAX_FOTOS,
            dificultades: DIFICULTADES,
            momentos: MOMENTOS
        });
    });
};
