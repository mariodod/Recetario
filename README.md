# Recetario
Aplicacion para tener un libro de recetas online

Puedes ver y filtrar las recetas, consultar la receta del dia, generar un menu
aleatorio y añadir tus propias recetas con ingredientes, preparación, foto y
video (una vez registrado).

## Stack tecnologico

| Pieza | Version |
| --- | --- |
| Node.js | >= 20 (probado con 24) |
| Express | 5.3 |
| MongoDB (driver oficial) | 7.7 |
| Nunjucks (motor de plantillas) | 3.2 |
| express-session | 1.19 |
| multer (subida de fotos) | 2.4 |
| Bootstrap (frontend) | 5.3.8 (CDN) |
| nodemon (solo desarrollo) | 3.1 |

El proyecto original usaba `swig`, `body-parser`, MongoDB 2.x y mLab. Todo eso
se ha migrado:

- **swig → Nunjucks**: swig esta abandonado; Nunjucks mantiene la misma
  sintaxis (`{% block %}`, `{% for %}`, `{{ }}`) y se integra con Express
  mediante `res.render()`.
- **body-parser → Express**: desde Express 4.16 el cuerpo de las peticiones se
  parsea con `express.json()` y `express.urlencoded()`, asi que el paquete
  extra ya no hace falta.
- **MongoDB 2.x → 7.x**: el driver solo trabaja con promesas, asi que
  `modules/gestorDB.js` se ha reescrito con `async/await` sobre un unico
  cliente con pool de conexiones (`insert` → `insertOne`, `remove` →
  `deleteMany`, `update` → `updateOne`/`replaceOne`, `count` →
  `countDocuments`, `ObjectID` → `ObjectId`).
- **mLab → MongoDB local**: la base de datos se configura por variable de
  entorno (`MONGODB_URI`).
- **Contraseñas**: el HMAC compartido se ha sustituido por `scrypt` con sal
  aleatoria y comparacion en tiempo constante (`modules/passwords.js`).

## Funcionalidad

- **Listado y filtros** (`/recetas`):  por titulo, tiempo maximo, dificultad,
  etiqueta e ingrediente. Se combinan entre si y con la paginacion, y todo va
  en la querystring para poder compartir la url.
- **Busqueda textual** (barra de navegacion y `?q=...`):  busca en el titulo,
  las etiquetas, los ingredientes y la preparacion, ordena por relevancia y se
  combina con el resto de filtros.
- **Receta del dia** (portada):  se elige a partir de la fecha, asi que no
  cambia durante el dia y no hace falta guardar estado.
- **Menu aleatorio** (`/menu`):  solo comidas, solo cenas, ambos o postres.
- **Recetas relacionadas**:  el detalle de cada receta sugiere hasta cuatro
  que comparten etiquetas o ingredientes, por numero de coincidencias.
- **Recetas completas**:  ademas del titulo, el tiempo, la dificultad y el
  momento del dia, cada receta tiene sus ingredientes, los pasos de la
  preparacion (numerados), una foto y un video.
- **Raciones**:  cada receta dice para cuantas personas es y el detalle deja
  subir o bajarlas con un boton (?raciones=6), escalando las cantidades de
  los ingredientes que la traigan escrita ("200 g de harina" pasa a "400 g").
- **Lista de la compra** (`/lista`):  en el listado se marcan las recetas con
  las que se va a cocinar y la lista agrupa sus ingredientes, sumando los que
  se piden en varias recetas y dejando sin cantidad lo que no la traiga.
- **Favoritos**:  el detalle guarda o quita una receta con la estrella y
  `/mis-recetas` las junta con las que has creado tu.
- **Valoraciones**:  de 1 a 5 estrellas, una por usuario y receta; el detalle
  muestra la media y deja cambiar tu votacion.
- **Videos**:  los de YouTube y Vimeo se incrustan en la pagina de la receta;
  cualquier otro enlace se muestra simplemente como enlace.
- **Fotos**:  se guardan en `public/fotos` con nombre aleatorio, limitadas a
  imagenes JPEG, PNG, WEBP o GIF de hasta 5 MB. La foto se borra del disco
  cuando se quita de la receta o cuando se borra la receta.
- **Etiquetas**:  cada receta lleva las suyas y, al guardarlas, se añaden al
  listado general del que salen el filtro y el autocompletado del formulario.
- **Cuentas**:  registro e inicio de sesion. Guardar recetas exige
  identificarse y cada receta recuerda quien la creo:  solo su autor puede
  editarla o borrarla, y el detalle siempre dice de quien es.
- **Autoria**:  el autor puede cederle la receta a otro usuario desde el
  formulario de edicion, a partir de lo cual el nuevo autor pasa a poder
  editarla y borrarla y el anterior deja de poder tocarla. El nombre del autor
  del detalle enlaza a su recetas (`/recetas?autor=...`), que tambien se puede
  escribir a mano en el filtro del listado.

### Modelo de datos

```
recetas       { titulo, tiempo, raciones, dificultad, momento, ingredientes[],
                preparacion[], etiquetas[], video, foto, autor, creadaEn,
                actualizadaEn }
usuarios      { username, password, creadaEn }     // password: scrypt con sal
etiquetas     { nombre, creadaEn }                 // indice unico sobre nombre
favoritos     { usuario, receta, creadaEn }        // indice unico usuario+receta
valoraciones  { usuario, receta, estrellas, valoradaEn }   // indice unico usuario+receta
```

Los ingredientes y la preparacion se escriben en un textarea, uno por linea;
las etiquetas van separadas por comas. Los ingredientes son texto libre, asi
que tambien sirven para buscar y filtrar; si traen una cantidad delante
("200 g de harina") se lee para escalarlos con las raciones o sumarlos en la
lista de la compra, y si no la traen se quedan tal cual.

