import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ArrowUpRight, Ban, CheckCheck, Clock, Hand, Inbox, Kanban, Lightbulb, Mail, MailPlus, Paperclip, Plus, QrCode,
  Search, Ticket, User, X,
} from 'lucide-react';
import { api, qs } from '../api.js';
import { useSesion } from '../sesion.jsx';
import Lector from '../components/Lector.jsx';
import {
  Aviso, Avatar, COLOR_PRIORIDAD, Campo, Confirmar, IconoTipo, Insignia, Modal, NIVELES, NOMBRE_PRIORIDAD, Panel, Segmentado,
  SelectorSede, Vacio, fechaHora, hace, minutosATexto,
} from '../components/ui.jsx';
import { Historial } from './FichaEquipo.jsx';

const COLUMNAS = [['PENDIENTE', 'Pendiente', 'bg-amber-500'], ['EN_PROCESO', 'En Proceso', 'bg-blue-500'], ['RESUELTO', 'Resuelto', 'bg-emerald-500'], ['CERRADO', 'Cerrado', 'bg-slate-400']];
const VACIAS = { PENDIENTE: 'No hay tickets pendientes', EN_PROCESO: 'Nadie está atendiendo un ticket', RESUELTO: 'Nada por cerrar', CERRADO: 'Sin tickets cerrados' };

