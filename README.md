# Recetario
Aplicacion para tener un libro de recetas online

Puedes ver y filtrar las recetas, consultar la receta del dia, generar un menu
aleatorio, montar tu menu de la semana, tener perfil publico con tus recetas y
añadir las tuyas con ingredientes, preparación, fotos y video (una vez
registrado).

## Stack tecnologico

| Pieza | Version |
| --- | --- |
| Node.js | >= 20 (probado con 24) |
| Express | 5.3 |
| MongoDB (driver oficial) | 7.7 |
| Nunjucks (motor de plantillas) | 3.2 |
| express-session | 1.19 |
| connect-mongo (sesiones en MongoDB) | 6.0 |
| multer (subida de fotos) | 2.4 |
| Bootstrap (frontend) | 5.3.8 (CDN) |

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
  preparacion (numerados), sus fotos y un video. Los pasos se pueden marcar
  mientras se cocina:  las casillas se guardan en la sesion de cada
  navegador, como las de la lista de la compra, y lo marcado sale tachado.
- **Raciones**:  cada receta dice para cuantas personas es y el detalle deja
  subir o bajarlas con un boton (?raciones=6), escalando las cantidades de
  los ingredientes que la traigan escrita ("200 g de harina" pasa a "400 g").
  Se entienden enteros y decimales ("200 g", "1,5 l"), fracciones ("1/2
  taza", "½ taza", "1 1/2 taza"), palabras de numero con unidad detras
  ("una cucharada", "un puñado", "media taza") y rangos ("2-3 huevos" pasa a
  "4-6"):  un rango se escala de extremo a extremo, pero en la lista de la
  compra no se suma, porque sumar rangos no tiene sentido.
- **Lista de la compra** (`/lista`):  en el listado se marcan las recetas con
  las que se va a cocinar y la lista agrupa sus ingredientes, sumando los que
  se piden en varias recetas y dejando sin cantidad lo que no la traiga. Cada
  ingrediente se puede marcar como comprado:  las marcas se guardan en la
  sesion de cada navegador, asi que aguantan al recargar o volver otro dia,
  mientras que las recetas elegidas siguen yendo en la url para compartir la
  lista tal cual. La misma lista se descarga en texto plano (?formato=txt,
  con una casilla por ingrediente) y la pagina se imprime limpia con Ctrl+P:
  se van la barra y los botones y queda solo la lista.
- **Favoritos**:  el detalle guarda o quita una receta con la estrella y
  `/mis-recetas` las junta con las que has creado tu.
- **Valoraciones**:  de 1 a 5 estrellas, una por usuario y receta; el detalle
  muestra la media y deja cambiar tu votacion.
- **Videos**:  los de YouTube y Vimeo se incrustan en la pagina de la receta;
  cualquier otro enlace se muestra simplemente como enlace.
- **Fotos**:  cada receta admite hasta seis. Se guardan en `public/fotos` con
  nombre aleatorio y solo se aceptan imagenes JPEG, PNG, WEBP o GIF de hasta
  5 MB. El detalle las enseña en galeria (y en miniatura en el listado), el
  formulario deja subir varias de una vez y marcar cuales se quitan al guardar;
  las que se dejan de usar se borran del disco, igual que al borrar la receta.
- **Etiquetas**:  van una por linea en el formulario, en minusculas y sin
  repetidas. Como el separador ya no es la coma, una etiqueta puede llevar
  comas ("pollo, con piel"); al guardarlas entran en el listado general del
  que sale el filtro del listado.
- **Cuentas**:  registro e inicio de sesion. Guardar recetas exige
  identificarse y cada receta recuerda quien la creo:  solo su autor puede
  editarla o borrarla, y el detalle siempre dice de quien es.
- **Autoria**:  el autor puede cederle la receta a otro usuario desde el
  formulario de edicion, a partir de lo cual el nuevo autor pasa a poder
  editarla y borrarla y el anterior deja de poder tocarla. El nombre del autor
  del detalle enlaza a su recetas (`/recetas?autor=...`), que tambien se puede
  escribir a mano en el filtro del listado.
- **Perfil de usuario**:  cada usuario tiene una pagina publica
  (`/usuario/nombre`) con su foto, su descripcion, cuando se apunto y sus
  recetas paginadas. Desde `/cuenta` se cambia la descripcion y la foto de
  perfil (JPEG, PNG, WEBP o GIF de hasta 2 MB, guardada en
  `public/avatars`) y se cambia la contraseña pidiendo la actual. Tambien
  se puede borrar la cuenta escribiendo la contraseña:  se lleva por
  delante sus recetas con sus fotos, los favoritos y valoraciones de esas
  recetas, sus propios favoritos y valoraciones y sus semanas del menu.
- **Menu semanal** (`/semana`):  una tabla de los siete dias por los cuatro
  momentos del dia en la que cada hueco admite varias recetas (sin repetir
  la misma dos veces). Se navega de semana en semana, se pueden rellenar los
  huecos vacios con recetas al azar de cada momento o vaciar la semana
  entera, y cada usuario guarda la suya. De la semana sale un enlace a la
  lista de la compra con todos sus platos (`/lista?recetas=...`), que ya
  sabe sumar ingredientes y descargarla en texto.

### Modelo de datos

```
recetas       { titulo, tiempo, raciones, dificultad, momento, ingredientes[],
                preparacion[], etiquetas[], video, fotos[], autor, creadaEn,
                actualizadaEn }
usuarios      { username, password, bio, avatar, creadaEn }   // password: scrypt con sal
etiquetas     { nombre, creadaEn }                 // indice unico sobre nombre
favoritos     { usuario, receta, creadaEn }        // indice unico usuario+receta
valoraciones  { usuario, receta, estrellas, valoradaEn }   // indice unico usuario+receta
semanas       { usuario, semana, platos, creadaEn, actualizadaEn }  // indice unico usuario+semana
sessions      { _id, session, expires }             // sesiones (connect-mongo, ttl 7 dias)
```

La semana del menu se identifica por el lunes que la abre (`"2026-10-12"`) y
`platos` guarda, por cada dia de la semana, las recetas de cada momento:
`{ '2026-10-12': { comida: [id1, id2], cena: [id3] } }`.

Los ingredientes, la preparacion y las etiquetas se escriben en un textarea,
uno por linea:  por eso una etiqueta puede llevar comas sin confundirse con
ningun separador. Los ingredientes son texto libre, asi
que tambien sirven para buscar y filtrar; si traen una cantidad delante
("200 g de harina", "1/2 taza", "un puñado") se lee para escalarlos con las
raciones o sumarlos en la lista de la compra, y si no la traen se quedan tal
cual.

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
   ejecutar cuantas veces se quiera:  también rellena las recetas que se
   hayan quedado sin autor (o con el autor a `null` o vacío), sin raciones o
   sin lista de fotos.

4. **Arrancar**:

   ```bash
   npm start     # node app.js
   npm run dev   # node --watch solo sobre el codigo (app, modules, routes),
                 # no sobre node_modules, asi que un roce del antivirus no
                 # reinicia el servidor en medio de las pruebas
   ```

   La aplicacion queda en <http://localhost:8081>.

5. **Pruebas** (con el servidor levantado):

   ```bash
   npm test
   ```

   Recorre todas las rutas y comprueba filtros, busqueda textual, paginacion,
   recetas relacionadas, sesiones, menu, alta, edicion y borrado de recetas,
   permisos de autor, cesion de autoría y filtro por autor, etiquetas con
   comas, subida y quitado de fotos, incrustacion de videos, escape de HTML,
   raciones (incluidas cantidades raras:  fracciones, rangos y "un puñado"),
   lista de la compra, su descarga en .txt y sus marcas, pasos
   marcados de la preparacion, favoritos y valoraciones, el perfil publico y
   la edicion de la cuenta (descripcion, avatar, cambio de contraseña y
   borrado con todo lo suyo), el menu semanal (anadir, quitar, no repetir en
   un hueco, no colar dias de otra semana, rellenar, vaciar, navegar de
   semana y su lista de la compra), que el seed reparte las recetas que no
   tengan autor y que las sesiones se guardan en MongoDB.
   Los datos que crea la prueba se borran al terminar.

### Pila completa con Docker Compose

Ademas del flujo anterior (app en local y solo MongoDB en Docker), el repo
trae un `compose.yaml` que construye la app y levanta mongo con sus propios
volumenes, sin tocar la base de desarrollo ni el puerto 8081:

```bash
docker compose up -d --build                       # arranca todo (app en el 8082)
docker compose run --rm app node scripts/seed.js   # datos de ejemplo, una vez
# http://localhost:8082
docker compose down -v                             # para; -v borra tambien los volumenes
```

Dentro de la red de compose la base se llama `mongo` (sale del propio
`compose.yaml`) y las fotos subidas y los avatares se guardan en volumenes
propios. Si expones el
servicio, define `SESSION_SECRET` en el entorno en lugar de dejar el valor
por defecto.

## Rutas

| Ruta | Descripcion |
| --- | --- |
| `GET /` | Portada con la receta del dia |
| `GET /recetas` | Listado paginado con filtros (`titulo`, `tiempo`, `dificultad`, `etiqueta`, `ingrediente`, `autor`, `pg`) |
| `GET /receta/:id` | Detalle. Devuelve JSON si se pide con `Accept: application/json` |
| `GET/POST /receta` | Formulario y alta de recetas (requiere sesion) |
| `GET /receta/:id/editar` | Formulario de edicion, relleno (requiere sesion) |
| `POST /receta/:id` | Guarda los cambios y, si se pide, cede la autoría (requiere ser el autor) |
| `POST /receta/:id/borrar` | Borra la receta y sus fotos (requiere sesion) |
| `GET /lista` | Lista de la compra (`recetas=id1,id2`; `formato=txt` la descarga) |
| `POST /lista/marcar` | Guarda en la sesion las marcas de los ingredientes |
| `POST /lista/vaciar` | Quita todas las marcas |
| `POST /receta/:id/favorito` | Guarda o quita la receta de favoritos (requiere sesion) |
| `POST /receta/:id/valoracion` | De 1 a 5 estrellas, una por usuario (requiere sesion) |
| `POST /receta/:id/pasos` | Guarda en la sesion los pasos marcados de la preparacion |
| `GET /mis-recetas` | Tus favoritas y las que has creado (requiere sesion) |
| `GET /usuario/:nombre` | Perfil publico:  avatar, descripcion, alta y recetas (`pg`) |
| `GET /cuenta` | Editar tu perfil, tu contraseña o borrar la cuenta (requiere sesion) |
| `POST /cuenta` | Guarda la descripcion y la foto de perfil |
| `POST /cuenta/password` | Cambio de contraseña (pide la actual) |
| `POST /cuenta/borrar` | Borra la cuenta con todo lo suyo (pide la contraseña) |
| `GET /semana` | Menu semanal (`sem` = cualquier dia de la semana; por defecto, la actual) |
| `POST /semana/anadir` | Anade una receta a un hueco (`sem`, `dia`, `momento`, `receta`) |
| `POST /semana/quitar` | Quita una receta de su hueco |
| `POST /semana/rellenar` | Rellena los huecos vacios con recetas al azar |
| `POST /semana/vaciar` | Borra la semana entera |
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
  semana.js             Fechas, dias y momentos del menu semanal
  video.js              Incrustacion de videos de YouTube y Vimeo
  fotos.js              Subida y borrado de fotos y avatares
routes/
  recetas.js            Listado, filtros, detalle, alta, edicion, borrado,
                        favoritos, valoraciones y mis recetas
  menu.js               Menu aleatorio
  users.js              Registro, login y logout
  compra.js             Lista de la compra
  cuenta.js             Perfil publico, edicion de la cuenta y su borrado
  semana.js             Menu semanal
scripts/
  seed.js               Datos de ejemplo
  smoke-test.js         Pruebas de rutas
views/                  Plantillas Nunjucks
public/                 Estaticos (imagenes)
  fotos/                Fotos subidas (en .gitignore)
  avatares/             Fotos de perfil (en .gitignore)
```

`views/recetasPg.html` dejo de existir:  el listado siempre esta paginado y
los filtros van en la misma plantilla.
