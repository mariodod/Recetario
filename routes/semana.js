const requiereSesion = require('../modules/autenticacion.js');
const csrf = require('../modules/csrf.js');
const { MOMENTOS } = require('../modules/filtros.js');
const {
    DIAS,
    MOMENTOS_SEMANA,
    lunesDe,
    diasDeSemana,
    sumarDias,
    etiquetaDeSemana
} = require('../modules/semana.js');

module.exports = function (app, gestorDB) {

    /**
     * PRG con aviso:  lo que sale por querystring lo pinta la barra de
     * base.html (tipoMensaje limitado a lista blanca alli).
     */
    function avisar(res, lunes, texto, tipo) {
        res.redirect('/semana?sem=' + lunes
            + '&mensaje=' + encodeURIComponent(texto)
            + '&tipoMensaje=' + (tipo || 'alert-warning'));
    }

    function barajar(lista) {
        for (let i = lista.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temporal = lista[i];
            lista[i] = lista[j];
            lista[j] = temporal;
        }
        return lista;
    }

    /**
     * Pinta la semana:  celdas ya montadas con sus recetas (cada dia tiene
     * los cuatro momentos, aunque esten vacios), las opciones de cada
     * momento para poder anadir y los enlaces de semana.
     */
    async function pintarSemana(req, res) {
        const usuario = req.session.usuario;
        const lunes = lunesDe(req.query.sem);
        const claves = diasDeSemana(lunes);
        const doc = await gestorDB.obtenerSemana(usuario, lunes);
        const platos = (doc && doc.platos) || {};

        //Todas las recetas de la semana, de una sola tacada
        const ids = new Set();
        for (const dia of claves) {
            const delDia = platos[dia] || {};
            for (const momento of MOMENTOS) {
                for (const id of delDia[momento] || []) {
                    ids.add(id);
                }
            }
        }
        const guardadas = await gestorDB.obtenerRecetasPorIds(Array.from(ids));
        const porId = new Map(guardadas.map(function (receta) {
            return [String(receta._id), receta];
        }));

        const celdas = {};
        for (const dia of claves) {
            const delDia = platos[dia] || {};
            celdas[dia] = {};
            for (const momento of MOMENTOS) {
                celdas[dia][momento] = (delDia[momento] || []).map(function (id) {
                    return porId.get(String(id));
                }).filter(Boolean);
            }
        }

        //Recetas ordenadas para los selectores de anadir, por momento
        const opcionesPorMomento = {};
        await Promise.all(MOMENTOS_SEMANA.map(async function (momento) {
            opcionesPorMomento[momento.valor] = await gestorDB.obtenerRecetas(
                { momento: momento.valor },
                { projection: { titulo: 1 }, sort: { titulo: 1 } }
            );
        }));

        //La lista de la compra pide las recetas de la semana por la url
        const idsLista = Array.from(ids);
        const estaSemana = lunesDe();

        res.render('semana.html', {
            semana: lunes,
            etiqueta: etiquetaDeSemana(lunes),
            dias: DIAS.map(function (dia, i) {
                return {
                    nombre: dia.nombre,
                    clave: claves[i],
                    fecha: new Date(
                        Number(claves[i].slice(0, 4)),
                        Number(claves[i].slice(5, 7)) - 1,
                        Number(claves[i].slice(8, 10))
                    ).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
                };
            }),
            momentos: MOMENTOS_SEMANA,
            celdas: celdas,
            opcionesPorMomento: opcionesPorMomento,
            anterior: sumarDias(lunes, -7),
            siguiente: sumarDias(lunes, 7),
            esActual: lunes === estaSemana,
            listaHref: idsLista.length > 0
                ? '/lista?recetas=' + idsLista.join(',')
                : null
        });
    }

    /**
     * Comprueba que el dia pedido pertenece a la semana pedida y que el
     * momento existe; si no, avisa y devuelve null.
     */
    function validarCelda(lunes, dia, momento) {
        if (!diasDeSemana(lunes).includes(dia)) {
            return 'Ese dia no pertenece a la semana elegida';
        }
        if (!MOMENTOS.includes(momento)) {
            return 'Ese momento del dia no existe';
        }
        return null;
    }

    app.get('/semana', requiereSesion, async function (req, res) {
        await pintarSemana(req, res);
    });

    app.post('/semana/anadir', requiereSesion, csrf, async function (req, res) {
        const usuario = req.session.usuario;
        const lunes = lunesDe(req.body.sem);
        const dia = String(req.body.dia || '');
        const momento = String(req.body.momento || '');

        const errorDeCelda = validarCelda(lunes, dia, momento);
        if (errorDeCelda) {
            return avisar(res, lunes, errorDeCelda);
        }

        const receta = await gestorDB.obtenerRecetaPorId(String(req.body.receta || ''));
        if (!receta) {
            return avisar(res, lunes, 'Esa receta no existe');
        }

        const doc = await gestorDB.obtenerSemana(usuario, lunes);
        const platos = (doc && doc.platos) || {};
        const celda = (platos[dia] && platos[dia][momento]) || [];
        const id = String(receta._id);
        if (celda.includes(id)) {
            return avisar(res, lunes, 'Esa receta ya esta en ese hueco');
        }

        celda.push(id);
        platos[dia] = Object.assign({}, platos[dia]);
        platos[dia][momento] = celda;
        await gestorDB.guardarSemana(usuario, lunes, platos);
        avisar(res, lunes, 'Receta anadida al menu', 'alert-success');
    });

    app.post('/semana/quitar', requiereSesion, csrf, async function (req, res) {
        const usuario = req.session.usuario;
        const lunes = lunesDe(req.body.sem);
        const dia = String(req.body.dia || '');
        const momento = String(req.body.momento || '');
        const id = String(req.body.receta || '');

        const errorDeCelda = validarCelda(lunes, dia, momento);
        if (errorDeCelda) {
            return avisar(res, lunes, errorDeCelda);
        }

        const doc = await gestorDB.obtenerSemana(usuario, lunes);
        const platos = (doc && doc.platos) || {};
        const celda = (platos[dia] && platos[dia][momento]) || [];

        platos[dia] = Object.assign({}, platos[dia]);
        platos[dia][momento] = celda.filter(function (guardada) {
            return guardada !== id;
        });
        await gestorDB.guardarSemana(usuario, lunes, platos);
        avisar(res, lunes, 'Receta quitada del menu', 'alert-success');
    });

    /**
     * Rellena solo los huecos que esten vacios, con una receta del momento
     * de cada uno. Los platos ya puestos no se tocan; si hay mas huecos que
     * recetas de un momento, se acaba repitiendo alguna.
     */
    app.post('/semana/rellenar', requiereSesion, csrf, async function (req, res) {
        const usuario = req.session.usuario;
        const lunes = lunesDe(req.body.sem);
        const doc = await gestorDB.obtenerSemana(usuario, lunes);
        const platos = (doc && doc.platos) || {};

        const pilas = {};
        for (const momento of MOMENTOS_SEMANA) {
            const recetas = await gestorDB.obtenerRecetas(
                { momento: momento.valor },
                { projection: { _id: 1 }, sort: { titulo: 1 } }
            );
            pilas[momento.valor] = barajar(recetas.map(function (receta) {
                return String(receta._id);
            }));
        }

        let anadidas = 0;
        for (const dia of diasDeSemana(lunes)) {
            const delDia = platos[dia] || {};
            for (const momento of MOMENTOS_SEMANA) {
                const celda = delDia[momento.valor] || [];
                const pila = pilas[momento.valor];
                if (celda.length > 0 || pila.length === 0) {
                    continue;
                }

                //Rotando:  si hay mas huecos que recetas, se vuelve a empezar
                const id = pila.shift();
                pila.push(id);
                platos[dia] = Object.assign({}, platos[dia]);
                platos[dia][momento.valor] = [id];
                anadidas++;
            }
        }

        await gestorDB.guardarSemana(usuario, lunes, platos);
        avisar(res, lunes, anadidas > 0
            ? 'Semana rellenada con ' + anadidas + ' platos'
            : 'No hay ningun hueco vacio ni recetas que anadir', 'alert-success');
    });

    app.post('/semana/vaciar', requiereSesion, csrf, async function (req, res) {
        const usuario = req.session.usuario;
        const lunes = lunesDe(req.body.sem);
        await gestorDB.borrarSemana(usuario, lunes);
        avisar(res, lunes, 'Semana vaciada', 'alert-success');
    });
};
