import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Download, Plus, Printer, ScanLine, Search, X } from 'lucide-react';
import { api, descargar, qs } from '../api.js';
import { useSesion } from '../sesion.jsx';
import { Aviso, Campo, IconoTipo, Modal, SelectorSede, Vacio, hace, insigniaEquipo } from '../components/ui.jsx';
import FichaEquipo from './FichaEquipo.jsx';

export function FormEquipo({ equipo, onGuardado, onCerrar }) {
  const { catalogos, esDirector, sedes, sedeSel } = useSesion();
  const nuevo = !equipo;
  const [f, setF] = useState(() => equipo ? {
    tipo_id: equipo.tipo_id, marca: equipo.marca, modelo: equipo.modelo || '', serie: equipo.serie || '',
    fecha_adquisicion: equipo.fecha_adquisicion || '', estado: equipo.estado, ubicacion: equipo.ubicacion, observaciones: equipo.observaciones || '',
  } : { codigo: '', tipo_id: '', marca: '', modelo: '', serie: '', fecha_adquisicion: '', estado: 'OPERATIVO', ubicacion: '', observaciones: '', sede_id: sedeSel || '' });
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    setOcupado(true);
    try {
      const r = nuevo ? await api.post('/equipos', f) : await api.put(`/equipos/${equipo.id}`, f);
      onGuardado(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal titulo={nuevo ? 'Registrar nuevo equipo' : `Editar ${equipo.codigo}`} onCerrar={onCerrar} ancho="max-w-2xl">
      <form onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
        {nuevo && <Campo etiqueta="Código (único en la sede) *"><input className="entrada font-mono uppercase" value={f.codigo} onChange={set('codigo')} placeholder="SC-PC-0137" required /></Campo>}
        {nuevo && esDirector && (
          <Campo etiqueta="Sede *"><SelectorSede valor={f.sede_id} onChange={(v) => setF({ ...f, sede_id: v })} sedes={sedes} todas={false} /></Campo>
        )}
        <Campo etiqueta="Tipo *">
          <select className="entrada" value={f.tipo_id} onChange={set('tipo_id')} required>
            <option value="">Seleccione…</option>
            {catalogos.tipos_equipo.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Marca *"><input className="entrada" value={f.marca} onChange={set('marca')} required /></Campo>
        <Campo etiqueta="Modelo"><input className="entrada" value={f.modelo} onChange={set('modelo')} /></Campo>
        <Campo etiqueta="N.° de serie"><input className="entrada" value={f.serie} onChange={set('serie')} /></Campo>
        <Campo etiqueta="Fecha de adquisición"><input type="date" className="entrada" value={f.fecha_adquisicion} onChange={set('fecha_adquisicion')} /></Campo>
        <Campo etiqueta="Estado">
          <select className="entrada" value={f.estado} onChange={set('estado')}>
            {catalogos.estados_equipo.filter((s) => s.codigo !== 'BAJA').map((s) => <option key={s.codigo} value={s.codigo}>{s.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Ubicación física (ambiente) *"><input className="entrada" value={f.ubicacion} onChange={set('ubicacion')} placeholder="Ej.: Aula 301" required /></Campo>
        <div className="sm:col-span-2"><Campo etiqueta="Observaciones"><textarea className="entrada" rows={2} value={f.observaciones} onChange={set('observaciones')} /></Campo></div>
        <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primario" disabled={ocupado}>{nuevo ? 'Registrar equipo' : 'Guardar cambios'}</button>
        </div>
      </form>
    </Modal>
  );
}

export function FormBaja({ equipo, onGuardado, onCerrar }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const enviar = async () => {
    try {
      onGuardado(await api.post(`/equipos/${equipo.id}/baja`, { motivo }));
    } catch (err) {
      setError(err.message);
      setConfirmar(false);
    }
  };
  return (
    <Modal titulo={`Dar de baja ${equipo.codigo}`} onCerrar={onCerrar}>
      <p className="mb-4 text-sm text-slate-600">La baja es lógica: el equipo y su historial se conservan. No se puede dar de baja un equipo con un ticket abierto.</p>
      <Campo etiqueta="Motivo de la baja *"><textarea className="entrada" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
      <div className="mt-3"><Aviso>{error}</Aviso></div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secundario" onClick={onCerrar}>Cancelar</button>
        {confirmar
          ? <button className="btn-peligro" onClick={enviar}>Sí, dar de baja</button>
          : <button className="btn-peligro" disabled={!motivo.trim()} onClick={() => setConfirmar(true)}>Dar de baja</button>}
      </div>
    </Modal>
  );
}

export function imprimirEtiquetas(equipos) {
  try { sessionStorage.setItem('tice_etiquetas', JSON.stringify(equipos)); } catch { /* sin almacenamiento */ }
  window.open('/etiquetas', '_blank');
}

const ESTADOS = [['OPERATIVO', 'Operativo'], ['MANTENIMIENTO', 'En mantenimiento'], ['AVERIADO', 'Averiado'], ['BAJA', 'De baja']];

export default function Inventario() {
  const { catalogos, sedeParam, esDirector } = useSesion();
  const { id } = useParams();
  const navegar = useNavigate();
  const [filtros, setFiltros] = useState({ q: '', tipo_id: '', estado: '', ubicacion: '', marca: '', sin_verificar: '' });
  const [equipos, setEquipos] = useState([]);
  const [todos, setTodos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [seleccion, setSeleccion] = useState(new Set());
  const [orden, setOrden] = useState(1);

  const params = { ...filtros, sede_id: sedeParam, incluir_bajas: filtros.estado === 'BAJA' ? 'true' : '' };
  const clave = JSON.stringify(params);

  const cargar = useCallback(() => {
    setCargando(true);
    api.get(`/equipos${qs(JSON.parse(clave))}`).then((r) => { setEquipos(r); setError(''); })
      .catch((e) => setError(e.message)).finally(() => setCargando(false));
  }, [clave]);
  // resultados en tiempo real mientras se escribe (con una pequeña espera)
  useEffect(() => { const t = setTimeout(cargar, 200); return () => clearTimeout(t); }, [cargar]);
  // marcas y ubicaciones de la sede para los filtros
  useEffect(() => { api.get(`/equipos${qs({ sede_id: sedeParam })}`).then(setTodos).catch(() => {}); }, [sedeParam]);

  const marcas = useMemo(() => [...new Set(todos.map((e) => e.marca))].sort(), [todos]);
  const ubicaciones = useMemo(() => [...new Set(todos.map((e) => e.ubicacion))].sort(), [todos]);
  const tiposPresentes = useMemo(() => catalogos.tipos_equipo.filter((t) => todos.some((e) => e.tipo_id === t.id)), [catalogos, todos]);
  const lista = useMemo(() => [...equipos].sort((a, b) => a.codigo.localeCompare(b.codigo) * orden), [equipos, orden]);

  const set = (k, v) => setFiltros({ ...filtros, [k]: filtros[k] === v ? '' : v });
  const hayFiltros = Object.values(filtros).some(Boolean);
  const exportar = async () => {
    try { await descargar(`/equipos/exportar.csv${qs(params)}`, `inventario_${new Date().toISOString().slice(0, 10)}.csv`); }
    catch (e) { setError(e.message); }
  };
  const alternar = (eid) => { const s = new Set(seleccion); s.has(eid) ? s.delete(eid) : s.add(eid); setSeleccion(s); };

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="entrada py-3 pl-11" placeholder="Buscar por código, marca, modelo, serie o ubicación…" value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} />
        </div>
        {!esDirector && <button className="btn-secundario py-3" onClick={() => navegar('/pistoleo')}><ScanLine size={18} />Escanear</button>}
        <button className="btn-primario py-3" onClick={() => setModal({ tipo: 'nuevo' })}><Plus size={18} />Nuevo equipo</button>
      </div>

      <div className="tarjeta mt-5 space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-sm text-slate-500">Tipo</span>
          {tiposPresentes.map((t) => (
            <button key={t.id} className={`chip ${String(filtros.tipo_id) === String(t.id) ? 'chip-activo' : ''}`} onClick={() => set('tipo_id', String(t.id))}>
              <IconoTipo tipo={t.nombre} size={15} />{t.nombre}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-sm text-slate-500">Estado</span>
          {ESTADOS.map(([v, t]) => <button key={v} className={`chip ${filtros.estado === v ? 'chip-activo' : ''}`} onClick={() => set('estado', v)}>{t}</button>)}
          <button className={`chip ${filtros.sin_verificar ? 'chip-activo' : ''}`} onClick={() => set('sin_verificar', 'true')}>Nunca verificados con QR</button>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <select className="entrada" value={filtros.marca} onChange={(e) => setFiltros({ ...filtros, marca: e.target.value })}>
            <option value="">Todas las marcas</option>{marcas.map((m) => <option key={m}>{m}</option>)}
          </select>
          <select className="entrada" value={filtros.ubicacion} onChange={(e) => setFiltros({ ...filtros, ubicacion: e.target.value })}>
            <option value="">Todas las ubicaciones</option>{ubicaciones.map((m) => <option key={m}>{m}</option>)}
          </select>
          <button className="btn px-3 text-slate-400 hover:text-slate-700 disabled:opacity-40" disabled={!hayFiltros}
            onClick={() => setFiltros({ q: '', tipo_id: '', estado: '', ubicacion: '', marca: '', sin_verificar: '' })}><X size={16} />Limpiar filtros</button>
        </div>
      </div>

      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[15px] font-semibold text-slate-800">{lista.length} equipo{lista.length === 1 ? '' : 's'}</div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secundario py-2" disabled={!lista.length}
            onClick={() => imprimirEtiquetas(seleccion.size ? lista.filter((e) => seleccion.has(e.id)) : lista)}>
            <Printer size={16} />Imprimir etiquetas QR{seleccion.size ? ` (${seleccion.size})` : ''}
          </button>
          {esDirector && <button className="btn-secundario py-2" onClick={exportar}><Download size={16} />Exportar CSV</button>}
        </div>
      </div>
      <Aviso>{error}</Aviso>
      <div className="tarjeta overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th className="w-10"><input type="checkbox" className="h-4 w-4 rounded" aria-label="Seleccionar todos" checked={lista.length > 0 && seleccion.size === lista.length}
                onChange={(e) => setSeleccion(e.target.checked ? new Set(lista.map((x) => x.id)) : new Set())} /></th>
              <th><button className="inline-flex items-center gap-1" onClick={() => setOrden(-orden)}>Código {orden > 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}</button></th>
              <th>Equipo</th><th>Estado</th>{esDirector && <th>Sede</th>}<th>Ubicación</th><th>Verificado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navegar(`/inventario/${e.id}`)}>
                <td onClick={(x) => x.stopPropagation()}><input type="checkbox" className="h-4 w-4 rounded" checked={seleccion.has(e.id)} onChange={() => alternar(e.id)} aria-label={`Seleccionar ${e.codigo}`} /></td>
                <td className="font-mono text-[15px] font-semibold text-slate-900">{e.codigo}</td>
                <td>
                  <div className="flex items-center gap-3">
                    <span className="icono-tarjeta text-slate-500"><IconoTipo tipo={e.tipo} /></span>
                    <div><div className="font-semibold text-slate-800">{e.marca} {e.modelo}</div><div className="text-xs text-slate-500">{e.tipo}</div></div>
                  </div>
                </td>
                <td>{insigniaEquipo(e)}</td>
                {esDirector && <td className="text-slate-600">{e.sede_nombre}</td>}
                <td className="text-slate-600">{e.ubicacion}</td>
                <td className={`text-xs ${e.ultima_verificacion ? 'text-slate-400' : 'font-semibold text-amber-600'}`}>{hace(e.ultima_verificacion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && !lista.length && <Vacio>No se encontraron equipos con estos filtros</Vacio>}
      </div>

      {id && <FichaEquipo id={id} onCerrar={() => navegar('/inventario')} onCambio={cargar} />}
      {modal?.tipo === 'nuevo' && <FormEquipo onCerrar={() => setModal(null)} onGuardado={(e) => { setModal(null); cargar(); navegar(`/inventario/${e.id}`); }} />}
    </div>
  );
}
