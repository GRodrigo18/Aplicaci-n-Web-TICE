import { useCallback, useEffect, useState } from 'react';
import { Ban, Building2, Calendar, Check, Clock, Cpu, FileText, KeyRound, LifeBuoy, MapPin, Network, Pencil, Printer, Tag, User, Wrench, X } from 'lucide-react';
import { useSesion } from '../sesion.jsx';
import { api } from '../api.js';
import { Aviso, Campo, IconoTipo, Insignia, Modal, Panel, Segmentado, fecha, fechaHora, insigniaEquipo } from '../components/ui.jsx';
import { ImagenQr } from '../components/Etiqueta.jsx';
import { FormBaja, FormEquipo, imprimirEtiquetas } from './Inventario.jsx';
import { NuevoTicket } from './MesaAyuda.jsx';

const ACCIONES = {
  CREAR: (d) => (d.numero ? `Ticket ${d.numero} registrado` : d.origen ? `Registrado por ${d.origen.toLowerCase()}${d.fila ? ` (fila ${d.fila})` : ''}` : 'Registrado en el inventario'),
  MODIFICAR: (d) => `Modificado: ${Object.keys(d.cambios || {}).join(', ')}`,
  BAJA: () => 'Dado de baja',
  TRASLADO: () => 'Trasladado',
  LECTURA_QR: () => 'Identificado con QR',
  VERIFICADO: () => 'Verificado con QR',
  REUBICADO_EN_AUDITORIA: () => 'Reubicado en una auditoría',
  MANTENIMIENTO: (d) => `Mantenimiento ${String(d.tipo || '').toLowerCase()}: ${d.descripcion || ''}`,
  CORREO_RECIBIDO: (d) => `Respuesta del solicitante por correo${d.de ? ` (${d.de})` : ''}`,
  RESPONDER_CORREO: () => 'Respuesta enviada al solicitante',
  SOLICITAR_BAJA: () => 'Baja solicitada al Jefe de TI',
  RECHAZAR_BAJA: () => 'El Jefe de TI rechazó la baja',
};
const COLOR = { VERIFICADO: 'bg-emerald-500', LECTURA_QR: 'bg-emerald-500', BAJA: 'bg-red-500', MANTENIMIENTO: 'bg-cyan-500', SOLICITAR_BAJA: 'bg-red-400', REUBICADO_EN_AUDITORIA: 'bg-amber-500', TRASLADO: 'bg-amber-500' };

export function Historial({ registros }) {
  if (!registros?.length) return <p className="text-sm text-slate-400">Sin registros.</p>;
  return (
    <ol className="relative space-y-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-slate-200">
      {registros.map((h, i) => (
        <li key={i} className="relative pl-7">
          <span className={`absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full ring-4 ring-white ${COLOR[h.accion] || 'bg-marca-500'}`} />
          <div className="font-semibold text-slate-800">{(ACCIONES[h.accion] || (() => h.accion.replace(/_/g, ' ').toLowerCase()))(h.detalle || {})}</div>
          <div className="text-sm text-slate-500">{h.usuario_nombre || h.usuario_correo || 'Sistema'} · {fechaHora(h.fecha)}</div>
          {h.detalle?.cambios && Object.entries(h.detalle.cambios).map(([k, v]) => (
            <div key={k} className="text-xs text-slate-500">{k}: <s>{String(v.antes ?? '—')}</s> → {String(v.despues ?? '—')}</div>
          ))}
          {h.detalle?.motivo && <div className="text-xs text-slate-500">Motivo: {h.detalle.motivo}</div>}
        </li>
      ))}
    </ol>
  );
}