// Selector de equipos afectados: por código o ubicación, o leyendo su etiqueta QR
function SelectorEquipos({ sedeId, valor, onChange }) {
  const [busqueda, setBusqueda] = useState('');
  const [opciones, setOpciones] = useState([]);
  const [qr, setQr] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (busqueda.length < 2) { setOpciones([]); return undefined; }
    const t = setTimeout(() => api.get(`/equipos${qs({ q: busqueda, sede_id: sedeId })}`).then((r) => setOpciones(r.slice(0, 8))), 200);
    return () => clearTimeout(t);
  }, [busqueda, sedeId]);
  const agregar = (e) => { if (!valor.some((x) => x.id === e.id)) onChange([...valor, e]); setBusqueda(''); setOpciones([]); };
  return (
    <div>
      {valor.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {valor.map((e) => (
            <span key={e.id} className="inline-flex items-center gap-2 rounded-lg bg-marca-50 px-2.5 py-1 text-sm text-marca-700">
              <IconoTipo tipo={e.tipo} size={15} /><span className="font-mono font-semibold">{e.codigo}</span><span className="text-marca-400">{e.ubicacion}</span>
              <button type="button" onClick={() => onChange(valor.filter((x) => x.id !== e.id))} aria-label={`Quitar ${e.codigo}`}><X size={14} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="relative flex max-w-xl gap-2">
        <div className="relative flex-1">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="entrada pl-10" placeholder="Agregar equipo por código o ubicación…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <button type="button" className="btn-secundario px-3" onClick={() => setQr(!qr)} title="Leer etiqueta QR"><QrCode size={17} /></button>
        {opciones.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {opciones.map((e) => (
              <li key={e.id}><button type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => agregar(e)}>
                <IconoTipo tipo={e.tipo} size={15} className="text-slate-400" /><span className="font-mono font-semibold">{e.codigo}</span>
                <span className="text-slate-500">{e.tipo} · {e.ubicacion}</span></button></li>
            ))}
          </ul>
        )}
      </div>
      {qr && (
        <div className="mt-2 max-w-xl rounded-xl border border-slate-200 p-3">
          <Lector compacto onLectura={async (lectura) => {
            setError('');
            try { agregar(await api.post('/qr/identificar', { lectura })); } catch (x) { setError(x.message); }
          }} />
          <div className="mt-2"><Aviso>{error}</Aviso></div>
        </div>
      )}
    </div>
  );
}

// Matriz de impacto × urgencia de ITIL 4 con la celda elegida resaltada
function MatrizPrioridad({ matriz, impacto, urgencia }) {
  const filas = [['ALTO', 'A'], ['MEDIO', 'M'], ['BAJO', 'B']];
  const columnas = [['ALTA', 'A'], ['MEDIA', 'M'], ['BAJA', 'B']];
  return (
    <div className="grid grid-cols-[14px_repeat(3,26px)] gap-1 text-[10px] text-slate-400">
      <span />{columnas.map(([, l]) => <span key={l} className="text-center">{l}</span>)}
      {filas.map(([imp, l]) => [
        <span key={l} className="self-center">{l}</span>,
        ...columnas.map(([urg]) => {
          const p = matriz[imp][urg];
          const elegida = imp === impacto && urg === urgencia;
          return <span key={imp + urg} className={`h-[26px] rounded-md ${elegida ? 'ring-2 ring-slate-900' : 'opacity-40'}`} style={{ background: COLOR_PRIORIDAD[p] }} />;
        }),
      ])}
    </div>
  );
}

// Formulario del ticket. Se usa para el registro directo y para convertir un correo de la bandeja.
export function FormTicket({ inicial = {}, sedeId, onEnviar, textoBoton = 'Registrar ticket', onCancelar, onDescartar, desdeCorreo }) {
  const { catalogos, esDirector, sedes } = useSesion();
  const [f, setF] = useState({
    solicitante_correo: '', solicitante_nombre: '', asunto: '', descripcion: '', categoria: '', impacto: '', urgencia: '', sede_id: sedeId || '', ...inicial,
  });
  const [equipos, setEquipos] = useState(inicial.equipos || []);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const prioridad = f.impacto && f.urgencia ? catalogos.matriz_prioridad[f.impacto][f.urgencia] : null;
  const sla = prioridad && catalogos.prioridades.find((p) => p.codigo === prioridad).sla_minutos;

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    if (!f.descripcion.trim() || !f.impacto || !f.urgencia || !f.categoria) { setError('Completa la descripción, la categoría, el impacto y la urgencia'); return; }
    setOcupado(true);
    try { await onEnviar({ ...f, equipo_ids: equipos.map((x) => x.id) }); } catch (x) { setError(x.message); } finally { setOcupado(false); }
  };

  return (
    <form onSubmit={enviar} className="space-y-5">
      {!desdeCorreo && (
        <div className="grid gap-4 sm:grid-cols-2">
          {esDirector && !sedeId && <Campo etiqueta="Sede *"><SelectorSede valor={f.sede_id} onChange={(v) => setF({ ...f, sede_id: v })} sedes={sedes} todas={false} /></Campo>}
          <Campo etiqueta="Correo del solicitante *"><input type="email" className="entrada" value={f.solicitante_correo} onChange={set('solicitante_correo')} required /></Campo>
          <Campo etiqueta="Nombre del solicitante"><input className="entrada" value={f.solicitante_nombre || ''} onChange={set('solicitante_nombre')} /></Campo>
        </div>
      )}
      <Campo etiqueta={desdeCorreo ? 'Asunto del correo' : 'Asunto *'}><input className="entrada" value={f.asunto} onChange={set('asunto')} required /></Campo>
      <Campo etiqueta="Descripción *"><textarea className="entrada" rows={3} value={f.descripcion} onChange={set('descripcion')} /></Campo>
      <div>
        <span className="etiqueta">Categoría</span>
        <div className="flex flex-wrap gap-2">
          {catalogos.categorias.map((c) => <button type="button" key={c} className={`chip ${f.categoria === c ? 'chip-activo' : ''}`} onClick={() => setF({ ...f, categoria: c })}>{c}</button>)}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="etiqueta">Impacto *</span>
          <Segmentado className="flex w-full" valor={f.impacto} onChange={(v) => setF({ ...f, impacto: v })} opciones={[['ALTO', 'Alto'], ['MEDIO', 'Medio'], ['BAJO', 'Bajo']]} />
          <span className="mt-1.5 block text-xs text-slate-500">{{ ALTO: 'Toda la sede, un laboratorio o una evaluación', MEDIO: 'Un aula, un ambiente o un grupo de usuarios', BAJO: 'Un solo usuario' }[f.impacto] || 'A cuántos afecta la falla'}</span>
        </div>
        <div>
          <span className="etiqueta">Urgencia *</span>
          <Segmentado className="flex w-full" valor={f.urgencia} onChange={(v) => setF({ ...f, urgencia: v })} opciones={[['ALTA', 'Alta'], ['MEDIA', 'Media'], ['BAJA', 'Baja']]} />
          <span className="mt-1.5 block text-xs text-slate-500">{{ ALTA: 'Detiene una clase, un examen o hay riesgo físico', MEDIA: 'Debe resolverse antes de la siguiente clase', BAJA: 'Se puede programar' }[f.urgencia] || 'Qué tan pronto se necesita'}</span>
        </div>
      </div>
      <div className="flex items-center gap-5 rounded-2xl border border-dashed border-slate-200 p-4">
        <MatrizPrioridad matriz={catalogos.matriz_prioridad} impacto={f.impacto} urgencia={f.urgencia} />
        <div className="text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Prioridad (ITIL)</div>
          {prioridad ? (
            <div className="mt-1 flex items-center gap-2 text-lg"><span className="h-3 w-3 rotate-45 rounded-[2px]" style={{ background: COLOR_PRIORIDAD[prioridad] }} />
              <b className="text-slate-900">{NOMBRE_PRIORIDAD[prioridad]}</b><span className="text-slate-500">· SLA {minutosATexto(sla)}</span></div>
          ) : <div className="mt-1 text-slate-500">Elige el impacto y la urgencia</div>}
          <div className="text-xs text-slate-500">Calculada con la matriz impacto × urgencia, no se edita.</div>
          {f.pista_urgencia && <div className="mt-1 flex items-center gap-1 text-xs text-marca-500"><Lightbulb size={13} />Sugerido por «{f.pista_urgencia}»</div>}
        </div>
      </div>
      <div>
        <span className="etiqueta flex items-center gap-1.5"><Paperclip size={14} />Equipos afectados</span>
        <SelectorEquipos sedeId={f.sede_id || sedeId} valor={equipos} onChange={setEquipos} />
      </div>
      {f.solicitante_correo && <p className="flex items-center gap-2 text-sm text-slate-500"><Mail size={15} />Al crear el ticket se responde a {f.solicitante_correo} con el número de seguimiento.</p>}
      <Aviso>{error}</Aviso>
      <div className="flex justify-end gap-2">
        {onDescartar && <button type="button" className="btn-secundario" onClick={onDescartar}><Ban size={16} />Descartar</button>}
        {onCancelar && <button type="button" className="btn-secundario" onClick={onCancelar}>Cancelar</button>}
        <button className="btn-primario" disabled={ocupado}><Ticket size={17} />{textoBoton}</button>
      </div>
    </form>
  );
}

