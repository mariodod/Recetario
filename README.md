# Recetario
Aplicacion para tener un libro de recetas online

Puedes ver y filtrar las recetas, consultar la receta del dia, generar un menu
aleatorio, montar tu menu de la semana, tener perfil publico con tus recetas y
añadir las tuyas con ingredientes, preparación, fotos y video (una vez
registrado), importarlas de otras paginas, comentarlas y cocinarlas a
pantalla grande.

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
| sharp (redimensionado de imagenes) | 0.35 |
| helmet (cabeceras de seguridad) | 8 |
| express-rate-limit (limites de peticiones) | 8 |
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
- **Modo cocina** (`/receta/:id/cocina`):  la receta a pantalla completa, con
  letra grande y sin la barra de navegacion. Ni una linea de javascript:  los
  pasos se marcan con un formulario normal y se guardan en la sesion, los
  mismos que en el detalle, y las raciones se suben o bajan con enlaces. El
  detalle tiene el boton para entrar.
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
- **Comentarios**:  cada receta tiene los suyos, con el avatar y el perfil de
  quien comenta y la fecha. Borrarlo puede su autor o el de la receta, que
  limpia lo que se publiques en su casa. El texto se pinta escapado (es del
  usuario) y los comentarios se borran en cascada con su receta o con su
  cuenta.
- **Videos**:  los de YouTube y Vimeo se incrustan en la pagina de la receta;
  cualquier otro enlace se muestra simplemente como enlace.
- **Fotos**:  cada receta admite hasta seis. Se guardan en `public/fotos` con
  nombre aleatorio y solo se aceptan imagenes JPEG, PNG, WEBP o GIF de hasta
  5 MB. Al subirlas se redimensionan (`sharp`):  las de receta bajan a como
  maximo 1600 px de lado y los avatares quedan en cuadro de 512 px, se
  convierte al formato que menos pese segun el caso y se les borran los
  metadatos EXIF (orientacion, modelo de camara...); los GIF se dejan tal
  cual para no romper su animacion (pero se comprueba que sean un GIF de
  verdad, no un fichero con ese nombre) y, si el procesado falla, no se
  guarda nada. El detalle las enseña en galeria (y en miniatura en el
  listado), el formulario deja subir varias de una vez y marcar cuales se
  quitan al guardar; las que se dejan de usar se borran del disco, igual que
  al borrar la receta.
- **Importar recetas** (`/receta/importar`):  pega la url de una pagina con
  receta y la app baja su JSON-LD (schema.org) y rellena el formulario de
  alta con el titulo, las duraciones ISO, las raciones, los ingredientes, los
  pasos (incluidos los anidados en secciones) y las etiquetas que encuentre;
  desde ahi se guarda como cualquier otra, revisandola antes. Por seguridad
  solo se admiten urls http/https de hosts publicos:  el DNS se comprueba
  antes de bajar nada y las direcciones privadas o de red interna se
  rechazan tambien en las redirecciones, con tope de 2 MB y 8 segundos.
  Limitada a 15 importaciones por usuario y rato.
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
  delante sus recetas con sus fotos y los comentarios de esas recetas, los
  favoritos y valoraciones de esas recetas, sus propios favoritos,
  valoraciones y comentarios y sus semanas del menu.
- **Menu semanal** (`/semana`):  una tabla de los siete dias por los cuatro
  momentos del dia en la que cada hueco admite varias recetas (sin repetir
  la misma dos veces). Se navega de semana en semana, se pueden rellenar los
  huecos vacios con recetas al azar de cada momento o vaciar la semana
  entera, y cada usuario guarda la suya. De la semana sale un enlace a la
  lista de la compra con todos sus platos (`/lista?recetas=...`), que ya
  sabe sumar ingredientes y descargarla en texto.