// Registrar un mantenimiento preventivo o correctivo hecho fuera de un ticket
function FormMantenimiento({ equipo, onCerrar, onGuardado }) {
  const [f, setF] = useState({ tipo: 'PREVENTIVO', fecha: new Date().toISOString().slice(0, 10), descripcion: '', realizado_por: '', proximo: '', estado_equipo: '' });
  const [error, setError] = useState('');
  const set = (k) => (ev) => setF({ ...f, [k]: ev.target.value });
  const guardar = async (ev) => {
    ev.preventDefault();
    try { onGuardado(await api.post(`/equipos/${equipo.id}/mantenimientos`, f)); } catch (x) { setError(x.message); }
  };
  return (
    <Modal titulo={`Mantenimiento de ${equipo.codigo}`} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Tipo">
          <select className="entrada" value={f.tipo} onChange={set('tipo')}><option value="PREVENTIVO">Preventivo</option><option value="CORRECTIVO">Correctivo</option></select>
        </Campo>
        <Campo etiqueta="Fecha"><input type="date" className="entrada" value={f.fecha} onChange={set('fecha')} /></Campo>
        <div className="sm:col-span-2"><Campo etiqueta="Trabajo realizado *"><textarea className="entrada" rows={3} value={f.descripcion} onChange={set('descripcion')} placeholder="Limpieza interna, cambio de pasta térmica, actualización de Windows…" required /></Campo></div>
        <Campo etiqueta="Realizado por" ayuda="Vacío = usted"><input className="entrada" value={f.realizado_por} onChange={set('realizado_por')} placeholder={equipo.propiedad === 'ALQUILADO' ? equipo.proveedor || '' : ''} /></Campo>
        <Campo etiqueta="Próximo mantenimiento"><input type="date" className="entrada" value={f.proximo} onChange={set('proximo')} /></Campo>
        <div className="sm:col-span-2"><Campo etiqueta="Estado del equipo después">
          <select className="entrada" value={f.estado_equipo} onChange={set('estado_equipo')}>
            <option value="">No cambiar</option><option value="OPERATIVO">Operativo</option><option value="MANTENIMIENTO">En mantenimiento</option><option value="AVERIADO">Averiado</option>
          </select>
        </Campo></div>
        <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primario" disabled={!f.descripcion.trim()}>Registrar</button>
        </div>
      </form>
    </Modal>
  );
}

function ListaMantenimientos({ lista }) {
  if (!lista?.length) return <p className="text-sm text-slate-400">Sin mantenimientos registrados. Los tickets resueltos se agregan aquí como correctivos.</p>;
  return (
    <ul className="space-y-2">
      {lista.map((m) => (
        <li key={m.id} className="rounded-xl border border-slate-100 p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className={`rounded-md px-1.5 text-[11px] font-bold ${m.tipo === 'PREVENTIVO' ? 'bg-cyan-50 text-cyan-700' : 'bg-amber-50 text-amber-700'}`}>{m.tipo === 'PREVENTIVO' ? 'Preventivo' : 'Correctivo'}</span>
            <span className="font-medium text-slate-800">{fecha(m.fecha)}</span>
            {m.ticket_numero && <span className="font-mono text-xs text-slate-500">{m.ticket_numero}</span>}
            <span className="ml-auto text-xs text-slate-500">{m.realizado_por || m.usuario_nombre}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{m.descripcion}</p>
          {m.proximo && <p className="mt-1 text-xs text-slate-500">Próximo: {fecha(m.proximo)}</p>}
        </li>
      ))}
    </ul>
  );
}

