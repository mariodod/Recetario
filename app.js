//Modulos
var express = require('express');
var swig = require('swig');
var bodyParser = require('body-parser');

var app = express();

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

//Variables de la aplicacion
app.set('port', 8081);

//Rutas/controladores por logica
require("./routes/recetas.js")(app, swig); //(app, param1, param2...)
require("./routes/users.js")(app, swig); //(app, param1, param2...)

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
  res.send('ver pagina de inicio');
});

// Ejemplo basado en patrones string
app.get('/promo*', function (req, res) {
  res.send('Resp al patrón promo *');
});

//Lanzar el servidor
app.listen(app.get('port'), function () {
  console.log("Servidor activo");
});