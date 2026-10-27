import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { useSesion } from '../sesion.jsx';
import Lector from '../components/Lector.jsx';
import { Aviso, Campo, Confirmar, Encabezado, Insignia, Modal, NIVELES, SelectorSede, fechaHora, minutosATexto } from '../components/ui.jsx';
import { Historial } from './FichaEquipo.jsx';

const COLUMNAS = [['PENDIENTE', 'Pendiente'], ['EN_PROCESO', 'En proceso'], ['RESUELTO', 'Resuelto'], ['CERRADO', 'Cerrado']];
const NOMBRE_PRIORIDAD = { CRITICA: 'Crítica', ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' };

// Selector de equipos afectados: por código o leyendo su etiqueta QR
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
      <div className="mb-1 flex flex-wrap gap-1">
        {valor.map((e) => (
          <span key={e.id} className="inline-flex items-center gap-1 rounded bg-marca-50 px-2 py-0.5 text-xs font-mono text-marca-700">
            {e.codigo}<button type="button" onClick={() => onChange(valor.filter((x) => x.id !== e.id))} aria-label="Quitar">✕</button>
          </span>
        ))}
      </div>
      <div className="relative flex gap-2">
        <input className="entrada" placeholder="Buscar equipo por código…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        <button type="button" className="btn-secundario whitespace-nowrap" onClick={() => setQr(!qr)}>QR</button>
        {opciones.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-200 bg-white shadow">
            {opciones.map((e) => (
              <li key={e.id}><button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50" onClick={() => agregar(e)}>
                <span className="font-mono">{e.codigo}</span> <span className="text-slate-500">{e.tipo} · {e.ubicacion}</span></button></li>
            ))}
          </ul>
        )}
      </div>
      {qr && (
        <div className="mt-2 rounded-md border border-slate-200 p-2">
          <Lector onLectura={async (lectura) => {
            setError('');
            try { agregar(await api.post('/qr/identificar', { lectura })); } catch (x) { setError(x.message); }
          }} />
          <Aviso>{error}</Aviso>
        </div>
      )}
    </div>
  );
}

// Formulario del ticket. Se usa para el registro directo y para convertir un correo de la bandeja.
export function FormTicket({ inicial = {}, sedeId, onEnviar, textoBoton = 'Registrar ticket', onCancelar }) {
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
    if (!f.descripcion.trim() || !f.impacto || !f.urgencia) { setError('Complete la descripción, el impacto y la urgencia'); return; }
    setOcupado(true);
    try { await onEnviar({ ...f, equipo_ids: equipos.map((x) => x.id) }); } catch (x) { setError(x.message); } finally { setOcupado(false); }
  };

  return (
    <form onSubmit={enviar} className="grid gap-3 sm:grid-cols-2">
      {esDirector && !sedeId && <Campo etiqueta="Sede *"><SelectorSede valor={f.sede_id} onChange={(v) => setF({ ...f, sede_id: v })} sedes={sedes} todas={false} /></Campo>}
      <Campo etiqueta="Correo del solicitante *"><input type="email" className="entrada" value={f.solicitante_correo} onChange={set('solicitante_correo')} required /></Campo>
      <Campo etiqueta="Nombre del solicitante"><input className="entrada" value={f.solicitante_nombre || ''} onChange={set('solicitante_nombre')} /></Campo>
      <div className="sm:col-span-2"><Campo etiqueta="Asunto *"><input className="entrada" value={f.asunto} onChange={set('asunto')} required /></Campo></div>
      <div className="sm:col-span-2"><Campo etiqueta="Descripción *"><textarea className="entrada" rows={3} value={f.descripcion} onChange={set('descripcion')} /></Campo></div>
      <Campo etiqueta="Categoría *">
        <select className="entrada" value={f.categoria} onChange={set('categoria')} required>
          <option value="">Seleccione…</option>
          {catalogos.categorias.map((c) => <option key={c}>{c}</option>)}
        </select>
      </Campo>
      <Campo etiqueta="Equipos afectados"><SelectorEquipos sedeId={f.sede_id || sedeId} valor={equipos} onChange={setEquipos} /></Campo>
      <Campo etiqueta="Impacto *" ayuda="Alto: toda la sede, un laboratorio o una evaluación · Medio: un aula u oficina · Bajo: un usuario">
        <select className="entrada" value={f.impacto} onChange={set('impacto')}>
          <option value="">Seleccione…</option><option value="ALTO">Alto</option><option value="MEDIO">Medio</option><option value="BAJO">Bajo</option>
        </select>
      </Campo>
      <Campo etiqueta="Urgencia *" ayuda="Alta: clase o evaluación en curso · Media: antes de la siguiente clase · Baja: se puede programar">
        <select className="entrada" value={f.urgencia} onChange={set('urgencia')}>
          <option value="">Seleccione…</option><option value="ALTA">Alta</option><option value="MEDIA">Media</option><option value="BAJA">Baja</option>
        </select>
      </Campo>
      <div className="rounded-md bg-slate-50 p-3 text-sm sm:col-span-2">
        Prioridad según la matriz de ITIL 4: {prioridad
          ? <><Insignia valor={prioridad} texto={NOMBRE_PRIORIDAD[prioridad]} /> · tiempo objetivo (SLA) <b>{minutosATexto(sla)}</b></>
          : <span className="text-slate-500">elija el impacto y la urgencia</span>}
      </div>
      <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>
      <div className="flex justify-end gap-2 sm:col-span-2">
        {onCancelar && <button type="button" className="btn-secundario" onClick={onCancelar}>Cancelar</button>}
        <button className="btn-primario" disabled={ocupado}>{textoBoton}</button>
      </div>
    </form>
  );
}

