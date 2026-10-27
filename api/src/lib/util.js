const { invalido } = require('./errores');

function texto(valor, campo, { requerido = false, max = 250 } = {}) {
  if (valor === undefined || valor === null || String(valor).trim() === '') {
    if (requerido) throw invalido(`El campo ${campo} es obligatorio`, { campo });
    return null;
  }
  const t = String(valor).trim();
  if (t.length > max) throw invalido(`El campo ${campo} supera ${max} caracteres`, { campo });
  return t;
}

function entero(valor, campo, { requerido = false } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw invalido(`El campo ${campo} es obligatorio`, { campo });
    return null;
  }
  const n = Number(valor);
  if (!Number.isInteger(n)) throw invalido(`El campo ${campo} debe ser un número entero`, { campo });
  return n;
}

function opcion(valor, campo, opciones, { requerido = true } = {}) {
  if (valor === undefined || valor === null || valor === '') {
    if (requerido) throw invalido(`El campo ${campo} es obligatorio`, { campo });
    return null;
  }
  const v = String(valor).toUpperCase();
  if (!opciones.includes(v)) throw invalido(`${campo} debe ser uno de: ${opciones.join(', ')}`, { campo });
  return v;
}

const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c);

// Días hábiles (lunes a viernes) entre dos fechas, contando ambos extremos
function diasHabiles(inicio, fin, zona = 'America/Lima') {
  const dia = (d) => new Date(new Date(d).toLocaleString('en-US', { timeZone: zona }));
  const a = dia(inicio);
  const b = dia(fin);
  a.setHours(0, 0, 0, 0);
  b.setHours(0, 0, 0, 0);
  let n = 0;
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    const w = d.getDay();
    if (w !== 0 && w !== 6) n++;
  }
  return Math.max(n, 1);
}

// Prioridad según la matriz de impacto y urgencia de ITIL 4 (Tabla 23); la BD aplica la misma regla
const MATRIZ = {
  ALTO: { ALTA: 'CRITICA', MEDIA: 'ALTA', BAJA: 'MEDIA' },
  MEDIO: { ALTA: 'ALTA', MEDIA: 'MEDIA', BAJA: 'BAJA' },
  BAJO: { ALTA: 'MEDIA', MEDIA: 'BAJA', BAJA: 'BAJA' },
};
const prioridadItil = (impacto, urgencia) => MATRIZ[impacto]?.[urgencia] ?? null;

module.exports = { texto, entero, opcion, correoValido, diasHabiles, prioridadItil, MATRIZ };
