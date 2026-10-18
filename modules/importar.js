/**
 * Importar recetas de otras paginas.
 *
 * Casi todas las webs de recetas embeben sus datos en JSON-LD con el tipo
 * "Recipe" de schema.org. Este modulo baja la pagina, busca ese bloque y
 * devuelve la receta ya desmenuzada para el formulario de alta:  quien la
 * importa la revisa y la guarda como cualquier otra.
 *
 * Bajar una url que pide el usuario es un riesgo de seguridad (SSRF):  solo
 * se aceptan http y https contra hosts publicos. El DNS se resuelve antes de
 * bajar nada y las direcciones privadas, de loopback o de metadatos cloud se
 * rechazan, tambien en las redirecciones. Con IMPORTAR_PERMITE_LOCAL=si se
 * permite ademas loopback, para probar contra un servidor local (la suite de
 * pruebas lo usa).
 */
const { promises: dns } = require('node:dns');

const TIMEOUT = 8000;                   //milisegundos para bajar la pagina
const MAXIMO_BYTES = 2 * 1024 * 1024;   //2 MB de html, como mucho
const MAXIMO_SALTOS = 3;                //redirecciones seguidas

/**
 * Dice si una direccion es de Internet de verdad (no privada, no interna).
 */
function esPublica(direccion) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(direccion)) {
        const partes = direccion.split('.').map(Number);
        const primero = partes[0];
        const segundo = partes[1];
        if (primero === 0 || primero === 10 || primero === 127) return false; //red local, privada, loopback
        if (primero === 169 && segundo === 254) return false;                 //metadatos cloud (169.254.169.254)
        if (primero === 172 && segundo >= 16 && segundo <= 31) return false;  //privada
        if (primero === 192 && segundo === 168) return false;                 //privada
        if (primero === 100 && segundo >= 64 && segundo <= 127) return false; //CGNAT
        if (primero >= 224) return false;                                     //multidifusion y reservadas
        return true;
    }

    //IPv6, en minusculas y sin zona
    const ip = String(direccion).toLowerCase().split('%')[0];
    if (ip === '::1' || ip === '::') return false;            //loopback y sin direccion
    if (ip.startsWith('::ffff:')) return esPublica(ip.slice(7)); //mapeada sobre IPv4
    if (ip.startsWith('fc') || ip.startsWith('fd')) return false; //unique local
    if (ip.startsWith('fe80')) return false;                  //enlace local
    if (ip.startsWith('ff')) return false;                    //multidifusion
    return true;
}

/**
 * Comprueba que la url sea utilizable y que su host apunte a algo publico.
 * Devuelve { ok, url } o { ok: false, motivo }.
 */
async function comprobarUrl(texto) {
    let url;
    try {
        url = new URL(String(texto || '').trim());
    } catch (e) {
        return { ok: false, motivo: 'La url no es valida' };
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return { ok: false, motivo: 'Solo se pueden importar paginas http o https' };
    }

    let direcciones;
    try {
        direcciones = await dns.lookup(url.hostname, { all: true });
    } catch (e) {
        return { ok: false, motivo: 'No se puede resolver el host "' + url.hostname + '"' };
    }

    const permiteLocal = /^(si|s|1|true)$/i.test(process.env.IMPORTAR_PERMITE_LOCAL || '');
    for (const entrada of direcciones) {
        const esLoopback = entrada.address === '127.0.0.1' || entrada.address === '::1';
        if (!esPublica(entrada.address) && !(esLoopback && permiteLocal)) {
            return { ok: false, motivo: 'Esa url apunta a una red interna y no se baja' };
        }
    }

    return { ok: true, url: url };
}

/**
 * Baja la pagina siguiendo como mucho tres redirecciones (cada una se vuelve
 * a comprobar contra las reglas de arriba) y con tope de tamanyo.
 */
async function traerHtml(url, saltos) {
    saltos = saltos || 0;

    const respuesta = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT),
        headers: {
            'User-Agent': 'ReceMario/1.0 (importador de recetas)',
            'Accept': 'text/html,application/xhtml+xml'
        }
    });

    if (respuesta.status >= 300 && respuesta.status < 400) {
        if (saltos >= MAXIMO_SALTOS) {
            throw new Error('La pagina da demasiadas vueltas (redirecciones)');
        }
        const destino = respuesta.headers.get('location');
        if (!destino) {
            throw new Error('La pagina redirige sin decir a donde');
        }
        const comprobado = await comprobarUrl(new URL(destino, url).href);
        if (!comprobado.ok) {
            throw new Error(comprobado.motivo);
        }
        return traerHtml(comprobado.url, saltos + 1);
    }

    if (!respuesta.ok) {
        throw new Error('La pagina responde con un error ' + respuesta.status);
    }

    const tipo = respuesta.headers.get('content-type') || '';
    if (tipo && !/html/.test(tipo)) {
        throw new Error('Esa url no trae una pagina html');
    }
    if (Number(respuesta.headers.get('content-length') || 0) > MAXIMO_BYTES) {
        throw new Error('La pagina es demasiado grande');
    }

    const texto = await respuesta.text();
    if (texto.length > MAXIMO_BYTES) {
        throw new Error('La pagina es demasiado grande');
    }
    return texto;
}

/**
 * Quita los restos de html y las entidades que traen las paginas.
 */