- **Seguridad**:  cabeceras con `helmet`, con una CSP a medida:  la app no
  tiene ni una linea de javascript propio, asi que `script-src` es
  `'self'` (ninguna inyeccion pasa); la hoja de estilos del CDN, los
  estilos propios y los iframes de YouTube y Vimeo van permitidos uno a uno.
  Ademas, todos los formularios y todas las rutas POST llevan un token CSRF
  sincronizador por sesion (comparado en tiempo constante), el login y el
  registro limitan los intentos (50 por 15 minutos), cerrar la sesion es
  POST con su token y al entrar se regenera el id de la sesion.

### Como se protegen los formularios

- **Token CSRF**:  cada sesion tiene un token que se esconde en todos los
  formularios y que `modules/csrf.js` exige en cada peticion POST, comparandolo
  con el de la sesion en tiempo constante. El token tambien viaja en una cookie
  espejo (httpOnly y SameSite estricto) para que los clientes de programacion
  puedan obtenerlo; la validacion es SIEMPRE contra la sesion, asi que la
  cookie no sirve para forjar nada. Si el cuerpo llega sin token (porque al
  leer un fichero demasiado grande multer corta el multipart), se usa el de la
  cookie:  el resultado es el mismo porque lo que se compara sigue siendo el
  token de la sesion.
- **Formularios malformados**:  un cuerpo como `usuario[algo]=x` llega como
  objeto. `modules/formulario.js` lo detecta y la peticion se rechaza con un
  400 y el formulario de vuelta, en vez de reventar (500) o de guardar un
  nombre absurdo como "[object Object]".