export function NuevoTicket({ equipoInicial, onCerrar, onCreado }) {
  const { usuario } = useSesion();
  return (
    <Modal titulo="Registrar nuevo ticket" onCerrar={onCerrar} ancho="max-w-2xl">
      <FormTicket sedeId={equipoInicial?.sede_id || usuario.sede_id} inicial={equipoInicial ? { equipos: [equipoInicial] } : {}}
        onCancelar={onCerrar} onEnviar={async (d) => onCreado(await api.post('/incidencias', d))} />
    </Modal>
  );
}

// Tiempo restante del SLA (o excedido) de un ticket abierto
function Sla({ t }) {
  if (['RESUELTO', 'CERRADO'].includes(t.estado)) {
    return <span className={`text-xs ${t.fuera_de_sla ? 'text-red-600' : 'text-emerald-600'}`}>{minutosATexto(t.minutos)} {t.fuera_de_sla ? '(fuera de SLA)' : '(dentro de SLA)'}</span>;
  }
  const resta = t.sla_minutos - t.minutos;
  return <span className={`text-xs font-medium ${resta < 0 ? 'text-red-600' : resta < t.sla_minutos * 0.25 ? 'text-amber-600' : 'text-slate-500'}`}>
    {resta < 0 ? `Vencido hace ${minutosATexto(-resta)}` : `Quedan ${minutosATexto(resta)}`}</span>;
}