La busqueda textual se apoya en un indice de texto de MongoDB
(`busqueda_textual`) sobre titulo, etiquetas, ingredientes y preparacion:  los
pesos hacen que un acierto en el titulo valga mas que en la preparacion, y el
stemmer en espanol busca por raiz, de forma que 'cocinar', 'cocina' y
'cocinando' dan con la misma receta. El indice se crea solo, al conectar.

## Puesta en marcha

1. **Base de datos** (MongoDB 8 en Docker):

   ```bash
   docker run -d --name recetario-mongo -p 27017:27017 -v recetario-mongo-data:/data/db mongo:8
   ```

   En adelante: `docker start recetario-mongo`.

2. **Dependencias y configuracion**:

   ```bash
   npm install
   copy .env.example .env   # en Linux/macOS: cp .env.example .env
   ```

3. **Datos de ejemplo** (opcional):

   ```bash
   npm run seed
   ```

   Inserta las recetas de ejemplo que falten (23 en total) con sus
   ingredientes, preparación y etiquetas, las firma con el usuario `mario` /
   `recetario123` y les pone raciones según el momento del día. Se puede
   ejecutar cuantas veces se quiera: también rellena las recetas antiguas que
   se hayan quedado sin autor ni raciones.

4. **Arrancar**:

   ```bash
   npm start     # node app.js
   npm run dev   # nodemon, recarga al guardar
   ```

   La aplicacion queda en <http://localhost:8081>.

5. **Pruebas** (con el servidor levantado):

   ```bash
   npm test
   ```

   Recorre todas las rutas y comprueba filtros, busqueda textual, paginacion,
   recetas relacionadas, sesiones, menu, alta, edicion y borrado de recetas,
   permisos de autor, cesion de autoría y filtro por autor, subida de fotos,
   incrustacion de videos, escape de HTML, raciones, lista de la compra,
   favoritos y valoraciones.
   Los datos que crea la prueba se borran al terminar.

## Rutas

| Ruta | Descripcion |
| --- | --- |
| `GET /` | Portada con la receta del dia |
| `GET /recetas` | Listado paginado con filtros (`titulo`, `tiempo`, `dificultad`, `etiqueta`, `ingrediente`, `autor`, `pg`) |
| `GET /receta/:id` | Detalle. Devuelve JSON si se pide con `Accept: application/json` |
| `GET/POST /receta` | Formulario y alta de recetas (requiere sesion) |
| `GET /receta/:id/editar` | Formulario de edicion, relleno (requiere sesion) |
| `POST /receta/:id` | Guarda los cambios y, si se pide, cede la autoría (requiere ser el autor) |
| `POST /receta/:id/borrar` | Borra la receta y su foto (requiere sesion) |
| `GET /lista` | Lista de la compra (`recetas=id1,id2`) |
| `POST /receta/:id/favorito` | Guarda o quita la receta de favoritos (requiere sesion) |
| `POST /receta/:id/valoracion` | De 1 a 5 estrellas, una por usuario (requiere sesion) |
| `GET /mis-recetas` | Tus favoritas y las que has creado (requiere sesion) |
| `GET/POST /menu` | Menu aleatorio (`momento`, `numero`) |
| `GET/POST /login` | Identificacion |
| `GET/POST /signup` | Registro |
| `GET /logout` | Cierre de sesion |
| `/privado/*` | Protegido por `modules/autenticacion.js` |

## Estructura

```
app.js                  Arranque, middleware y plantillas
modules/
  gestorDB.js           Acceso a datos (MongoDB)
  passwords.js          Hash y verificacion de contrasenas
  autenticacion.js      Middleware de sesion
  filtros.js            Criterios de busqueda del listado y del menu
  receta.js             Lectura y validacion del formulario
  recetaDelDia.js       Eleccion determinista de la receta del dia
  raciones.js           Lectura y escalado de cantidades por raciones
  compra.js             Agrupacion de ingredientes para la lista
  video.js              Incrustacion de videos de YouTube y Vimeo
  fotos.js              Subida y borrado de fotos
routes/
  recetas.js            Listado, filtros, detalle, alta, edicion, borrado,
                        favoritos, valoraciones y mis recetas
  menu.js               Menu aleatorio
  users.js              Registro, login y logout
  compra.js             Lista de la compra
scripts/
  seed.js               Datos de ejemplo
  smoke-test.js         Pruebas de rutas
views/                  Plantillas Nunjucks
public/                 Estaticos (imagenes)
  fotos/                Fotos subidas (en .gitignore)
```

`views/recetasPg.html` dejo de existir:  el listado siempre esta paginado y
los filtros van en la misma plantilla.

## Pendiente

- Las recetas sin autor no las puede editar nadie desde la aplicacion (solo
  ocurre a mano en la base de datos); `npm run seed` se las asigna al usuario
  de ejemplo.
- Una receta por foto. Con varias fotos habria que pensar como organizarlas.
- Las etiquetas se escriben separadas por comas, asi que una etiqueta que
  contenga comas no se puede guardar tal cual (los ingredientes y los pasos no
  tienen ese problema: van uno por linea).
- El escalado por raciones y la suma de la lista de la compra son un intento
  de leer la cantidad de delante de cada ingrediente; un ingrediente raro
  ("al gusto", "un puñado") se queda tal cual y no se suma.
- La lista de la compra vive solo en la url: los checks que marques no se
  guardan al recargar, pero en cambio la lista se puede compartir tal cual.
- `npm audit` avisa de un fallo de denegacion de servicio en `braces`
  (dependencia de `chokidar`, usada por nodemon y por la recarga de
  plantillas de Nunjucks). No tiene correccion publicada y solo afecta a
  entorno de desarrollo.
