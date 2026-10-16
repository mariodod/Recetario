module.exports = function (app, gestorDB) {

    app.get('/menu', function (req, res) {
        res.render('menu.html');
    });

};
