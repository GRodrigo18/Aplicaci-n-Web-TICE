// Importación del inventario desde el Excel de la sede (formato "IET - Inventario de Equipos Tecnológicos").
// No se completa ni se inventa ningún dato: una fila con un dato obligatorio vacío o no reconocido
// se excluye con su motivo, y los valores dudosos se importan tal cual pero se informan como avisos.
const ExcelJS = require('exceljs');
const { HttpError } = require('./errores');

const normalizar = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s+/g, ' ').trim().toUpperCase();
const limpiar = (v) => {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t === '' ? null : t;
};

// Encabezados aceptados para cada campo (ya normalizados)
const ENCABEZADOS = {
  codigo: ['CODIGO', 'CODIGO INTERNO'],
  categoria: ['CATEGORIA', 'TIPO', 'TIPO DE DISPOSITIVO', 'TIPO DE EQUIPO'],
  marca: ['MARCA'],
  modelo: ['MODELO'],
  serie: ['NUMERO DE SERIE', 'SERIE', 'N° DE SERIE'],
  caracteristicas: ['CARACTERISTICAS'],
  mac: ['MAC'],
  estado: ['ESTADO ACTUAL', 'ESTADO'],
  ubicacion: ['UBICACION'],
  responsable: ['RESPONSABLE'],
  propiedad: ['PROPIEDAD'],
  fecha: ['FECHA DE INGRESO', 'FECHA DE ADQUISICION'],
  guia_factura: ['GUIA/FACTURA', 'GUIA / FACTURA', 'FACTURA'],
  observaciones: ['OBSERVACION', 'OBSERVACIONES'],
  sede: ['SEDE'],
};
const OBLIGATORIOS = ['codigo', 'categoria', 'marca', 'estado', 'ubicacion'];

// Categorías del Excel (hoja CODIFICACIÓN) y su tipo en el sistema
const CATEGORIAS = {
  LAPTOP: 'Laptop', NOTEBOOK: 'Laptop',
  TV: 'Televisor', TELEVISOR: 'Televisor',
  'PC ALL IN ONE': 'All in One', 'ALL IN ONE': 'All in One', AIO: 'All in One',
  PC: 'Computadora de escritorio', 'ORDENADOR PC': 'Computadora de escritorio', COMPUTADORA: 'Computadora de escritorio',
  IMPRESORA: 'Impresora', IMPRESORAS: 'Impresora', 'IMPRESORA MULTIFUNCIONAL': 'Impresora',
  SERVIDOR: 'Servidor', SWITCH: 'Switch de red', PROYECTOR: 'Proyector', TABLET: 'Tablet', MONITOR: 'Monitor',
};
// "Defectuoso" del Excel equivale al estado Averiado del sistema
const ESTADOS = {
  OPERATIVO: 'OPERATIVO', DEFECTUOSO: 'AVERIADO', AVERIADO: 'AVERIADO', MALOGRADO: 'AVERIADO',
  MANTENIMIENTO: 'MANTENIMIENTO', 'EN MANTENIMIENTO': 'MANTENIMIENTO', OBSOLETO: 'OBSOLETO',
};
const PROPIEDAD = { PROPIO: 'PROPIO', ALQUILADO: 'ALQUILADO' };
const MAC_COMPLETA = /^([0-9A-F]{2}[:-]){5}[0-9A-F]{2}$/i;

// Valor plano de una celda de ExcelJS (texto enriquecido, fórmulas, hipervínculos)
function valorCelda(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
    if ('result' in v) return valorCelda(v.result);
    if ('text' in v) return valorCelda(v.text);
    return null;
  }
  return v;
}

// Fecha de ingreso: solo se guarda si el Excel trae día, mes y año; un año solo se conserva como observación
function leerFecha(v) {
  if (v === null || v === undefined || v === '') return { fecha: null };
  if (v instanceof Date && !Number.isNaN(v.getTime())) return { fecha: v.toISOString().slice(0, 10) };
  if (typeof v === 'number' && Number.isInteger(v) && v >= 1980 && v <= 2100) return { fecha: null, nota: `Año de ingreso: ${v}` };
  const t = String(v).trim();
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [d, mes, a] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const f = new Date(Date.UTC(a, mes - 1, d));
    if (f.getUTCMonth() === mes - 1 && f.getUTCDate() === d) return { fecha: f.toISOString().slice(0, 10) };
  }
  m = t.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return { fecha: null, nota: `Mes de ingreso: ${t}` };
  if (/^\d{4}$/.test(t)) return { fecha: null, nota: `Año de ingreso: ${t}` };
  return { fecha: null, aviso: `Fecha de ingreso no reconocida («${t}»); se deja vacía` };
}

function buscarEncabezado(hoja) {
  const limite = Math.min(hoja.rowCount, 15);
  for (let f = 1; f <= limite; f++) {
    const fila = hoja.getRow(f);
    const columnas = {};
    fila.eachCell((celda, col) => {
      const n = normalizar(valorCelda(celda.value));
      for (const [campo, nombres] of Object.entries(ENCABEZADOS)) {
        if (nombres.includes(n) && !(campo in columnas)) columnas[campo] = col;
      }
    });
    if (OBLIGATORIOS.every((c) => c in columnas)) return { fila: f, columnas };
  }
  return null;
}

