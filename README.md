# Recetario
Aplicacion para tener un libro de recetas online

Puedes ver y filtrar las recetas, consultar la receta del dia, generar un menu
aleatorio y añadir tus propias recetas con etiquetas (una vez registrado).

## Stack tecnologico

| Pieza | Version |
| --- | --- |
| Node.js | >= 20 (probado con 24) |
| Express | 5.3 |
| MongoDB (driver oficial) | 7.7 |
| Nunjucks (motor de plantillas) | 3.2 |
| express-session | 1.19 |
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
- **Receta del dia** (portada):  se elige a partir de la fecha, asi que no
  cambia durante el dia y no hace falta guardar estado.
- **Menu aleatorio** (`/menu`):  solo comidas, solo cenas, ambos o postres.
- **Etiquetas**:  cada receta lleva las suyas y, al guardarlas, se añaden al
  listado general del que salen el filtro y el autocompletado del formulario.
- **Cuentas**:  registro e inicio de sesion. Guardar recetas exige identificarse.

### Modelo de datos

```
recetas    { titulo, tiempo, dificultad, momento, ingredientes[], etiquetas[], creadaEn }
usuarios   { username, password, creadaEn }        // password: scrypt con sal
etiquetas  { nombre, creadaEn }                    // indice unico sobre nombre
```

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

   Crea 20 recetas, sus etiquetas y el usuario `mario` / `recetario123`.

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

   Recorre todas las rutas y comprueba filtros, paginacion, sesiones, menu,
   alta de recetas y escape de HTML. Los datos que crea la prueba se borran
   al terminar.

## Rutas

| Ruta | Descripcion |
| --- | --- |
| `GET /` | Portada con la receta del dia |
| `GET /recetas` | Listado paginado con filtros (`titulo`, `tiempo`, `dificultad`, `etiqueta`, `ingrediente`, `pg`) |
| `GET /receta/:id` | Detalle. Devuelve JSON si se pide con `Accept: application/json` |
| `GET/POST /receta` | Formulario y alta de recetas (requiere sesion) |
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
routes/
  recetas.js            Listado, filtros, detalle y alta
  menu.js               Menu aleatorio
  users.js              Registro, login y logout
scripts/
  seed.js               Datos de ejemplo
  smoke-test.js         Pruebas de rutas
views/                  Plantillas Nunjucks
public/                 Estaticos (imagenes)
```

`views/recetasPg.html` dejo de existir:  el listado siempre esta paginado y
los filtros van en la misma plantilla.

## Pendiente

- Editar y borrar recetas (`PUT /receta` sigue sin implementarse).
- Subir fotos de las recetas.
- Los ingredientes y las etiquetas se escriben separados por comas, asi que un
  valor que contenga comas no se puede guardar tal cual.
- `npm audit` avisa de un fallo de denegacion de servicio en `braces`
  (dependencia de `chokidar`, usada por nodemon y por la recarga de
  plantillas de Nunjucks). No tiene correccion publicada y solo afecta a
  entorno de desarrollo.
