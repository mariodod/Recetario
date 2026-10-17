const { agruparIngredientes } = require('../modules/compra.js');

module.exports = function (app, gestorDB) {

    /**
     * Lista de la compra. Los ids de receta se reciben repetidos o separados
     * por comas (lo que ensucie menos la url al repetir la peticion):
     *   /lista?recetas=id1,id2
     */
    app.get('/lista', async function (req, res) {
        const crudos = Array.isArray(req.query.recetas)
            ? req.query.recetas.join(',')
            : String(req.query.recetas || '');

        //Sin repetidos y en el orden en que se pidieron
        const ids = [];
        for (const id of crudos.split(',')) {
            const limpio = id.trim();
            if (limpio && !ids.includes(limpio)) {
                ids.push(limpio);
            }
        }

        const recetas = await gestorDB.obtenerRecetasPorIds(ids);

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
            grupos: agruparIngredientes(recetas.map(function (receta) {
                return { receta: receta.titulo, ingredientes: receta.ingredientes || [] };
            }))
        });
    });
};
