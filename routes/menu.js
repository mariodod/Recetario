const { momentosDelMenu } = require('../modules/filtros.js');

const OPCIONES = [
    { valor: 'ambos', etiqueta: 'Comidas y cenas' },
    { valor: 'comida', etiqueta: 'Solo comidas' },
    { valor: 'cena', etiqueta: 'Solo cenas' },
    { valor: 'postre', etiqueta: 'Solo postres' }
];

module.exports = function (app, gestorDB) {

    app.get('/menu', function (req, res) {
        res.render('menu.html', {
            momento: 'ambos',
            numero: 3,
            opciones: OPCIONES,
            menu: null,
            aviso: null
        });
    });

    app.post('/menu', async function (req, res) {
        const momento = OPCIONES.some(function (opcion) { return opcion.valor === req.body.momento; })
            ? req.body.momento
            : 'ambos';

        let numero = parseInt(req.body.numero, 10);
        if (!Number.isFinite(numero)) numero = 3;
        numero = Math.min(Math.max(numero, 1), 10);

        const criterio = { momento: { $in: momentosDelMenu(momento) } };
        const menu = await gestorDB.obtenerRecetasAleatorias(criterio, numero);

        res.render('menu.html', {
            momento: momento,
            numero: numero,
            opciones: OPCIONES,
            menu: menu,
            aviso: menu.length < numero
                ? 'Solo hay ' + menu.length + ' recetas para esa combinacion.'
                : null
        });
    });

};
