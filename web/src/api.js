// Cliente de la API REST. El token JWT (8 h) se guarda en el navegador.
const CLAVE = 'tice_token';

export function leerToken() {
  try { return localStorage.getItem(CLAVE); } catch { return null; }
}
export function guardarToken(t) {
  try { t ? localStorage.setItem(CLAVE, t) : localStorage.removeItem(CLAVE); } catch { /* sin almacenamiento */ }
}

let alExpirar = () => {};
export const onSesionExpirada = (fn) => { alExpirar = fn; };

export class ApiError extends Error {
  constructor(status, cuerpo) {
    super(cuerpo?.error || `Error ${status}`);
    this.status = status;
    this.cuerpo = cuerpo;
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const SIN_CONEXION = 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo en unos segundos.';

// fetch con mensaje en español si no hay red (el navegador dice "Failed to fetch")
async function conectar(url, opciones) {
  try { return await fetch(url, opciones); } catch { throw new ApiError(0, { error: SIN_CONEXION }); }
}

async function solicitud(metodo, ruta, cuerpo) {
  const token = leerToken();
  const opciones = {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  };
  // las consultas (GET) se reintentan solas si el servidor se está reiniciando o despertando
  let r;
  for (let intento = 0; ; intento++) {
    try {
      r = await conectar(`/api${ruta}`, opciones);
      if (metodo !== 'GET' || ![502, 503, 504].includes(r.status) || intento >= 3) break;
    } catch (err) {
      if (metodo !== 'GET' || intento >= 3) throw err;
    }
    await esperar(2000 * (intento + 1));
  }
  const tipo = r.headers.get('content-type') || '';
  const datos = tipo.includes('application/json') ? await r.json() : await r.text();
  if (!r.ok) {
    if (r.status === 401 && token && ruta !== '/auth/login') alExpirar();
    if ([502, 503, 504].includes(r.status) && typeof datos === 'string') throw new ApiError(r.status, { error: 'El sistema se está reiniciando. Inténtalo de nuevo en un minuto.' });
    throw new ApiError(r.status, typeof datos === 'string' ? { error: datos } : datos);
  }
  return datos;
}

export const api = {
  get: (ruta) => solicitud('GET', ruta),
  post: (ruta, cuerpo = {}) => solicitud('POST', ruta, cuerpo),
  put: (ruta, cuerpo = {}) => solicitud('PUT', ruta, cuerpo),
  patch: (ruta, cuerpo = {}) => solicitud('PATCH', ruta, cuerpo),
};

// Envía un archivo tal cual (el Excel del inventario) y devuelve la respuesta JSON
export async function subirArchivo(ruta, archivo) {
  const r = await conectar(`/api${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', Authorization: `Bearer ${leerToken()}` },
    body: archivo,
  });
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(r.status, datos);
  return datos;
}

// Descarga un archivo protegido (CSV) con el token
export async function descargar(ruta, nombre) {
  const r = await conectar(`/api${ruta}`, { headers: { Authorization: `Bearer ${leerToken()}` } });
  if (!r.ok) {
    const cuerpo = await r.json().catch(() => ({}));
    throw new ApiError(r.status, cuerpo);
  }
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}

export const qs = (obj) => {
  const p = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') p.set(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
};