// Escalamiento funcional (ITIL 4): al nivel 2 o al proveedor externo (nivel 3)
function Escalar({ t, onEscalar }) {
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ nivel: String(t.nivel_escalamiento + 1), motivo: '', proveedor: '', caso_proveedor: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  if (t.nivel_escalamiento >= 3) return null;
  if (!abierto) return <button className="btn-secundario mt-3" onClick={() => setAbierto(true)}>Escalar ticket</button>;
  const listo = f.motivo.trim() && (f.nivel !== '3' || f.proveedor.trim());
  return (
    <div className="mt-3 grid gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 sm:grid-cols-2">
      <h3 className="text-sm font-semibold text-slate-700 sm:col-span-2">Escalar ticket</h3>
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

  if (!t) return <Modal titulo="Ticket" onCerrar={onCerrar}><Aviso>{error}</Aviso></Modal>;
  return (
    <Modal titulo={`${t.numero} · ${t.asunto}`} onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <Insignia valor={t.prioridad} texto={`Prioridad ${t.prioridad_nombre}`} />
        <Insignia valor={t.estado} texto={t.estado_nombre} />
        <Sla t={t} />
        <span className="text-xs font-medium text-slate-600">{NIVELES[t.nivel_escalamiento]}</span>
        {esDirector && <span className="text-xs text-slate-500">· {t.sede_nombre}</span>}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-slate-500">Solicitante</dt><dd>{t.solicitante_nombre || '—'}<br /><span className="text-xs text-slate-500">{t.solicitante_correo}</span></dd></div>
        <div><dt className="text-xs text-slate-500">Categoría</dt><dd>{t.categoria}</dd></div>
        <div><dt className="text-xs text-slate-500">Impacto / urgencia</dt><dd>{t.impacto} / {t.urgencia}</dd></div>
        <div><dt className="text-xs text-slate-500">Asignado a</dt><dd>{t.asignado_nombre || '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">Registro</dt><dd>{fechaHora(t.fecha_registro)}</dd></div>
        <div><dt className="text-xs text-slate-500">Resolución</dt><dd>{fechaHora(t.fecha_resolucion)}</dd></div>
        {t.proveedor_externo && <div className="col-span-2"><dt className="text-xs text-slate-500">Proveedor externo</dt><dd>{t.proveedor_externo}{t.caso_proveedor ? ` · caso ${t.caso_proveedor}` : ''}</dd></div>}
        <div className="col-span-2"><dt className="text-xs text-slate-500">Equipos</dt><dd className="font-mono text-xs">{t.equipos.map((e) => e.codigo).join(', ') || '—'}</dd></div>
      </dl>
      <p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700">{t.descripcion}</p>
      {t.solucion && <div className="mt-3 rounded-md bg-emerald-50 p-3 text-sm"><b>Diagnóstico:</b> {t.diagnostico || '—'}<br /><b>Solución:</b> {t.solucion}</div>}
      <div className="mt-3"><Aviso>{error}</Aviso></div>

      {t.estado === 'PENDIENTE' && <button className="btn-primario mt-3" onClick={() => setConfirmar({ estado: 'EN_PROCESO', texto: 'Pasar el ticket a En proceso' })}>Iniciar atención (En proceso)</button>}
      {t.estado === 'EN_PROCESO' && (
        <div className="mt-3 space-y-2 rounded-md border border-slate-200 p-3">
          <h3 className="text-sm font-semibold text-slate-700">Registrar solución técnica</h3>
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
      {['PENDIENTE', 'EN_PROCESO'].includes(t.estado) && <Escalar t={t} onEscalar={(d) => ejecutar(() => api.post(`/incidencias/${t.id}/escalar`, d))} />}
      {t.estado === 'RESUELTO' && <button className="btn-primario mt-3" onClick={() => setConfirmar({ estado: 'CERRADO', texto: 'Cerrar el ticket (el solicitante confirmó que funciona)' })}>Cerrar ticket</button>}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div><h3 className="mb-2 text-sm font-semibold text-slate-700">Historial</h3><Historial registros={[...t.historial].reverse()} /></div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">Avisos por correo</h3>
          <ul className="space-y-1 text-xs">{t.notificaciones.map((n) => (
            <li key={n.id} className="flex justify-between gap-2"><span>{n.asunto}</span><span className="whitespace-nowrap text-slate-500">{n.estado.toLowerCase()}</span></li>
          ))}</ul>
        </div>
      </div>
      {confirmar && (
        <Confirmar titulo="Confirmar cambio" mensaje={`${confirmar.texto}. Esta acción no se puede deshacer.`} onCancelar={() => setConfirmar(null)}
          onConfirmar={() => ejecutar(() => (confirmar.solucion
            ? api.post(`/incidencias/${t.id}/solucion`, sol)
            : api.patch(`/incidencias/${t.id}/estado`, { estado: confirmar.estado })))} />
      )}
    </Modal>
  );
}

export default function MesaAyuda() {
  const { sedeParam, esDirector } = useSesion();
  const [tickets, setTickets] = useState([]);
  const [error, setError] = useState('');
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState(null);
  const [arrastrado, setArrastrado] = useState(null);
  const [mover, setMover] = useState(null);
  const [q, setQ] = useState('');

  const cargar = useCallback(() => api.get(`/incidencias${qs({ sede_id: sedeParam, q })}`).then(setTickets).catch((e) => setError(e.message)), [sedeParam, q]);
  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, [cargar]);

  const soltar = (estado) => {
    const t = tickets.find((x) => x.id === arrastrado);
    setArrastrado(null);
    if (!t || t.estado === estado) return;
    if (estado === 'RESUELTO') { setAbierto(t.id); return; } // la solución se registra en el detalle
    setMover({ t, estado });
  };

  return (
    <div>
      <Encabezado titulo="Mesa de ayuda" subtitulo="Arrastre un ticket a la siguiente columna o ábralo para atenderlo">
        <input className="entrada w-56" placeholder="Buscar ticket o solicitante" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primario" onClick={() => setNuevo(true)}>+ Registrar nuevo ticket</button>
      </Encabezado>
      <Aviso>{error}</Aviso>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNAS.map(([estado, nombre]) => {
          const col = tickets.filter((t) => t.estado === estado);
          return (
            <div key={estado} className="rounded-lg bg-slate-200/60 p-2" onDragOver={(e) => e.preventDefault()} onDrop={() => soltar(estado)}>
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-sm font-semibold text-slate-700">{nombre}</h2>
                <span className="rounded-full bg-white px-2 text-xs text-slate-500">{col.length}</span>
              </div>
              <div className="space-y-2">
                {col.map((t) => (
                  <button key={t.id} draggable onDragStart={() => setArrastrado(t.id)} onClick={() => setAbierto(t.id)}
                    className={`tarjeta block w-full p-3 text-left hover:border-marca-500 ${t.fuera_de_sla && !['RESUELTO', 'CERRADO'].includes(t.estado) ? 'border-l-4 border-l-red-500' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-500">{t.numero}</span>
                      <span className="flex items-center gap-1">
                        {t.nivel_escalamiento > 1 && <span className="rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800" title={NIVELES[t.nivel_escalamiento]}>N{t.nivel_escalamiento}</span>}
                        <Insignia valor={t.prioridad} texto={t.prioridad_nombre} />
                      </span>
                    </div>
                    <div className="mt-1 text-sm font-medium text-slate-800">{t.asunto}</div>
                    <div className="mt-1 text-xs text-slate-500">{t.solicitante_nombre || t.solicitante_correo}{esDirector ? ` · ${t.sede_nombre}` : ''}</div>
                    {t.equipos.length > 0 && <div className="mt-1 font-mono text-[11px] text-slate-500">{t.equipos.map((e) => e.codigo).join(', ')}</div>}
                    <div className="mt-1"><Sla t={t} /></div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {nuevo && <NuevoTicket onCerrar={() => setNuevo(false)} onCreado={() => { setNuevo(false); cargar(); }} />}
      {abierto && <DetalleTicket id={abierto} onCerrar={() => setAbierto(null)} onCambio={cargar} />}
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
