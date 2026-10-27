// Escalamiento de incidencias según ITIL 4.
// Nivel 1: TICE de la sede. Nivel 2: Coordinación General TICE / Director de TI (rol Director).
// Nivel 3: proveedor externo (garantía del fabricante, proveedor de internet o servicio técnico).
// Escalamiento funcional: lo pide el TICE cuando la falla supera su capacidad o necesita al proveedor.
// Escalamiento jerárquico: automático, con alerta al 75 % del SLA y paso al nivel 2 al vencer el SLA.
const { query, tx } = require('../db');
const { registrar } = require('./bitacora');
const notificaciones = require('./notificaciones');

const NIVELES = { 1: 'TICE de la sede', 2: 'Coordinación TICE / Director de TI', 3: 'Proveedor externo' };
const UMBRAL_ALERTA = 0.75;

// Sube el nivel de un ticket bloqueado (FOR UPDATE) dentro de la transacción c
async function escalar(c, usuario, t, { nivel, motivo, proveedor = null, caso = null, automatico = false }) {
  await c.query(
    `UPDATE incidencias SET nivel_escalamiento=$2, escalado_en=now(), proveedor_externo=coalesce($3, proveedor_externo),
            caso_proveedor=coalesce($4, caso_proveedor), actualizado_en=now() WHERE id=$1`,
    [t.id, nivel, proveedor, caso]);
  await registrar(c, usuario, {
    entidad: 'incidencia', entidadId: t.id, accion: 'ESCALAR', sedeId: t.sede_id,
    detalle: {
      numero: t.numero, tipo: automatico ? 'JERARQUICO_AUTOMATICO' : 'FUNCIONAL', motivo,
      proveedor, caso_proveedor: caso, cambios: { nivel_escalamiento: { antes: t.nivel_escalamiento, despues: nivel } },
    },
  });
}

// Ticket con los minutos transcurridos, para los avisos
async function ticketConSla(c, id) {
  const { rows: [t] } = await c.query(
    `SELECT i.*, p.nombre AS prioridad_nombre, p.sla_minutos, s.nombre AS sede_nombre,
            round(extract(epoch FROM (now() - i.fecha_registro)) / 60)::int AS minutos
       FROM incidencias i JOIN prioridades p ON p.codigo = i.prioridad JOIN sedes s ON s.id = i.sede_id
      WHERE i.id = $1`, [id]);
  return t;
}

// Aviso por correo a los usuarios con rol Director (nivel 2)
async function avisarNivel2(c, t, asunto, texto) {
  const { rows } = await c.query(`SELECT correo FROM usuarios WHERE rol = 'DIRECTOR' AND activo`);
  const cuerpo = `${texto}\n\nTicket ${t.numero} · ${t.sede_nombre}\nAsunto: ${t.asunto}\n`
    + `Prioridad: ${t.prioridad_nombre} (SLA ${t.sla_minutos} min) · transcurridos: ${t.minutos} min\n`
    + `Nivel actual: ${t.nivel_escalamiento} (${NIVELES[t.nivel_escalamiento]})\n\nÁrea TICE`;
  for (const { correo } of rows) {
    await notificaciones.encolarInterno(c, t.id, correo, `[${t.numero}] ${asunto}`, cuerpo);
  }
}

// Revisa los tickets abiertos: alerta al 75 % del SLA y escalamiento automático al vencer
async function revisarSla() {
  const { rows } = await query(
    `SELECT i.id FROM incidencias i JOIN prioridades p ON p.codigo = i.prioridad
      WHERE i.estado IN ('PENDIENTE', 'EN_PROCESO')
        AND extract(epoch FROM (now() - i.fecha_registro)) / 60 >= p.sla_minutos * $1::numeric
        AND (i.alerta_sla_en IS NULL
             OR (i.nivel_escalamiento = 1 AND extract(epoch FROM (now() - i.fecha_registro)) / 60 > p.sla_minutos))`,
    [UMBRAL_ALERTA]);
  let cambios = 0;
  for (const { id } of rows) {
    await tx(async (c) => {
      const { rows: [bloq] } = await c.query(
        `SELECT id FROM incidencias WHERE id = $1 AND estado IN ('PENDIENTE', 'EN_PROCESO') FOR UPDATE SKIP LOCKED`, [id]);
      if (!bloq) return;
      const t = await ticketConSla(c, id);
      if (!t.alerta_sla_en) {
        await c.query('UPDATE incidencias SET alerta_sla_en = now(), actualizado_en = now() WHERE id = $1', [id]);
        await registrar(c, null, {
          entidad: 'incidencia', entidadId: id, accion: 'ALERTA_SLA', sedeId: t.sede_id,
          detalle: { numero: t.numero, minutos: t.minutos, sla_minutos: t.sla_minutos },
        });
        await avisarNivel2(c, t, 'Alerta: el ticket consumió el 75 % de su SLA', 'Un ticket abierto está por vencer su tiempo objetivo de atención.');
        cambios++;
      }
      if (t.nivel_escalamiento === 1 && t.minutos > t.sla_minutos) {
        await escalar(c, null, t, { nivel: 2, motivo: 'SLA vencido sin resolver', automatico: true });
        await avisarNivel2(c, { ...t, nivel_escalamiento: 2 }, 'Escalado al nivel 2: SLA vencido',
          'El ticket venció su SLA sin resolverse y pasó al nivel 2. Puede reasignarlo a otro TICE o derivarlo al proveedor.');
        cambios++;
      }
    });
  }
  return cambios;
}

function iniciarRevision(intervaloMs = 60000) {
  const tick = () => revisarSla().catch((err) => console.error('Escalamiento:', err.message));
  return setInterval(tick, intervaloMs);
}

module.exports = { NIVELES, UMBRAL_ALERTA, escalar, revisarSla, iniciarRevision, avisarNivel2, ticketConSla };
