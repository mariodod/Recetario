require('dotenv').config();

const path = require('node:path');
const express = require('express');
const expressSession = require('express-session');
const nunjucks = require('nunjucks');
const gestorDB = require('./modules/gestorDB.js');

var app = express();

//Configuracion
const PORT = process.env.PORT || 8081;
const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/recetario';
const SESSION_SECRET = process.env.SESSION_SECRET || 'SDi2018$';

//Motor de plantillas: Nunjucks (sucesor mantenido de swig, misma sintaxis)
nunjucks.configure(path.join(__dirname, 'views'), {
    autoescape: true,
    express: app,
    noCache: process.env.NODE_ENV !== 'production'
});
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'views'));

//App.use
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(expressSession({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 //7 dias
    }
}));

//Variables comunes a todas las vistas
app.use(function (req, res, next) {
    res.locals.usuario = req.session.usuario || null;

    //Avisos que llegan por querystring (?mensaje=...&tipoMensaje=...)
    //tipoMensaje se limita a una lista blanca para no inyectar clases CSS
    res.locals.mensaje = req.query.mensaje || null;
    const tiposValidos = ['alert-success', 'alert-info', 'alert-warning', 'alert-danger'];
    res.locals.tipoMensaje = tiposValidos.includes(req.query.tipoMensaje)
        ? req.query.tipoMensaje
        : 'alert-info';
    next();
});

//Router de autenticacion: protege todo lo que cuelga de /privado/
var routerAutenticacion = express.Router();
routerAutenticacion.use(function (req, res, next) {
    if (req.session.usuario)
        next();
    else
        res.redirect('/login');
});
app.use("/privado/", routerAutenticacion);

//Inicializacion del modulo de DB
gestorDB.init(DB_URI);

//Rutas/controladores por logica
require("./routes/recetas.js")(app, gestorDB); //(app, gestorDB)
require("./routes/menu.js")(app, gestorDB); //(app, gestorDB)
require("./routes/users.js")(app, gestorDB); //(app, gestorDB)

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
    res.render('index.html');
});

// Ejemplo basado en patrones string (Express 5: el comodin debe tener nombre)
app.get('/promo/*splat', function (req, res) {
    res.send('Resp al patrón promo *');
});

//Pagina no encontrada
app.use(function (req, res) {
    res.status(404).send('Recurso no disponible');
});

//Captura de errores genericos (siempre al final)
app.use(function (err, req, res, next) {
    console.error('Error producido: ' + err);
    if (!res.headersSent) {
        res.status(500).send('Recurso no disponible');
    }
});

/**
 * Arranque: primero la base de datos, despues el servidor.
 */
async function iniciar() {
    try {
        await gestorDB.connect();
    } catch (err) {
        console.error('No se pudo conectar a MongoDB: ' + err.message);
        console.error('Levanta la base de datos local con:  docker start recetario-mongo');
        process.exit(1);
    }

    app.listen(PORT, function () {
        console.log('Servidor activo en http://localhost:' + PORT);
    });
}

iniciar();
