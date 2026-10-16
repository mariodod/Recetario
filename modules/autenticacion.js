/**
 * Middleware:  redirige al login a quien no tenga la sesion iniciada.
 */
module.exports = function requiereSesion(req, res, next) {
    if (req.session.usuario) {
        return next();
    }
    res.redirect('/login');
};