function limpiarTexto(texto) {
    return String(texto == null ? '' : texto)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .replace(/\s+([.,;:!?])/g, '$1') //sin huecos sueltos tras quitar etiquetas
        .trim();
}

/**
 * Duraciones ISO 8601 de schema.org ("PT45M", "PT1H30M") a minutos.
 */
function minutosDe(iso) {
    if (!iso) return null;
    const coincidencia = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(iso));
    if (!coincidencia) return null;

    const minutos = Number(coincidencia[1] || 0) * 24 * 60
        + Number(coincidencia[2] || 0) * 60
        + Number(coincidencia[3] || 0)
        + (Number(coincidencia[4] || 0) >= 30 ? 1 : 0);
    return minutos > 0 ? minutos : null;
}

/**
 * Los pasos pueden venir como texto, como cadena de html, como pasos sueltos
 * o agrupados en secciones (HowToSection):  aqui salen todos en orden.
 */
function pasosDe(instrucciones) {
    const pasos = [];
    for (const elemento of [].concat(instrucciones || [])) {
        if (!elemento) continue;

        if (typeof elemento === 'string' || typeof elemento === 'number') {
            const texto = limpiarTexto(elemento);
            if (texto) pasos.push(texto);
        } else if ([].concat(elemento['@type'] || []).includes('HowToSection') && elemento.itemListElement) {
            pasos.push.apply(pasos, pasosDe(elemento.itemListElement));
        } else if (elemento.text) {
            const texto = limpiarTexto(elemento.text);
            if (texto) pasos.push(texto);
        } else if (elemento.name) {
            const texto = limpiarTexto(elemento.name);
            if (texto) pasos.push(texto);
        }
    }
    return pasos;
}

/**
 * "4", "4 porciones" o ["4 raciones"] -> 4 (con tope, como el formulario).
 */
function racionesDe(raciones) {
    const numero = parseInt([].concat(raciones || []).join(' '), 10);
    return Number.isFinite(numero) && numero >= 1 && numero <= 50 ? numero : null;
}

/**
 * keywords puede venir como lista o como "a, b, c"; se quedan pocas y en
 * minusculas, como en el resto de la aplicacion.
 */
function etiquetasDe(datos) {
    const crudas = [].concat(datos.keywords || [], datos.recipeCategory || []);
    const vistas = [];
    for (const cruda of crudas) {
        for (const parte of String(cruda).split(',')) {
            const etiqueta = limpiarTexto(parte).toLowerCase();
            if (etiqueta && etiqueta.length <= 30 && !vistas.includes(etiqueta)) {
                vistas.push(etiqueta);
            }
            if (vistas.length >= 8) return vistas;
        }
    }
    return vistas;
}

/**
 * Los candidatos a receta:  el propio objeto, cualquier elemento de una
 * lista o de un "@graph".
 */
function candidatosDe(datos) {
    const lista = [].concat(datos || []).filter(Boolean);
    const conGrafo = [];
    for (const elemento of lista) {
        if (Array.isArray(elemento['@graph'])) {
            conGrafo.push.apply(conGrafo, elemento['@graph']);
        }
    }
    return lista.concat(conGrafo);
}

function esReceta(elemento) {
    const tipos = [].concat(elemento['@type'] || []).map(function (tipo) {
        return String(tipo).toLowerCase();
    });
    return tipos.includes('recipe');
}

/**
 * De un JSON-LD de tipo Recipe a la receta del formulario (texto, una linea
 * por ingrediente o paso). Devuelve null si no trae titulo o no trae nada
 * que cocinar.
 */
function mapearReceta(datos) {
    const ingredientes = [].concat(datos.recipeIngredient || [])
        .map(limpiarTexto).filter(Boolean);
    const preparacion = pasosDe(datos.recipeInstructions);
    const titulo = limpiarTexto(datos.name || '');

    if (!titulo || (ingredientes.length === 0 && preparacion.length === 0)) {
        return null;
    }

    return {
        titulo: titulo,
        tiempo: minutosDe(datos.totalTime)
            || minutosDe(datos.prepTime)
            || minutosDe(datos.cookTime)
            || 10,
        raciones: racionesDe(datos.recipeYield),
        ingredientes: ingredientes,
        preparacion: preparacion,
        etiquetas: etiquetasDe(datos)
    };
}

/**
 * Busca en el html los bloques JSON-LD y devuelve la primera receta que
 * encuentre, ya mapeada, o null. Los bloques que no sean JSON valido se
 * ignoran:  hay paginas que meten html dentro.
 */
function extraerReceta(html) {
    const bloques = String(html || '').match(
        /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    ) || [];

    for (const bloque of bloques) {
        const contenido = bloque
            .replace(/^[\s\S]*?>/, '')
            .replace(/<\/script>\s*$/i, '');

        let datos;
        try {
            datos = JSON.parse(contenido);
        } catch (e) {
            continue;
        }

        for (const candidato of candidatosDe(datos)) {
            if (esReceta(candidato)) {
                const receta = mapearReceta(candidato);
                if (receta) return receta;
            }
        }
    }
    return null;
}

module.exports = {
    comprobarUrl,
    traerHtml,
    extraerReceta,
    minutosDe,
    limpiarTexto,
    pasosDe
};