export function NuevoTicket({ equipoInicial, onCerrar, onCreado }) {
  const { usuario } = useSesion();
  return (
    <Modal titulo="Registrar nuevo ticket" onCerrar={onCerrar} ancho="max-w-3xl">
      <FormTicket sedeId={equipoInicial?.sede_id || usuario.sede_id} inicial={equipoInicial ? { equipos: [equipoInicial] } : {}}
        onCancelar={onCerrar} onEnviar={async (d) => onCreado(await api.post('/incidencias', d))} />
    </Modal>
  );
}

// Tiempo del SLA: restante o excedido en un ticket abierto; tiempo de resolución en uno resuelto
function Sla({ t }) {
  if (['RESUELTO', 'CERRADO'].includes(t.estado)) {
    return <span className={`flex items-center gap-1 text-xs font-semibold ${t.fuera_de_sla ? 'text-amber-600' : 'text-emerald-600'}`}><CheckCheck size={14} />{minutosATexto(t.minutos)}</span>;
  }
  const uso = t.minutos / t.sla_minutos;
  const color = uso >= 1 ? 'text-red-600' : uso >= 0.75 ? 'text-amber-600' : 'text-slate-500';
  const barra = uso >= 1 ? 'bg-red-500' : uso >= 0.75 ? 'bg-amber-500' : 'bg-slate-400';
  return (
    <span className={`flex items-center gap-1.5 text-xs font-semibold ${color}`} title={`SLA ${minutosATexto(t.sla_minutos)}`}>
      <Clock size={14} />{minutosATexto(t.minutos)}
      <span className="h-1 w-14 rounded-full bg-slate-100"><span className={`block h-1 rounded-full ${barra}`} style={{ width: `${Math.min(100, uso * 100)}%` }} /></span>
    </span>
  );
}