async function leerLibro(buffer) {
  const libro = new ExcelJS.Workbook();
  try {
    await libro.xlsx.load(buffer);
  } catch {
    throw new HttpError(422, 'El archivo no es un Excel .xlsx válido');
  }
  for (const hoja of libro.worksheets) {
    const enc = buscarEncabezado(hoja);
    if (enc) return { hoja, ...enc };
  }
  throw new HttpError(422, `No se encontró una hoja con las columnas ${OBLIGATORIOS.map((c) => ENCABEZADOS[c][0]).join(', ')}`);
}

// Lee el Excel y valida cada fila. tipos: [{id, nombre}]; sede: {id, codigo, nombre}
async function analizarExcel(buffer, { tipos, sede }) {
  const { hoja, fila: filaEnc, columnas } = await leerLibro(buffer);
  const tipoPorNombre = new Map(tipos.map((t) => [normalizar(t.nombre), t.id]));
  const nombresSede = new Set([normalizar(sede.codigo), normalizar(sede.nombre), normalizar(sede.nombre).replace(/^SEDE /, '')]);
  const validas = [];
  const excluidas = [];
  const avisos = [];
  const vistos = new Map();
  let vacias = 0;

  for (let f = filaEnc + 1; f <= hoja.rowCount; f++) {
    const fila = hoja.getRow(f);
    const crudo = {};
    for (const [campo, col] of Object.entries(columnas)) crudo[campo] = valorCelda(fila.getCell(col).value);
    const datos = Object.entries(crudo).filter(([k, v]) => k !== 'sede' && limpiar(v) !== null);
    if (!datos.length) { vacias++; continue; }

    const codigo = limpiar(crudo.codigo)?.toUpperCase() ?? null;
    const excluir = (motivo) => excluidas.push({ fila: f, codigo, motivo });
    if (!codigo) { excluir('Sin código'); continue; }
    if (codigo.length > 40) { excluir('Código de más de 40 caracteres'); continue; }
    if (!/\d/.test(codigo) || /[-\s]$/.test(codigo)) { excluir('Código incompleto (sin número correlativo)'); continue; }
    if (vistos.has(codigo)) { excluir(`Código repetido en el archivo (ya está en la fila ${vistos.get(codigo)})`); continue; }

    const sedeExcel = limpiar(crudo.sede);
    if (columnas.sede !== undefined) {
      if (!sedeExcel) { excluir('Sin sede'); continue; }
      if (!nombresSede.has(normalizar(sedeExcel))) { excluir(`Pertenece a otra sede («${sedeExcel}»)`); continue; }
    }
    const categoria = limpiar(crudo.categoria);
    if (!categoria) { excluir('Sin categoría'); continue; }
    const tipoNombre = CATEGORIAS[normalizar(categoria)];
    const tipoId = tipoPorNombre.get(normalizar(tipoNombre ?? categoria));
    if (!tipoId) { excluir(`Categoría no reconocida («${categoria}»)`); continue; }
    const marca = limpiar(crudo.marca);
    if (!marca) { excluir('Sin marca'); continue; }
    const estadoTxt = limpiar(crudo.estado);
    if (!estadoTxt) { excluir('Sin estado actual'); continue; }
    const estado = ESTADOS[normalizar(estadoTxt)];
    if (!estado) { excluir(`Estado no reconocido («${estadoTxt}»)`); continue; }
    const ubicacion = limpiar(crudo.ubicacion);
    if (!ubicacion) { excluir('Sin ubicación'); continue; }

    const largo = { marca: 60, modelo: 80, serie: 80, ubicacion: 80, mac: 40, responsable: 120, guia_factura: 60, caracteristicas: 500, observaciones: 1000 };
    const d = {
      tipo_id: tipoId, marca, modelo: limpiar(crudo.modelo), serie: limpiar(crudo.serie), estado, ubicacion,
      caracteristicas: limpiar(crudo.caracteristicas), mac: limpiar(crudo.mac), responsable: limpiar(crudo.responsable),
      guia_factura: limpiar(crudo.guia_factura), observaciones: limpiar(crudo.observaciones), propiedad: null, fecha_adquisicion: null,
    };
    const largoExcedido = Object.entries(largo).find(([k, max]) => d[k] && d[k].length > max);
    if (largoExcedido) { excluir(`El campo ${largoExcedido[0]} supera ${largoExcedido[1]} caracteres`); continue; }

    const aviso = (texto) => avisos.push({ fila: f, codigo, aviso: texto });
    const propiedad = limpiar(crudo.propiedad);
    if (propiedad) {
      d.propiedad = PROPIEDAD[normalizar(propiedad)] ?? null;
      if (!d.propiedad) aviso(`Propiedad no reconocida («${propiedad}»); se deja vacía`);
    }
    const fecha = leerFecha(crudo.fecha);
    d.fecha_adquisicion = fecha.fecha;
    if (fecha.nota) d.observaciones = d.observaciones ? `${d.observaciones}. ${fecha.nota}` : fecha.nota;
    if (fecha.aviso) aviso(fecha.aviso);
    if (d.mac && !MAC_COMPLETA.test(d.mac)) aviso(`MAC incompleta o no válida («${d.mac}»); se guarda tal cual`);
    if (d.serie && d.serie.length < 6) aviso(`Número de serie posiblemente incompleto («${d.serie}»); se guarda tal cual`);
    if (normalizar(estadoTxt) === 'DEFECTUOSO') aviso('Estado «Defectuoso» registrado como Averiado');

    vistos.set(codigo, f);
    validas.push({ fila: f, codigo, tipo: tipoNombre ?? categoria, datos: d });
  }
  return { hoja: hoja.name, fila_encabezado: filaEnc, vacias, validas, excluidas, avisos };
}

module.exports = { analizarExcel, normalizar };
