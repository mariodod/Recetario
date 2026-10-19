const requiereSesion = require('../modules/autenticacion.js');
const csrf = require('../modules/csrf.js');
const { textoDe } = require('../modules/formulario.js');

const LIMITE_TEXTO = 2000;

module.exports = function (app, gestorDB) {

    function volverALaReceta(res, id, mensaje, tipo) {
        res.redirect('/receta/' + id + '?mensaje=' + mensaje + '&tipoMensaje=' + (tipo || 'alert-info'));
    }

    /**
     * Publicar un comentario en el detalle de la receta. El texto se guarda
     * tal cual se escribio (con sus saltos de linea):  lo pinta Nunjucks,
     * con la plantilla protegida contra inyeccion.
     */
    app.post('/receta/:id/comentarios', requiereSesion, csrf, async function (req, res) {
        const receta = await gestorDB.obtenerRecetaPorId(req.params.id);
        if (!receta) {
            return res.status(404).send('Recurso no disponible');
        }

        const texto = textoDe(req.body.texto);
        if (texto === null) {
            return volverALaReceta(res, receta._id, 'El+formulario+no+es+valido', 'alert-warning');
        }
        const limpio = texto.trim();
        if (!limpio) {
            return volverALaReceta(res, receta._id, 'Escribe+algo+antes+de+comentar', 'alert-warning');
        }
        if (limpio.length > LIMITE_TEXTO) {
            return volverALaReceta(res, receta._id,
                'El+comentario+no+puede+pasar+de+2000+caracteres', 'alert-warning');
        }

        await gestorDB.insertarComentario({
            receta: String(receta._id),
            usuario: req.session.usuario,
            texto: limpio,
            creadaEn: new Date()
        });

        volverALaReceta(res, receta._id, 'Comentario+publicado', 'alert-success');
    });

    /**
     * Borrar un comentario:  su autor o el de la receta, que puede limpiar
     * lo que se publiques en su casa.
     */
    app.post('/comentario/:id/borrar', requiereSesion, csrf, async function (req, res) {
        const comentario = await gestorDB.obtenerComentario(req.params.id);
        if (!comentario) {
            return res.status(404).send('Recurso no disponible');
        }

        const receta = await gestorDB.obtenerRecetaPorId(comentario.receta);
        const puedeBorrar = comentario.usuario === req.session.usuario
            || (receta && receta.autor === req.session.usuario);
        if (!puedeBorrar) {
            return volverALaReceta(res, comentario.receta,
                'No+puedes+borrar+este+comentario', 'alert-warning');
        }

        await gestorDB.borrarComentario(comentario._id);
        volverALaReceta(res, comentario.receta, 'Comentario+borrado', 'alert-info');
    });
};
