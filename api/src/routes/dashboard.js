// RF-06 / UC-11 Dashboard con los indicadores del proyecto
const express = require('express');
const { query } = require('../db');
const { h, invalido } = require('../lib/errores');
const { sedeDeConsulta } = require('../lib/auth');

const router = express.Router();

const num = (v) => (v === undefined || v === '' ? null : Number(v));
// Línea base (pre-test) y meta (post-test) de la Tabla 1 del informe.
// Las líneas base que aún no se midieron quedan en null hasta cargarlas en el .env.
const KPI = {
  MTTR: { nombre: 'Tiempo medio de resolución', unidad: 'min', base: num(process.env.LB_MTTR ?? 240), meta: 45, mejor: 'menor' },
  TAI: { nombre: 'Tiempo de auditoría del inventario', unidad: 'días hábiles', base: num(process.env.LB_TAI ?? 10), meta: 3, mejor: 'menor' },
  TEL: { nombre: 'Tasa de equipos localizados', unidad: '%', base: num(process.env.LB_TEL), meta: 98, mejor: 'mayor' },
  CSLA: { nombre: 'Cumplimiento del SLA', unidad: '%', base: num(process.env.LB_CSLA), meta: 90, mejor: 'mayor' },
  DT: { nombre: 'Disponibilidad tecnológica', unidad: '%', base: num(process.env.LB_DT), meta: 95, mejor: 'mayor' },
};

const redondear = (v, d = 1) => (v === null || v === undefined ? null : Math.round(Number(v) * 10 ** d) / 10 ** d);

