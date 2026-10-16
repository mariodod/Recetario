# Recetario
Aplicacion para tener un libro de recetas online

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

   Crea 13 recetas y el usuario `mario` / `recetario123`.

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

   Recorre todas las rutas y comprueba paginacion, sesiones y escape de HTML.

## Estructura

```
app.js              Arranque, middleware y plantillas
modules/
  gestorDB.js       Acceso a datos (MongoDB)
  passwords.js      Hash y verificacion de contrasenas
routes/
  recetas.js        Listado, paginacion, detalle y alta
  menu.js           Pagina de menu
  users.js          Login / logout
scripts/
  seed.js           Datos de ejemplo
  smoke-test.js     Pruebas de rutas
views/              Plantillas Nunjucks
public/             Estaticos (imagenes)
```

## TODO

- [ ] Añadir etiquetas a cada receta
- [ ] Generar un menu aleatorio:
  - [ ] Solo comidas
  - [ ] Solo cenas
  - [ ] Ambos
  - [ ] Postres
- [ ] Receta del dia
- [ ] Filtrar la lista de recetas en base:
  - [ ] Tiempo
  - [ ] Dificultad
  - [ ] Ingredientes
  - [ ] Etiquetas (vegetariano, fitness, fiesta...)
- [ ] Etiquetas generadas por el usuario:
  - [ ] Guardar cada nueva etiqueta en una lista
  - [ ] Lista aparezca en el filtro
  - [ ] Autocompletado y recomendaciones al añadir etiqueta

### Pendiente conocido

- Registro de usuarios (`/signup`): de momento solo existe el usuario de
  ejemplo que crea `npm run seed`.
- Detalle de receta en HTML: `views/receta.html` esta lista pero
  `GET /receta/:id` devuelve JSON; falta enlazarla desde el listado.
- `npm audit` avisa de un fallo de denegacion de servicio en `braces`
  (dependencia de `chokidar`, usada por nodemon y por la recarga de
  plantillas de Nunjucks). No tiene correccion publicada y solo afecta a
  entorno de desarrollo.