// Escalamiento funcional (ITIL 4): al nivel 2 o al proveedor externo (nivel 3)
function Escalar({ t, onEscalar }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ nivel: String(t.nivel_escalamiento + 1), motivo: '', proveedor: '', caso_proveedor: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (t.nivel_escalamiento >= 3) return null;
  if (!abierto) return <button className="btn-secundario" onClick={() => setAbierto(true)}><ArrowUpRight size={16} />Escalar</button>;
  const listo = f.motivo.trim() && (f.nivel !== '3' || f.proveedor.trim());
  return (
    <div className="mt-3 grid w-full gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:grid-cols-2">
      <h3 className="text-sm font-bold text-slate-800 sm:col-span-2">Escalar ticket (ITIL 4)</h3>
      <Campo etiqueta="Nivel">
        <select className="entrada" value={f.nivel} onChange={set('nivel')}>
          {[2, 3].filter((n) => n > t.nivel_escalamiento).map((n) => <option key={n} value={n}>{NIVELES[n]}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Motivo *"><input className="entrada" value={f.motivo} onChange={set('motivo')} placeholder="Ej.: requiere repuesto en garantía" /></Campo>
      {f.nivel === '3' && <>
        <Campo etiqueta="Proveedor *"><input className="entrada" value={f.proveedor} onChange={set('proveedor')} placeholder="Ej.: garantía HP, proveedor de internet" /></Campo>
        <Campo etiqueta="N.º de caso del proveedor"><input className="entrada" value={f.caso_proveedor} onChange={set('caso_proveedor')} /></Campo>
      </>}
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button className="btn-secundario" onClick={() => setAbierto(false)}>Cancelar</button>
        <button className="btn-primario" disabled={!listo} onClick={() => onEscalar({ ...f, nivel: Number(f.nivel) })}>Escalar</button>
      </div>
    </div>
  );
}

function DetalleTicket({ id, onCerrar, onCambio }) {
  const { esDirector } = useSesion();
  const [t, setT] = useState(null);
  const [error, setError] = useState('');
  const [sol, setSol] = useState({ diagnostico: '', solucion: '', estado_equipo: '' });
  const [confirmar, setConfirmar] = useState(null);
  const cargar = useCallback(() => api.get(`/incidencias/${id}`).then(setT).catch((e) => setError(e.message)), [id]);
  useEffect(() => { cargar(); }, [cargar]);

  const ejecutar = async (fn) => {
    setError('');
    try { await fn(); await cargar(); onCambio(); } catch (x) { setError(x.message); } finally { setConfirmar(null); }
  };

  return (
    <Panel onCerrar={onCerrar}>
      {!t ? <div className="p-7">{error ? <Aviso>{error}</Aviso> : <span className="text-slate-500">Cargando…</span>}</div> : (
        <div>
          <div className="relative overflow-hidden border-b border-slate-100 p-7">
            <div className="pointer-events-none absolute -right-10 -top-20 h-56 w-96 rounded-full bg-gradient-to-r from-marca-100/60 to-pink-100/50 blur-3xl" />
            <div className="relative pr-8">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-slate-500">{t.numero}</span>
                <Insignia valor={t.prioridad} texto={`Prioridad ${t.prioridad_nombre}`} />
                <Insignia valor={t.estado} texto={t.estado_nombre} />
                {t.nivel_escalamiento > 1 && <Insignia valor="ALTA" texto={NIVELES[t.nivel_escalamiento]} punto={false} />}
              </div>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">{t.asunto}</h2>
              <div className="mt-2"><Sla t={t} /></div>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-slate-100 p-7 text-sm">
            <div><dt className="text-slate-500">Solicitante</dt><dd className="font-medium text-slate-900">{t.solicitante_nombre || '—'}</dd><dd className="text-xs text-slate-500">{t.solicitante_correo}</dd></div>
            <div><dt className="text-slate-500">Asignado a</dt><dd className="font-medium text-slate-900">{t.asignado_nombre || '—'}{esDirector ? ` · ${t.sede_nombre}` : ''}</dd></div>
            <div><dt className="text-slate-500">Categoría</dt><dd className="font-medium text-slate-900">{t.categoria}</dd></div>
            <div><dt className="text-slate-500">Impacto / urgencia</dt><dd className="font-medium capitalize text-slate-900">{t.impacto.toLowerCase()} / {t.urgencia.toLowerCase()}</dd></div>
            <div><dt className="text-slate-500">Registro</dt><dd className="font-medium text-slate-900">{fechaHora(t.fecha_registro)}</dd></div>
            <div><dt className="text-slate-500">Resolución</dt><dd className="font-medium text-slate-900">{fechaHora(t.fecha_resolucion)}</dd></div>
            {t.proveedor_externo && <div className="col-span-2"><dt className="text-slate-500">Proveedor externo</dt><dd className="font-medium">{t.proveedor_externo}{t.caso_proveedor ? ` · caso ${t.caso_proveedor}` : ''}</dd></div>}
            <div className="col-span-2"><dt className="mb-1 text-slate-500">Equipos</dt><dd className="flex flex-wrap gap-2">{t.equipos.map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs"><IconoTipo tipo={e.tipo} size={13} />{e.codigo}</span>
            ))}{!t.equipos.length && '—'}</dd></div>
          </dl>
          <div className="space-y-4 p-7">
            <p className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">{t.descripcion}</p>
            {t.solucion && <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-slate-700"><b>Diagnóstico:</b> {t.diagnostico || '—'}<br /><b>Solución:</b> {t.solucion}</div>}
            <Aviso>{error}</Aviso>
            <div className="flex flex-wrap gap-2">
              {t.estado === 'PENDIENTE' && <button className="btn-primario" onClick={() => setConfirmar({ estado: 'EN_PROCESO', texto: 'Pasar el ticket a En proceso' })}>Iniciar atención</button>}
              {t.estado === 'RESUELTO' && <button className="btn-primario" onClick={() => setConfirmar({ estado: 'CERRADO', texto: 'Cerrar el ticket (el solicitante confirmó que funciona)' })}>Cerrar ticket</button>}
              {['PENDIENTE', 'EN_PROCESO'].includes(t.estado) && <Escalar t={t} onEscalar={(d) => ejecutar(() => api.post(`/incidencias/${t.id}/escalar`, d))} />}
            </div>
            {t.estado === 'EN_PROCESO' && (
              <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
                <h3 className="text-sm font-bold text-slate-800">Registrar solución técnica</h3>
                <textarea className="entrada" rows={2} placeholder="Diagnóstico" value={sol.diagnostico} onChange={(e) => setSol({ ...sol, diagnostico: e.target.value })} />
                <textarea className="entrada" rows={2} placeholder="Solución aplicada *" value={sol.solucion} onChange={(e) => setSol({ ...sol, solucion: e.target.value })} />
                {t.equipos.length > 0 && (
                  <select className="entrada" value={sol.estado_equipo} onChange={(e) => setSol({ ...sol, estado_equipo: e.target.value })}>
                    <option value="">No cambiar el estado de los equipos</option>
                    <option value="OPERATIVO">Equipos operativos</option><option value="MANTENIMIENTO">Equipos en mantenimiento</option><option value="AVERIADO">Equipos averiados</option>
                  </select>
                )}
                <button className="btn-primario" disabled={!sol.solucion.trim()} onClick={() => setConfirmar({ solucion: true, texto: 'Marcar el ticket como Resuelto' })}>Marcar como resuelto</button>
              </div>
            )}
            <div className="grid gap-6 pt-2 sm:grid-cols-2">
              <div><h3 className="mb-3 text-sm font-bold text-slate-800">Historial</h3><Historial registros={[...t.historial].reverse()} /></div>
              <div>
                <h3 className="mb-3 text-sm font-bold text-slate-800">Avisos por correo</h3>
                <ul className="space-y-2 text-xs">{t.notificaciones.map((n) => (
                  <li key={n.id} className="flex justify-between gap-2 rounded-lg bg-slate-50 p-2"><span>{n.asunto}</span><span className="whitespace-nowrap text-slate-500">{n.estado.toLowerCase()}</span></li>
                ))}</ul>
                {!t.notificaciones.length && <p className="text-sm text-slate-400">Sin avisos.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmar && (
        <Confirmar titulo="Confirmar cambio" mensaje={`${confirmar.texto}. Esta acción no se puede deshacer.`} onCancelar={() => setConfirmar(null)}
          onConfirmar={() => ejecutar(() => (confirmar.solucion
            ? api.post(`/incidencias/${t.id}/solucion`, sol)
            : api.patch(`/incidencias/${t.id}/estado`, { estado: confirmar.estado })))} />
      )}
    </Panel>
  );
}

function TarjetaTicket({ t, onAbrir, onArrastrar, esDirector }) {
  const e = t.equipos[0];
  const OrigenIcono = t.correo_id ? Mail : QrCode;
  return (
    <button draggable onDragStart={() => onArrastrar(t.id)} onClick={onAbrir}
      className="tarjeta block w-full border-l-4 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md" style={{ borderLeftColor: COLOR_PRIORIDAD[t.prioridad] }}>
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="whitespace-nowrap font-mono text-xs text-slate-500">{t.numero}</span>
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          {t.nivel_escalamiento > 1 && <span className="rounded-md bg-amber-100 px-1.5 text-[11px] font-bold text-amber-800" title={NIVELES[t.nivel_escalamiento]}>N{t.nivel_escalamiento}</span>}
          <Sla t={t} />
        </span>
      </div>
      <div className="mt-2 text-[15px] font-medium leading-snug text-slate-900">{t.asunto}</div>
      {e && (
        <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-0.5 font-mono text-[11px] text-slate-700">
          <IconoTipo tipo={e.tipo} size={13} />{e.codigo}{t.equipos.length > 1 ? ` +${t.equipos.length - 1}` : ''}
        </span>
      )}
      <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <Avatar nombre={t.asignado_nombre || '—'} tamano="h-6 w-6 text-[10px]" />
        <OrigenIcono size={14} className="shrink-0" />
        <span className="truncate">{t.solicitante_nombre || t.solicitante_correo}</span>
        <span className="ml-auto whitespace-nowrap">{esDirector ? t.sede_nombre : t.sede_nombre.replace('Sede ', '')}</span>
      </div>
    </button>
  );
}

function Tablero({ tickets, cargar, setAbierto, error, setError, conteoCorreos, irACorreos }) {
  const { esDirector, usuario } = useSesion();
  const [nuevo, setNuevo] = useState(false);
  const [arrastrado, setArrastrado] = useState(null);
  const [mover, setMover] = useState(null);
  const [q, setQ] = useState('');
  const [prioridad, setPrioridad] = useState('');
  const [mios, setMios] = useState(false);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return tickets.filter((x) => (!prioridad || x.prioridad === prioridad) && (!mios || x.asignado_a === usuario.id)
      && (!t || [x.numero, x.asunto, x.descripcion, x.solicitante_nombre, x.solicitante_correo, x.asignado_nombre, ...x.equipos.map((e) => e.codigo)]
        .some((v) => String(v || '').toLowerCase().includes(t))));
  }, [tickets, q, prioridad, mios, usuario.id]);
  const abiertos = tickets.filter((t) => ['PENDIENTE', 'EN_PROCESO'].includes(t.estado));
  const fuera = abiertos.filter((t) => t.fuera_de_sla).length;

  const soltar = (estado) => {
    const t = tickets.find((x) => x.id === arrastrado);
    setArrastrado(null);
    if (!t || t.estado === estado) return;
    if (estado === 'RESUELTO') { setAbierto(t.id); return; } // la solución se registra en el detalle
    setMover({ t, estado });
  };

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="entrada py-3 pl-11" placeholder="Buscar por número, descripción, solicitante, técnico o equipo…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="entrada w-auto py-3" value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
          <option value="">Toda prioridad</option>{Object.entries(NOMBRE_PRIORIDAD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {!esDirector && <button className={`btn-secundario py-3 ${mios ? 'border-marca-500 text-marca-600' : ''}`} onClick={() => setMios(!mios)}><User size={17} />Mis tickets</button>}
        <button className="btn-primario py-3" onClick={() => setNuevo(true)}><Plus size={18} />Registrar nuevo ticket</button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">{abiertos.length} abiertos</span>
        {conteoCorreos > 0 && <button className="flex items-center gap-1.5 rounded-full bg-marca-50 px-3 py-1 font-medium text-marca-600" onClick={irACorreos}><Mail size={15} />{conteoCorreos} correo{conteoCorreos === 1 ? '' : 's'} sin convertir en ticket</button>}
        {fuera > 0 && <span className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 font-medium text-red-600"><AlertCircle size={15} />{fuera} fuera del SLA</span>}
        <span className="flex items-center gap-1.5 text-slate-400"><Hand size={15} />Arrastra las tarjetas entre columnas para cambiar su estado</span>
      </div>
      <div className="mt-2"><Aviso>{error}</Aviso></div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNAS.map(([estado, nombre, punto]) => {
          let col = visibles.filter((t) => t.estado === estado);
          if (estado === 'CERRADO') col = col.sort((a, b) => new Date(b.fecha_cierre || b.actualizado_en) - new Date(a.fecha_cierre || a.actualizado_en));
          return (
            <div key={estado} className="rounded-2xl border border-slate-200/80 bg-slate-50 p-3" onDragOver={(e) => e.preventDefault()} onDrop={() => soltar(estado)}>
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className={`h-2.5 w-2.5 rounded-full ${punto}`} />
                <h2 className="text-[15px] font-bold text-slate-800">{nombre}</h2>
                <span className="ml-auto rounded-full border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600">{col.length}</span>
              </div>
              <div className="space-y-3">
                {col.slice(0, estado === 'CERRADO' ? 30 : undefined).map((t) => (
                  <TarjetaTicket key={t.id} t={t} esDirector={esDirector} onAbrir={() => setAbierto(t.id)} onArrastrar={setArrastrado} />
                ))}
                {!col.length && <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">{VACIAS[estado]}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {nuevo && <NuevoTicket onCerrar={() => setNuevo(false)} onCreado={() => { setNuevo(false); cargar(); }} />}
      {mover && (
        <Confirmar titulo="Cambiar estado" mensaje={`¿Pasar ${mover.t.numero} a ${COLUMNAS.find((c) => c[0] === mover.estado)[1]}?`}
          onCancelar={() => setMover(null)}
          onConfirmar={async () => {
            try { await api.patch(`/incidencias/${mover.t.id}/estado`, { estado: mover.estado }); setError(''); } catch (x) { setError(x.message); }
            setMover(null); cargar();
          }} />
      )}
    </div>
  );
}

function RegistrarCorreo({ onCerrar, onGuardado }) {
  const [f, setF] = useState({ de: '', nombre: '', asunto: '', cuerpo: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal titulo="Registrar correo recibido" onCerrar={onCerrar}>
      <p className="mb-4 text-sm text-slate-500">Úsalo si el buzón todavía no reenvía los correos automáticamente al sistema.</p>
      <div className="space-y-4">
        <Campo etiqueta="Remitente (correo) *"><input type="email" className="entrada" value={f.de} onChange={set('de')} /></Campo>
        <Campo etiqueta="Nombre del remitente"><input className="entrada" value={f.nombre} onChange={set('nombre')} /></Campo>
        <Campo etiqueta="Asunto *"><input className="entrada" value={f.asunto} onChange={set('asunto')} /></Campo>
        <Campo etiqueta="Cuerpo del correo *"><textarea className="entrada" rows={4} value={f.cuerpo} onChange={set('cuerpo')} /></Campo>
        <Aviso>{error}</Aviso>
        <div className="flex justify-end gap-2">
          <button className="btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primario" onClick={async () => { try { onGuardado(await api.post('/correos', f)); } catch (x) { setError(x.message); } }}>Guardar en la bandeja</button>
        </div>
      </div>
    </Modal>
  );
}

function Descartar({ correo, onCerrar, onHecho }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal titulo="Descartar correo" onCerrar={onCerrar}>
      <p className="mb-4 text-sm text-slate-600">«{correo.asunto}» no se convertirá en ticket. Indica el motivo; quedará en la bitácora.</p>
      <Campo etiqueta="Motivo *"><input className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: No es una incidencia" /></Campo>
      <div className="mt-3"><Aviso>{error}</Aviso></div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secundario" onClick={onCerrar}>Cancelar</button>
        <button className="btn-peligro" disabled={!motivo.trim()} onClick={async () => { try { onHecho(await api.post(`/correos/${correo.id}/descartar`, { motivo })); } catch (x) { setError(x.message); } }}>Descartar</button>
      </div>
    </Modal>
  );
}

// Bandeja de correos que los solicitantes envían al buzón TICE de la sede, con el ticket propuesto
function Correos({ alCambiar }) {
  const { sedeParam, esDirector } = useSesion();
  const [estado, setEstado] = useState('POR_ATENDER');
  const [correos, setCorreos] = useState([]);
  const [propuestas, setPropuestas] = useState({});
  const [sel, setSel] = useState(null);
  const [modal, setModal] = useState(null);
  const [aviso, setAviso] = useState('');
  const cargar = useCallback(() => api.get(`/correos${qs({ sede_id: sedeParam, estado })}`).then((l) => {
    setCorreos(l);
    setSel((s) => (l.some((c) => c.id === s) ? s : l[0]?.id || null));
    if (estado === 'POR_ATENDER') {
      Promise.all(l.map((c) => api.get(`/correos/${c.id}/propuesta`).then((r) => [c.id, r.propuesta]).catch(() => [c.id, null])))
        .then((pares) => setPropuestas(Object.fromEntries(pares)));
    }
  }), [sedeParam, estado]);
  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, [cargar]);
  const hecho = (msg) => { setModal(null); setAviso(msg); cargar(); alCambiar(); };
  const c = correos.find((x) => x.id === sel);
  const p = c && propuestas[c.id];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmentado valor={estado} onChange={setEstado} opciones={[['POR_ATENDER', 'Por atender'], ['CONVERTIDO', 'Convertidos'], ['DESCARTADO', 'Descartados']]} />
        {!esDirector && <button className="btn-secundario" onClick={() => setModal('registrar')}><MailPlus size={17} />Registrar correo</button>}
      </div>
      {aviso && <div className="mt-4"><Aviso tipo="ok">{aviso}</Aviso></div>}
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(320px,2fr)_3fr]">
        <div className="tarjeta self-start p-2">
          {correos.map((x) => {
            const px = propuestas[x.id];
            const pr = px?.prioridad;
            return (
              <button key={x.id} onClick={() => setSel(x.id)} className={`flex w-full gap-3 rounded-xl p-3 text-left transition ${sel === x.id ? 'bg-marca-50' : 'hover:bg-slate-50'}`}>
                <Avatar nombre={x.remitente_nombre || x.remitente} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2"><span className="truncate font-semibold text-slate-900">{x.remitente_nombre || x.remitente}</span><span className="whitespace-nowrap text-xs text-slate-400">{hace(x.recibido_en)}</span></div>
                  <div className="truncate text-[15px] text-slate-800">{x.asunto}</div>
                  <div className="truncate text-sm text-slate-500">{x.cuerpo.replace(/\s+/g, ' ')}</div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    {x.estado === 'POR_ATENDER' && pr && <><span className="h-2 w-2 rounded-full" style={{ background: COLOR_PRIORIDAD[pr] }} />{NOMBRE_PRIORIDAD[pr]} · {px.categoria}</>}
                    {x.estado === 'POR_ATENDER' && px?.equipos?.[0] && <span className="font-mono text-slate-400">· {px.equipos[0].codigo}</span>}
                    {x.estado === 'CONVERTIDO' && <Insignia valor="CONVERTIDO" texto={`Ticket ${x.ticket_numero || ''}`} />}
                    {x.estado === 'DESCARTADO' && <Insignia valor="DESCARTADO" texto="Descartado" />}
                    {esDirector && <span className="ml-auto">{x.sede_nombre}</span>}
                  </div>
                </div>
              </button>
            );
          })}
          {!correos.length && <Vacio><Inbox className="mx-auto mb-2" />No hay correos en esta vista.</Vacio>}
        </div>
        {c && (
          <div className="tarjeta overflow-hidden">
            <div className="border-b border-slate-100 p-6">
              <h2 className="text-xl font-bold text-slate-900">{c.asunto}</h2>
              <div className="mt-3 flex items-center gap-3">
                <Avatar nombre={c.remitente_nombre || c.remitente} />
                <div className="text-sm"><b className="text-slate-900">{c.remitente_nombre}</b> <span className="text-slate-500">&lt;{c.remitente}&gt;</span>
                  <div className="text-xs text-slate-400">{fechaHora(c.recibido_en)}{esDirector ? ` · ${c.sede_nombre}` : ''}</div></div>
              </div>
            </div>
            <p className="whitespace-pre-wrap border-b border-slate-100 p-6 text-[15px] leading-relaxed text-slate-700">{c.cuerpo}</p>
            <div className="p-6">
              {c.estado === 'POR_ATENDER' && p && (
                <>
                  <div className="mb-4 flex items-center gap-2"><Ticket size={18} className="text-marca-500" /><h3 className="text-lg font-bold text-slate-900">Ticket propuesto</h3>
                    <span className="text-sm text-slate-400">Revisa los datos antes de crearlo</span></div>
                  <FormTicket key={c.id} desdeCorreo sedeId={c.sede_id} inicial={p} textoBoton="Crear ticket"
                    onDescartar={esDirector ? undefined : () => setModal('descartar')}
                    onEnviar={async (d) => {
                      const t = await api.post(`/correos/${c.id}/convertir`, d);
                      hecho(`Se creó el ticket ${t.numero} con prioridad ${t.prioridad_nombre}; se envió el acuse a ${c.remitente}.`);
                    }} />
                </>
              )}
              {c.estado === 'POR_ATENDER' && !p && <p className="text-sm text-slate-400">Preparando la propuesta…</p>}
              {c.estado === 'CONVERTIDO' && <Aviso tipo="ok">Convertido en el ticket {c.ticket_numero} {fechaHora(c.atendido_en)}.</Aviso>}
              {c.estado === 'DESCARTADO' && <Aviso tipo="info">Descartado {fechaHora(c.atendido_en)}. Motivo: {c.motivo_descarte}</Aviso>}
            </div>
          </div>
        )}
      </div>
      {modal === 'registrar' && <RegistrarCorreo onCerrar={() => setModal(null)} onGuardado={() => hecho('Correo guardado en la bandeja')} />}
      {modal === 'descartar' && c && <Descartar correo={c} onCerrar={() => setModal(null)} onHecho={() => hecho('Correo descartado')} />}
    </div>
  );
}

export default function MesaAyuda() {
  const { sedeParam } = useSesion();
  const [params, setParams] = useSearchParams();
  const vista = params.get('vista') === 'correos' ? 'correos' : 'tablero';
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState('');
  const [conteo, setConteo] = useState(0);
  const abierto = params.get('ticket');
  const setAbierto = (id) => { const p = new URLSearchParams(params); if (id) p.set('ticket', id); else p.delete('ticket'); setParams(p); };
  const setVista = (v) => setParams(v === 'correos' ? { vista: 'correos' } : {});

  const cargar = useCallback(() => api.get(`/incidencias${qs({ sede_id: sedeParam })}`).then(setTickets).catch((e) => setError(e.message)), [sedeParam]);
  const contar = useCallback(() => api.get(`/correos${qs({ sede_id: sedeParam, estado: 'POR_ATENDER' })}`).then((l) => setConteo(l.length)).catch(() => {}), [sedeParam]);
  useEffect(() => { cargar(); contar(); const t = setInterval(() => { cargar(); contar(); }, 30000); return () => clearInterval(t); }, [cargar, contar]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-4">
        <Segmentado valor={vista} onChange={setVista} opciones={[['tablero', 'Tablero', Kanban], ['correos', `Correos por atender (${conteo})`, Inbox]]} />
        {vista === 'correos' && <p className="text-[15px] text-slate-500">Los docentes reportan las fallas al buzón TICE de la sede. Revisa cada correo y conviértelo en ticket.</p>}
      </div>
      {vista === 'tablero'
        ? <Tablero tickets={tickets} cargar={cargar} setAbierto={setAbierto} error={error} setError={setError} conteoCorreos={conteo} irACorreos={() => setVista('correos')} />
        : <Correos alCambiar={() => { cargar(); contar(); }} />}
      {abierto && <DetalleTicket id={abierto} onCerrar={() => setAbierto(null)} onCambio={cargar} />}
    </div>
  );
}

