import { useCallback, useEffect, useState } from 'react';
import { Ban, Calendar, Clock, Cpu, FileText, KeyRound, LifeBuoy, MapPin, Network, Pencil, Printer, Tag, User } from 'lucide-react';
import { useSesion } from '../sesion.jsx';
import { api } from '../api.js';
import { Aviso, IconoTipo, Insignia, Panel, Segmentado, fecha, fechaHora, insigniaEquipo } from '../components/ui.jsx';
import { ImagenQr } from '../components/Etiqueta.jsx';
import { FormBaja, FormEquipo, imprimirEtiquetas } from './Inventario.jsx';
import { NuevoTicket } from './MesaAyuda.jsx';

const ACCIONES = {
  CREAR: (d) => (d.origen ? `Registrado por ${d.origen.toLowerCase()}${d.fila ? ` (fila ${d.fila})` : ''}` : 'Registrado en el inventario'),
  MODIFICAR: (d) => `Modificado: ${Object.keys(d.cambios || {}).join(', ')}`,
  BAJA: () => 'Dado de baja',
  TRASLADO: () => 'Trasladado',
  LECTURA_QR: () => 'Identificado con QR',
  VERIFICADO: () => 'Verificado con QR',
  REUBICADO_EN_AUDITORIA: () => 'Reubicado en una auditoría',
};
const COLOR = { VERIFICADO: 'bg-emerald-500', LECTURA_QR: 'bg-emerald-500', BAJA: 'bg-red-500', REUBICADO_EN_AUDITORIA: 'bg-amber-500', TRASLADO: 'bg-amber-500' };

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

// Contenido de la ficha: se usa en el panel del inventario y en el pistoleo QR
export function FichaContenido({ e, onEditar, onBaja, onReportar }) {
  const [pestana, setPestana] = useState('historial');
  const historial = [...(e.historial || [])].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const datos = [
    [Tag, 'Serie', e.serie, 'font-mono'], [Network, 'MAC', e.mac, 'font-mono'], [MapPin, 'Ubicación', e.ubicacion],
    [User, 'Responsable', e.responsable], [KeyRound, 'Propiedad', { PROPIO: 'Propio', ALQUILADO: 'Alquilado' }[e.propiedad]],
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
          {e.estado !== 'BAJA' && onEditar && <button className="btn-secundario" onClick={onEditar}><Pencil size={16} />Editar</button>}
          {onEditar && <button className="btn-secundario" onClick={() => imprimirEtiquetas([e])}><Printer size={16} />Imprimir etiqueta</button>}
          {e.estado !== 'BAJA' && onBaja && <button className="btn-texto-peligro" onClick={onBaja}><Ban size={16} />Dar de baja</button>}
        </div>
        {e.observaciones && <p className="mt-4 text-sm text-slate-600">{e.observaciones}</p>}
        <Segmentado className="mt-6" valor={pestana} onChange={setPestana}
          opciones={[['historial', `Historial (${historial.length})`], ['tickets', `Tickets (${e.tickets?.length || 0})`]]} />
        <div className="mt-5">
          {pestana === 'historial' ? <Historial registros={historial} /> : (
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
  const cargar = useCallback(() => api.get(`/equipos/${id}`).then(setE).catch((x) => setError(x.message)), [id]);
  useEffect(() => { setE(null); cargar(); }, [cargar]);
  const hecho = () => { setModal(null); cargar(); onCambio?.(); };
  return (
    <Panel onCerrar={onCerrar}>
      {error && <div className="p-7"><Aviso>{error}</Aviso></div>}
      {!e && !error && <div className="p-7 text-slate-500">Cargando…</div>}
      {/* el Jefe de TI consulta la ficha; registrar, editar y dar de baja es tarea del TICE de la sede */}
      {e && (esDirector ? <FichaContenido e={e} />
        : <FichaContenido e={e} onEditar={() => setModal('editar')} onBaja={() => setModal('baja')} onReportar={() => setModal('reportar')} />)}
      {modal === 'editar' && <FormEquipo equipo={e} onCerrar={() => setModal(null)} onGuardado={hecho} />}
      {modal === 'baja' && <FormBaja equipo={e} onCerrar={() => setModal(null)} onGuardado={hecho} />}
      {modal === 'reportar' && <NuevoTicket equipoInicial={e} onCerrar={() => setModal(null)} onCreado={hecho} />}
    </Panel>
  );
}