- **Ficheros que no valen**:  un fichero de tipo no permitido se descarta
  sin abortar la peticion, de modo que el resto del formulario (con su token)
  se lee igual y el usuario ve el aviso real ("las fotos deben ser imagenes
  JPEG, PNG, WEBP o GIF") en vez de un rechazo incomprensible.

### Modelo de datos

```
recetas       { titulo, tiempo, raciones, dificultad, momento, ingredientes[],
                preparacion[], etiquetas[], video, fotos[], autor, creadaEn,
                actualizadaEn }
usuarios      { username, password, bio, avatar, creadaEn }   // password: scrypt con sal
etiquetas     { nombre, creadaEn }                 // indice unico sobre nombre
favoritos     { usuario, receta, creadaEn }        // indice unico usuario+receta
valoraciones  { usuario, receta, estrellas, valoradaEn }   // indice unico usuario+receta
comentarios   { receta, usuario, texto, creadaEn }   // indice receta+creadaEn; receta en texto
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

### Limitaciones conocidas

Cosas que la aplicacion **no** garantiza, para no dar por hecho mas de lo que
hace:

- **El importador comprueba el DNS antes de bajar, pero no lo fija**:  entre la
  comprobacion y la descarga el host se vuelve a resolver, asi que un DNS
  malicioso podria cambiar la respuesta. Es el limite clasico del SSRF por
  nombre de host; se cierra fijando la IP resuelta en la conexion.
- **Las cookies no se marcan como `secure`**:  la app funciona tal cual en
  http, que es lo comodo en desarrollo y en la pila de Docker. Si la expones
  a internet, ponla detras de un proxy con https y activa `secure` en las
  cookies de sesion y de CSRF.
- **Borrar una cuenta no cierra sus otras sesiones**:  la sesion actual si se
  cierra, pero las demas quedan en la base hasta que caducan (7 dias). Quien
  borrase la cuenta tendria que invalidar esas sesiones a mano.
- **El limite de intentos es por direccion IP**:  sirve contra un bot que va
  solo, no contra uno que reparta las peticiones. Detras de un proxy hay que
  configurar `trust proxy` para que la IP sea la real.
- **No hay recuperacion de contraseña ni verificacion del correo**:  las
  cuentas se identifican con usuario y contraseña, sin correo.
- **El modo cocina no recuerda nada entre dispositivos**:  los pasos marcados
  viven en la sesion del navegador, como las marcas de la lista de la compra.

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

   En `.env` se pueden tocar `PORT`, `MONGODB_URI` y `SESSION_SECRET`. La
   unica variable extra es `IMPORTAR_PERMITE_LOCAL=si`, que solo sirve para
   probar la importacion por url contra un servidor local de mentiras (por
   defecto, las urls de red interna se rechazan).

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

5. **Pruebas** (solo hace falta la base de datos: la suite levanta y apaga
   su propio servidor en un puerto libre, asi que un arranque o una parada
   del servidor de desarrollo no la toca):

   ```bash
   npm test
   ```

   Recorre todas las rutas y comprueba filtros, busqueda textual, paginacion,
   recetas relacionadas, sesiones, menu, alta, edicion y borrado de recetas,
   permisos de autor, cesion de autoría y filtro por autor, etiquetas con
   comas, subida y quitado de fotos (incluidos el redimensionado, el EXIF, los
   GIF, un GIF que no es un GIF y una foto que pesa demasiado), incrustacion
   de videos, escape de HTML,
   raciones (incluidas cantidades raras:  fracciones, rangos y "un puñado"),
   la lista de la compra, su descarga en .txt y sus marcas, los pasos
   marcados de la preparacion, favoritos y valoraciones, comentarios y sus
   permisos, el modo cocina, importar recetas por url (contra un servidor
   local de mentiras, con sus ataques de red interna y sus urls raras
   rechazados), el perfil publico y la edicion de la cuenta (descripcion,
   avatar, cambio de contraseña y borrado con todo lo suyo, comentarios
   incluidos), el menu semanal (anadir, quitar, no repetir en
   un hueco, no colar dias de otra semana, rellenar, vaciar, navegar de
   semana y su lista de la compra), las cabeceras de seguridad, el token
   CSRF (tambien rechazando las peticiones sin el o con uno inventado), el
   limite de intentos de login, los formularios con el cuerpo malformado
   (que se rechazan con un 400 y sin dejar basura en la base de datos), que
   el seed reparte las recetas que no
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
| `GET /receta/:id/cocina` | Modo cocina:  letra grande, sin barra ni javascript |
| `GET/POST /receta/importar` | Importa una receta de otra pagina por su url (requiere sesion) |
| `GET/POST /receta` | Formulario y alta de recetas (requiere sesion) |
| `GET /receta/:id/editar` | Formulario de edicion, relleno (requiere sesion) |
| `POST /receta/:id` | Guarda los cambios y, si se pide, cede la autoría (requiere ser el autor) |
| `POST /receta/:id/borrar` | Borra la receta y sus fotos (requiere sesion) |
| `GET /lista` | Lista de la compra (`recetas=id1,id2`; `formato=txt` la descarga) |
| `POST /lista/marcar` | Guarda en la sesion las marcas de los ingredientes |
| `POST /lista/vaciar` | Quita todas las marcas |
| `POST /receta/:id/favorito` | Guarda o quita la receta de favoritos (requiere sesion) |
| `POST /receta/:id/valoracion` | De 1 a 5 estrellas, una por usuario (requiere sesion) |
| `POST /receta/:id/comentarios` | Publica un comentario (requiere sesion) |
| `POST /comentario/:id/borrar` | Borra un comentario:  su autor o el de la receta |
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
| `POST /logout` | Cierre de sesion (por POST, con su token CSRF) |
| `/privado/*` | Zona reservada y protegida por `modules/autenticacion.js` (sin rutas por ahora) |

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
  fotos.js              Subida, redimensionado y borrado de fotos y avatares
  csrf.js               Token CSRF sincronizador por sesion
  formulario.js         Lectura segura de los campos de los formularios
  importar.js           Lectura del JSON-LD ajeno y comprobacion de la url
routes/
  recetas.js            Listado, filtros, detalle, alta, edicion, borrado,
                        favoritos, valoraciones, modo cocina y mis recetas
  menu.js               Menu aleatorio
  users.js              Registro, login y logout
  compra.js             Lista de la compra
  cuenta.js             Perfil publico, edicion de la cuenta y su borrado
  semana.js             Menu semanal
  importar.js           Importar recetas por url
  comentarios.js        Comentarios de las recetas
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
