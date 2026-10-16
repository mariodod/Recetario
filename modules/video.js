/**
 * Videos de recetas.
 *
 * Solo se incrustan los servicios de confianza (YouTube y Vimeo); para el
 * resto de enlaces se muestra un enlace normal, asi que pegar una url no
 * convierte la pagina en un iframe de cualquier sitio.
 */

function parsearUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return null;
        }
        return parsed;
    } catch (err) {
        return null;
    }
}

/**
 * Devuelve la url de incrustacion del video o null si no se puede incrustar.
 */
function embeberVideo(url) {
    if (!url) return null;

    const parsed = parsearUrl(url);
    if (!parsed) return null;

    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
        const id = parsed.searchParams.get('v');
        if (id) return incrustar('youtube-nocookie.com', 'embed', id);

        //Formas alternativas:  /shorts/<id>, /embed/<id>, /live/<id>
        const tramos = parsed.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{5,})/);
        if (tramos) return incrustar('youtube-nocookie.com', 'embed', tramos[1]);
    }

    if (host === 'youtu.be') {
        const id = parsed.pathname.split('/').filter(Boolean)[0];
        if (id && /^[A-Za-z0-9_-]{5,}$/.test(id)) return incrustar('youtube-nocookie.com', 'embed', id);
    }

    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
        const tramos = parsed.pathname.match(/^\/(\d+)/);
        if (tramos) return incrustar('player.vimeo.com', 'video', tramos[1]);
    }

    return null;
}

function incrustar(host, seccion, id) {
    return 'https://' + host + '/' + seccion + '/' + encodeURIComponent(id);
}

/**
 * Comprueba que el campo de video venga vacio o sea un enlace utilizable.
 */
function esVideoValido(url) {
    if (!url) return true;
    return parsearUrl(url) !== null;
}

module.exports = { embeberVideo, esVideoValido };
