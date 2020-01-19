//Modulos
var express = require('express');
var swig = require('swig');
var bodyParser = require('body-parser');
var mongo = require('mongodb');
var gestorDB = require("./modules/gestorDB.js");
var crypto = require('crypto');
var expressSession = require('express-session');

var app = express();

//Router
var routerAutenticacion = express.Router();
routerAutenticacion.use(function (req, res, next) {
  if (req.session.usuario)
    next();
  else
    res.redirect('/login');
});

//Encriptacion
var secreto = 'SDi2018$';
var encriptador = crypto.createHmac('sha256', secreto);

//App.use
//Enrutadores
app.use("/privado/", routerAutenticacion);

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(expressSession({
  secret: secreto,
  resave: true,
  saveUninitialized: true
}));

//Variables de la aplicacion
app.set('port', 8081);
app.set('db', 'mongodb://chefmario:marioChef1@ds037551.mlab.com:37551/recetario'); //externalizar user y pass

//Inicializacion del modulo de DB
gestorDB.init(app, mongo);

//Rutas/controladores por logica
require("./routes/recetas.js")(app, swig, gestorDB); //(app, param1, param2...)
require("./routes/menu.js")(app, swig, gestorDB); //(app, param1, param2...)
require("./routes/users.js")(app, swig, gestorDB, encriptador); //(app, param1, param2...)

/**
 * Metodos de respuesta de express
 * 
 * res.send(string) respuesta como string
 * res.json(json) respuesta como JSON
 * res.redirect(URL) redireccion a URL
 * res.render(plantilla) renderiza plantilla
 * res.sendFile(file) envia un archivo
 * res.sendStatus(codigo) responde status
 */
//Peticiones HTTP
app.get('/', function (req, res) {
  var respuesta = swig.renderFile('views/index.html', {});

  res.send(respuesta);
});

// Ejemplo basado en patrones string
app.get('/promo*', function (req, res) {
  res.send('Resp al patrón promo *');
});

//Lanzar el servidor
app.listen(app.get('port'), function () {
  console.log("Servidor activo");
});

//Captura de errores genericos
app.use(function (err, req, res, next) {
  console.log('Error producido: ' + err);
  if (!res.headersSent) {
    res.send('Recurso no disponible');
  }
});