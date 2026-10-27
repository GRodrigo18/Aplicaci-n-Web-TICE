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

async function solicitud(metodo, ruta, cuerpo) {
  const token = leerToken();
  const r = await fetch(`/api${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  const tipo = r.headers.get('content-type') || '';
  const datos = tipo.includes('application/json') ? await r.json() : await r.text();
  if (!r.ok) {
    if (r.status === 401 && token && ruta !== '/auth/login') alExpirar();
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
  const r = await fetch(`/api${ruta}`, {
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
  const r = await fetch(`/api${ruta}`, { headers: { Authorization: `Bearer ${leerToken()}` } });
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
