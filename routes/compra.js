const { agruparIngredientes } = require('../modules/compra.js');

module.exports = function (app, gestorDB) {

    /**
     * Los ids de receta llegan repetidos o separados por comas (lo que
     * ensucie menos la url al repetir la peticion):  /lista?recetas=id1,id2
     * Devuelve la lista sin repetidos y en el orden en que se pidieron.
     */
    function idsDeRecetas(valor) {
        const crudos = Array.isArray(valor) ? valor.join(',') : String(valor || '');
        const ids = [];
        for (const id of crudos.split(',')) {
            const limpio = id.trim();
            if (limpio && !ids.includes(limpio)) {
                ids.push(limpio);
            }
        }
        return ids;
    }

    /**
     * Grupos de ingredientes de unas recetas ya buscadas.
     */
    function gruposDe(recetas) {
        return agruparIngredientes(recetas.map(function (receta) {
            return { receta: receta.titulo, ingredientes: receta.ingredientes || [] };
        }));
    }

    /**
     * Vuelve a la misma lista. Las marcas viven en la sesion, asi que las
     * recetas siguen yendo en la url (se puede compartir la lista tal cual) y
     * cada navegador guarda las suyas.
     */
    function volverALaLista(res, ids) {
        res.redirect('/lista' + (ids.length ? '?recetas=' + ids.join(',') : ''));
    }

    /**
     * Lista de la compra. Cada grupo puede marcarse como comprado: las marcas
     * se guardan en la sesion al pulsar el boton del formulario.
     */
    app.get('/lista', async function (req, res) {
        const ids = idsDeRecetas(req.query.recetas);
        const recetas = await gestorDB.obtenerRecetasPorIds(ids);
        const marcados = req.session.marcados || [];

        const grupos = gruposDe(recetas).map(function (grupo) {
            grupo.marcada = marcados.includes(grupo.clave);
            return grupo;
        });

        //Cada receta de la lista lleva su enlace de "quitar", que no es mas
        //que la misma url sin su id
        const seleccion = recetas.map(function (receta) {
            const resto = recetas.filter(function (otra) { return otra._id !== receta._id; });
            return {
                id: String(receta._id),
                titulo: receta.titulo,
                sinElla: resto.length
                    ? '?recetas=' + resto.map(function (otra) { return otra._id; }).join(',')
                    : ''
            };
        });

        res.render('lista.html', {
            seleccion: seleccion,
            grupos: grupos,
            recetasParam: seleccion.map(function (elegida) { return elegida.id; }).join(',')
        });
    });

    /**
     * Guarda las marcas de los ingredientes de ESTA lista. Solo se aceptan
     * claves que pertenezcan a sus grupos; las marcas de otras listas se
     * quedan como estaban y las de esta se sustituyen por las enviadas (asi
     * desmarcar tambien funciona).
     */
    app.post('/lista/marcar', async function (req, res) {
        const ids = idsDeRecetas(req.body.recetas);
        const recetas = await gestorDB.obtenerRecetasPorIds(ids);
        const deEstaLista = new Set(gruposDe(recetas).map(function (grupo) {
            return grupo.clave;
        }));

        const enviadas = [].concat(req.body.marcado || []).filter(function (clave) {
            return deEstaLista.has(clave);
        });

        const actuales = (req.session.marcados || []).filter(function (clave) {
            return !deEstaLista.has(clave);
        });

        req.session.marcados = Array.from(new Set(actuales.concat(enviadas)));
        volverALaLista(res, ids);
    });

    /**
     * Borra todas las marcas de la sesion.
     */
    app.post('/lista/vaciar', function (req, res) {
        req.session.marcados = [];
        volverALaLista(res, idsDeRecetas(req.body.recetas));
    });
};