// Contenido de la ficha: se usa en el panel del inventario y en el pistoleo QR
export function FichaContenido({ e, onEditar, onBaja, onReportar, onMantenimiento, onAprobarBaja, onRechazarBaja }) {
  const [pestana, setPestana] = useState('historial');
  const historial = [...(e.historial || [])].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const datos = [
    [Tag, 'Serie', e.serie, 'font-mono'], [Network, 'MAC', e.mac, 'font-mono'], [MapPin, 'Ubicación', e.ubicacion],
    [User, 'Responsable', e.responsable], [KeyRound, 'Propiedad', { PROPIO: 'Propio del colegio', ALQUILADO: 'Alquilado' }[e.propiedad]],
    ...(e.propiedad === 'ALQUILADO' ? [[Building2, 'Proveedor', e.proveedor || 'Falta registrar'], [FileText, 'Contrato', e.contrato],
      [Calendar, 'Fin del contrato', e.fin_contrato ? fecha(e.fin_contrato) : null]] : []),
    [Calendar, 'Fecha de ingreso', fecha(e.fecha_adquisicion)], [FileText, 'Guía / factura', e.guia_factura],
    [Clock, 'Última verificación QR', fechaHora(e.ultima_verificacion)],
  ];
  return (
    <div>
      <div className="relative overflow-hidden border-b border-slate-100 p-5 sm:p-7">
        <div className="pointer-events-none absolute -right-10 -top-20 h-56 w-96 rounded-full bg-gradient-to-r from-marca-100/60 to-pink-100/50 blur-3xl" />
        <div className="relative flex flex-wrap-reverse items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-600"><IconoTipo tipo={e.tipo} />{e.tipo} · {e.sede_nombre}</div>
            <div className="mt-2 break-all font-mono text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{e.codigo}</div>
            <div className="mt-1 text-lg text-slate-500">{e.marca} {e.modelo}</div>
            <div className="mt-3">{insigniaEquipo(e)}</div>
          </div>
          <div className="text-center sm:mr-8">
            <div className="rounded-2xl bg-white p-2 shadow-suave"><ImagenQr token={e.qr_token} tamano={120} /></div>
            <div className="mt-2 font-mono text-[11px] text-slate-400">{e.qr_token.slice(0, 12)}</div>
          </div>
        </div>
      </div>
      {e.estado === 'BAJA' && <div className="px-7 pt-5"><Aviso tipo="info">Dado de baja el {fechaHora(e.fecha_baja)}. Motivo: {e.motivo_baja}</Aviso></div>}
      {e.estado !== 'BAJA' && e.baja_solicitada_en && (
        <div className="mx-5 mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:mx-7">
          <b>Baja solicitada</b> el {fechaHora(e.baja_solicitada_en)} · Motivo: {e.baja_motivo_solicitud}
          {onAprobarBaja ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-peligro py-2" onClick={onAprobarBaja}><Check size={16} />Aprobar baja</button>
              <button className="btn-secundario py-2" onClick={onRechazarBaja}><X size={16} />Rechazar</button>
            </div>
          ) : <div className="mt-1 text-red-700">Espera la aprobación del Jefe de TI.</div>}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-slate-100 p-5 sm:p-7">
        {datos.map(([Icono, k, v, clase = '']) => (
          <div key={k} className="min-w-0"><dt className="flex items-center gap-1.5 text-sm text-slate-500"><Icono size={14} />{k}</dt><dd className={`mt-0.5 break-words text-[15px] font-medium text-slate-900 sm:text-[17px] ${clase}`}>{v || '—'}</dd></div>
        ))}
        {e.caracteristicas && (
          <div className="col-span-2"><dt className="flex items-center gap-1.5 text-sm text-slate-500"><Cpu size={14} />Características</dt><dd className="mt-0.5 text-[15px] text-slate-900">{e.caracteristicas}</dd></div>
        )}
      </dl>
      <div className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          {e.estado !== 'BAJA' && onReportar && <button className="btn-primario" onClick={onReportar}><LifeBuoy size={17} />Reportar incidencia</button>}
          {e.estado !== 'BAJA' && onMantenimiento && <button className="btn-secundario" onClick={onMantenimiento}><Wrench size={16} />Mantenimiento</button>}
          {e.estado !== 'BAJA' && onEditar && <button className="btn-secundario" onClick={onEditar}><Pencil size={16} />Editar</button>}
          {onEditar && <button className="btn-secundario" onClick={() => imprimirEtiquetas([e])}><Printer size={16} />Imprimir etiqueta</button>}
          {e.estado !== 'BAJA' && !e.baja_solicitada_en && onBaja && <button className="btn-texto-peligro" onClick={onBaja}><Ban size={16} />{onAprobarBaja ? 'Dar de baja' : 'Solicitar baja'}</button>}
        </div>
        {e.observaciones && <p className="mt-4 text-sm text-slate-600">{e.observaciones}</p>}
        <Segmentado className="mt-6" valor={pestana} onChange={setPestana}
          opciones={[['historial', `Historial (${historial.length})`], ['mantenimiento', `Mantenimiento (${e.mantenimientos?.length || 0})`],
            ['tickets', `Tickets (${e.tickets?.length || 0})`]]} />
        <div className="mt-5">
          {pestana === 'historial' && <Historial registros={historial} />}
          {pestana === 'mantenimiento' && <ListaMantenimientos lista={e.mantenimientos} />}
          {pestana === 'tickets' && (
            <ul className="space-y-2">
              {(e.tickets || []).map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                  <span className="font-mono text-xs text-slate-500">{t.numero}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{t.asunto}</span>
                  <Insignia valor={t.estado} texto={{ PENDIENTE: 'Pendiente', EN_PROCESO: 'En proceso', RESUELTO: 'Resuelto', CERRADO: 'Cerrado' }[t.estado]} />
                </li>
              ))}
              {!e.tickets?.length && <p className="text-sm text-slate-400">Sin incidencias registradas.</p>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FichaEquipo({ id, onCerrar, onCambio }) {
  const { esDirector } = useSesion();
  const [e, setE] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [rechazo, setRechazo] = useState('');
  const cargar = useCallback(() => api.get(`/equipos/${id}`).then(setE).catch((x) => setError(x.message)), [id]);
  useEffect(() => { setE(null); cargar(); }, [cargar]);
  const hecho = () => { setModal(null); cargar(); onCambio?.(); };
  return (
    <Panel onCerrar={onCerrar}>
      {error && <div className="p-7"><Aviso>{error}</Aviso></div>}
      {!e && !error && <div className="p-7 text-slate-500">Cargando…</div>}
      {/* el Jefe de TI supervisa: aprueba o rechaza bajas y puede dar de baja; registrar, editar y el mantenimiento es tarea del TICE */}
      {e && (esDirector
        ? <FichaContenido e={e} onBaja={() => setModal('baja')}
            onAprobarBaja={() => api.post(`/equipos/${e.id}/baja/aprobar`, {}).then(hecho).catch((x) => setError(x.message))}
            onRechazarBaja={() => setModal('rechazar')} />
        : <FichaContenido e={e} onEditar={() => setModal('editar')} onBaja={() => setModal('baja')} onReportar={() => setModal('reportar')}
            onMantenimiento={() => setModal('mantenimiento')} />)}
      {modal === 'mantenimiento' && <FormMantenimiento equipo={e} onCerrar={() => setModal(null)} onGuardado={hecho} />}
      {modal === 'rechazar' && (
        <Modal titulo={`Rechazar la baja de ${e.codigo}`} onCerrar={() => setModal(null)}>
          <Campo etiqueta="Motivo del rechazo *"><textarea className="entrada" rows={3} value={rechazo} onChange={(x) => setRechazo(x.target.value)} placeholder="Ej.: se puede reparar con garantía" /></Campo>
          <div className="mt-5 flex justify-end gap-2">
            <button className="btn-secundario" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn-primario" disabled={!rechazo.trim()}
              onClick={() => api.post(`/equipos/${e.id}/baja/rechazar`, { motivo: rechazo }).then(() => { setRechazo(''); hecho(); }).catch((x) => setError(x.message))}>Rechazar baja</button>
          </div>
        </Modal>
      )}
      {modal === 'editar' && <FormEquipo equipo={e} onCerrar={() => setModal(null)} onGuardado={hecho} />}
      {modal === 'baja' && <FormBaja equipo={e} onCerrar={() => setModal(null)} onGuardado={hecho} />}
      {modal === 'reportar' && <NuevoTicket equipoInicial={e} onCerrar={() => setModal(null)} onCreado={hecho} />}
    </Panel>
  );
}
