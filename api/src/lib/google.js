// Verificación del "Iniciar sesión con Google" (Google Identity Services).
// La web recibe de Google un ID token (JWT firmado con RS256); aquí se comprueba la firma con las claves
// públicas de Google, que el token sea para este sistema (aud) y que el correo esté verificado.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { HttpError } = require('./errores');

const URL_CLAVES = 'https://www.googleapis.com/oauth2/v3/certs';
let cache = { claves: null, vence: 0 };

async function clavesDeGoogle() {
  if (cache.claves && Date.now() < cache.vence) return cache.claves;
  const r = await fetch(URL_CLAVES);
  if (!r.ok) throw new HttpError(502, 'No se pudo contactar con Google para validar el inicio de sesión');
  const { keys } = await r.json();
  cache = { claves: keys, vence: Date.now() + 60 * 60 * 1000 };
  return keys;
}

// Las pruebas reemplazan las claves de Google por unas propias
let obtenerClaves = clavesDeGoogle;
const usarClaves = (fn) => { obtenerClaves = fn || clavesDeGoogle; };

async function verificarTokenGoogle(credencial, clientId) {
  const decodificado = jwt.decode(credencial, { complete: true });
  if (!decodificado?.header?.kid) throw new HttpError(401, 'Credencial de Google inválida');
  const jwk = (await obtenerClaves()).find((k) => k.kid === decodificado.header.kid);
  if (!jwk) throw new HttpError(401, 'Credencial de Google inválida');
  let datos;
  try {
    datos = jwt.verify(credencial, crypto.createPublicKey({ key: jwk, format: 'jwk' }), {
      algorithms: ['RS256'], audience: clientId, issuer: ['accounts.google.com', 'https://accounts.google.com'],
    });
  } catch {
    throw new HttpError(401, 'Credencial de Google vencida o inválida');
  }
  if (datos.email_verified !== true && datos.email_verified !== 'true') throw new HttpError(401, 'Google no ha verificado ese correo');
  return { correo: String(datos.email).toLowerCase(), nombre: datos.name, dominio: datos.hd };
}

module.exports = { verificarTokenGoogle, usarClaves };
