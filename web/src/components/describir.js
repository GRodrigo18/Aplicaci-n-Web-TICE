// Texto legible de un registro de la bitácora (dashboard y bitácora)
const ESTADOS = { PENDIENTE: 'Pendiente', EN_PROCESO: 'En Proceso', RESUELTO: 'Resuelto', CERRADO: 'Cerrado',
  OPERATIVO: 'Operativo', MANTENIMIENTO: 'En mantenimiento', AVERIADO: 'Averiado', BAJA: 'De baja' };
const PRIORIDADES = { CRITICA: 'Crítica', ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' };
const min = (s) => String(s || '').toLowerCase();

export function describir(r) {
  const d = r.detalle || {};
  const n = d.numero || '';
  switch (`${r.entidad}:${r.accion}`) {
    case 'incidencia:CREAR': {
      const equipos = Array.isArray(d.equipos) ? d.equipos.length : 0;
      const origen = d.origen || (d.correo_id ? 'desde un correo' : '');
      return `Registro de ${n} (${PRIORIDADES[d.prioridad] || d.prioridad}: impacto ${min(d.impacto)}, urgencia ${min(d.urgencia)})${origen ? ` ${origen}` : ''}${equipos ? ` con ${equipos} equipo(s)` : ''}`;
    }
    case 'incidencia:CAMBIO_ESTADO': {
      const c = d.cambios?.estado;
      return c ? `${n}: ${ESTADOS[c.antes] || c.antes} → ${ESTADOS[c.despues] || c.despues}` : `${n}: cambio de estado`;
    }
    case 'incidencia:RESOLVER': return `${n} resuelto en ${d.minutos ?? '—'} min`;
    case 'incidencia:ESCALAR': return `${n} escalado a N${d.cambios?.nivel_escalamiento?.despues ?? ''}${d.proveedor ? ` (${d.proveedor})` : ''}${d.motivo ? `: ${d.motivo}` : ''}`;
    case 'incidencia:ALERTA_SLA': return `${n}: alerta al 75 % del SLA`;
    case 'incidencia:REASIGNAR': return `${n} reasignado`;
    case 'incidencia:VINCULAR_EQUIPOS': return `${n}: se vincularon equipos`;
    case 'correo:RECIBIR': return `Correo recibido: ${d.asunto || ''}`;
    case 'correo:CONVERTIR': return `Correo convertido en ticket ${d.ticket || d.numero || ''}`;
    case 'correo:DESCARTAR': return `Correo descartado: ${d.motivo || ''}`;
    case 'equipo:CREAR': return `Registro de ${d.codigo}${d.origen ? ` (${d.origen})` : ''}`;
    case 'equipo:MODIFICAR': return `${d.codigo}: ${Object.keys(d.cambios || {}).join(', ') || 'modificación'}`;
    case 'equipo:BAJA': return `${d.codigo} dado de baja: ${d.motivo || ''}`;
    case 'equipo:TRASLADO': return `Traslado de ${d.codigo || `${d.equipos?.length || ''} equipo(s)`} a ${d.destino || d.ubicacion || ''}`;
    case 'equipo:LECTURA_QR': return `Lectura QR de ${d.codigo}`;
    case 'equipo:VERIFICADO': return `${d.codigo} verificado con QR`;
    case 'equipo:REUBICADO_EN_AUDITORIA': return `${d.codigo} reubicado en la auditoría: ${d.cambios?.ubicacion?.antes} → ${d.cambios?.ubicacion?.despues}`;
    case 'auditoria:INICIAR': return `Inicio de la auditoría #${r.entidad_id} (${d.equipos_esperados ?? d.esperados} equipos)`;
    case 'auditoria:LECTURA': return `Auditoría #${r.entidad_id}: lectura de ${d.codigo || ''}`;
    case 'auditoria:FINALIZAR': return `Auditoría #${r.entidad_id} finalizada: ${d.tel} % localizados, TAI ${d.tai_dias} día(s)`;
    case 'usuario:LOGIN': return 'Inicio de sesión';
    case 'usuario:CREAR': return `Alta del usuario ${d.correo || ''}`;
    case 'sistema:CARGA_DEMO': return 'Carga de los datos de demostración';
    default: return `${r.accion.replace(/_/g, ' ').toLowerCase()} ${d.codigo || d.numero || d.correo || ''}`.trim();
  }
}

// Color del nombre de la acción en la bitácora
export const colorAccion = (a) => ({ CREAR: 'text-marca-500', RESOLVER: 'text-emerald-600', BAJA: 'text-red-600', DESCARTAR: 'text-red-600',
  ESCALAR: 'text-amber-600', ALERTA_SLA: 'text-amber-600', FINALIZAR: 'text-emerald-600', LOGIN: 'text-slate-500' }[a] || 'text-slate-500');