router.get('/', h(async (req, res) => {
  const sede = sedeDeConsulta(req);
  const desde = req.query.desde || null;
  const hasta = req.query.hasta || null;
  for (const f of [desde, hasta]) if (f && !/^\d{4}-\d{2}-\d{2}$/.test(f)) throw invalido('Fecha inválida (AAAA-MM-DD)');

  const p = [sede, desde, hasta];
  const filtroSede = (alias) => `($1::int IS NULL OR ${alias}.sede_id = $1)`;
  const periodo = `($2::date IS NULL OR i.fecha_resolucion >= $2::date)
               AND ($3::date IS NULL OR i.fecha_resolucion < $3::date + 1)`;

  const inicio = Date.now();
  const [resueltos, equipos, porSede, abiertos, auditorias, porCategoria, porNivel,
    semanal, porTipo, porEstado, porCerrar, correos, sinVerificar, actividad] = await Promise.all([
    // MTTR y CSLA sobre las incidencias resueltas del periodo
    query(`SELECT count(*)::int AS n,
                  avg(extract(epoch FROM (i.fecha_resolucion - i.fecha_registro)) / 60) AS mttr,
                  count(*) FILTER (WHERE extract(epoch FROM (i.fecha_resolucion - i.fecha_registro)) / 60 <= p.sla_minutos)::int AS dentro
             FROM incidencias i JOIN prioridades p ON p.codigo = i.prioridad
            WHERE i.fecha_resolucion IS NOT NULL AND ${filtroSede('i')} AND ${periodo}`, p),
    // DT = equipos operativos ÷ equipos activos (sin los dados de baja)
    query(`SELECT count(*) FILTER (WHERE e.estado <> 'BAJA')::int AS activos,
                  count(*) FILTER (WHERE ee.operativo
                    AND NOT EXISTS (SELECT 1 FROM incidencia_equipos ie JOIN incidencias i ON i.id = ie.incidencia_id
                                     WHERE ie.equipo_id = e.id AND i.estado IN ('PENDIENTE','EN_PROCESO')))::int AS operativos
             FROM equipos e JOIN estados_equipo ee ON ee.codigo = e.estado WHERE ${filtroSede('e')}`, [sede]),
    query(`SELECT s.id, s.nombre, e.estado, ee.nombre AS estado_nombre, count(e.id)::int AS n
             FROM sedes s LEFT JOIN equipos e ON e.sede_id = s.id LEFT JOIN estados_equipo ee ON ee.codigo = e.estado
            WHERE ${filtroSede('e').replace('e.sede_id', 's.id')}
            GROUP BY s.id, s.nombre, e.estado, ee.nombre ORDER BY s.id`, [sede]),
    query(`SELECT i.prioridad, p.nombre, i.estado, count(*)::int AS n,
                  count(*) FILTER (WHERE extract(epoch FROM (now() - i.fecha_registro)) / 60 > p.sla_minutos)::int AS vencidos
             FROM incidencias i JOIN prioridades p ON p.codigo = i.prioridad
            WHERE i.estado IN ('PENDIENTE','EN_PROCESO') AND ${filtroSede('i')}
            GROUP BY i.prioridad, p.nombre, p.orden, i.estado ORDER BY p.orden`, [sede]),
    // última auditoría finalizada de cada sede
    query(`SELECT DISTINCT ON (a.sede_id) a.*, s.nombre AS sede_nombre
             FROM auditorias_inventario a JOIN sedes s ON s.id = a.sede_id
            WHERE a.estado = 'FINALIZADA' AND ${filtroSede('a')}
            ORDER BY a.sede_id, a.fecha_fin DESC`, [sede]),
    query(`SELECT i.categoria, count(*)::int AS n FROM incidencias i
            WHERE ${filtroSede('i')} AND ($2::date IS NULL OR i.fecha_registro >= $2::date)
              AND ($3::date IS NULL OR i.fecha_registro < $3::date + 1)
            GROUP BY i.categoria ORDER BY n DESC`, p),
    // tickets abiertos por nivel de escalamiento (ITIL 4)
    query(`SELECT i.nivel_escalamiento AS nivel, count(*)::int AS n FROM incidencias i
            WHERE i.estado IN ('PENDIENTE','EN_PROCESO') AND ${filtroSede('i')}
            GROUP BY i.nivel_escalamiento ORDER BY i.nivel_escalamiento`, [sede]),
    // MTTR por semana (últimas 10 semanas) para ver su evolución frente a la línea base
    query(`SELECT date_trunc('week', i.fecha_resolucion)::date AS semana, count(*)::int AS n,
                  avg(extract(epoch FROM (i.fecha_resolucion - i.fecha_registro)) / 60) AS mttr
             FROM incidencias i
            WHERE i.fecha_resolucion >= date_trunc('week', now()) - interval '9 weeks' AND ${filtroSede('i')}
            GROUP BY 1 ORDER BY 1`, [sede]),
    query(`SELECT t.nombre AS tipo, count(*)::int AS n FROM equipos e JOIN tipos_equipo t ON t.id = e.tipo_id
            WHERE e.estado <> 'BAJA' AND ${filtroSede('e')} GROUP BY t.nombre ORDER BY n DESC, t.nombre`, [sede]),
    query(`SELECT e.estado, ee.nombre, count(*)::int AS n FROM equipos e JOIN estados_equipo ee ON ee.codigo = e.estado
            WHERE ${filtroSede('e')} GROUP BY e.estado, ee.nombre`, [sede]),
    query(`SELECT count(*)::int AS n FROM incidencias i WHERE i.estado = 'RESUELTO' AND ${filtroSede('i')}`, [sede]),
    query(`SELECT count(*)::int AS n, min(c.recibido_en) AS mas_antiguo FROM correos_entrantes c
            WHERE c.estado = 'POR_ATENDER' AND ${filtroSede('c')}`, [sede]),
    // equipos activos que no se verificaron con QR en los últimos 6 meses
    query(`SELECT count(*)::int AS n FROM equipos e
            WHERE e.estado <> 'BAJA' AND (e.ultima_verificacion IS NULL OR e.ultima_verificacion < now() - interval '6 months')
              AND ${filtroSede('e')}`, [sede]),
    // actividad reciente desde la bitácora (sin el detalle completo)
    query(`SELECT l.secuencia, l.fecha, l.entidad, l.entidad_id, l.accion, l.detalle, u.nombre AS usuario_nombre
             FROM logs_auditoria l LEFT JOIN usuarios u ON u.id = l.usuario_id
            WHERE l.entidad IN ('incidencia', 'equipo', 'correo', 'auditoria') AND l.accion NOT IN ('LECTURA_QR', 'VERIFICADO', 'REUBICADO_EN_AUDITORIA')
              AND ($1::int IS NULL OR l.sede_id = $1)
            ORDER BY l.secuencia DESC LIMIT 6`, [sede]),
  ]);

  const r = resueltos.rows[0];
  const eq = equipos.rows[0];
  const aud = auditorias.rows;
  const esperados = aud.reduce((s, a) => s + a.equipos_esperados, 0);
  const encontrados = aud.reduce((s, a) => s + a.equipos_encontrados, 0);

  const valores = {
    MTTR: { valor: r.n ? redondear(r.mttr) : null, n: r.n },
    CSLA: { valor: r.n ? redondear((r.dentro / r.n) * 100) : null, n: r.n },
    DT: { valor: eq.activos ? redondear((eq.operativos / eq.activos) * 100) : null, n: eq.activos },
    TEL: { valor: esperados ? redondear((encontrados / esperados) * 100) : null, n: esperados },
    TAI: { valor: aud.length ? Math.max(...aud.map((a) => a.tai_dias)) : null, n: aud.length },
  };
  const indicadores = Object.entries(KPI).map(([sigla, k]) => {
    const v = valores[sigla].valor;
    const cumple = v === null ? null : k.mejor === 'menor' ? v <= k.meta : v >= k.meta;
    return { sigla, ...k, ...valores[sigla], cumple };
  });

  res.json({
    indicadores,
    equipos: { activos: eq.activos, operativos: eq.operativos, por_sede: porSede.rows.filter((x) => x.estado) },
    tickets_abiertos: abiertos.rows,
    tickets_por_categoria: porCategoria.rows,
    tickets_por_nivel: porNivel.rows,
    auditorias: aud,
    mttr_semanal: semanal.rows.map((x) => ({ semana: x.semana, n: x.n, mttr: redondear(x.mttr) })),
    equipos_por_tipo: porTipo.rows,
    equipos_por_estado: porEstado.rows,
    resueltos_por_cerrar: porCerrar.rows[0].n,
    correos_por_atender: correos.rows[0],
    sin_verificar: sinVerificar.rows[0].n,
    actividad: actividad.rows,
    periodo: { desde, hasta },
    milisegundos: Date.now() - inicio,
  });
}));

module.exports = router;
