import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Download, FileSpreadsheet, Plus, Printer, ScanLine, Search, Upload, X } from 'lucide-react';
import { api, descargar, qs, subirArchivo } from '../api.js';
import { useSesion } from '../sesion.jsx';
import { Aviso, Campo, IconoTipo, Modal, Vacio, hace, insigniaEquipo } from '../components/ui.jsx';
import FichaEquipo from './FichaEquipo.jsx';

export function FormEquipo({ equipo, onGuardado, onCerrar }) {
  const { catalogos } = useSesion();
  const nuevo = !equipo;
  const CAMPOS = ['tipo_id', 'marca', 'modelo', 'serie', 'fecha_adquisicion', 'estado', 'ubicacion', 'observaciones',
    'caracteristicas', 'mac', 'propiedad', 'responsable', 'guia_factura'];
  const [f, setF] = useState(() => equipo
    ? Object.fromEntries(CAMPOS.map((k) => [k, equipo[k] ?? '']))
    : { codigo: '', ...Object.fromEntries(CAMPOS.map((k) => [k, ''])), estado: 'OPERATIVO', propiedad: 'PROPIO', responsable: 'TICE' });
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
        {nuevo && <Campo etiqueta="Código (único en la sede) *"><input className="entrada font-mono uppercase" value={f.codigo} onChange={set('codigo')} placeholder="LAP-12" required /></Campo>}
        <Campo etiqueta="Tipo *">
          <select className="entrada" value={f.tipo_id} onChange={set('tipo_id')} required>
            <option value="">Seleccione…</option>
            {catalogos.tipos_equipo.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </Campo>
        <Campo etiqueta="Marca *"><input className="entrada" value={f.marca} onChange={set('marca')} required /></Campo>
        <Campo etiqueta="Modelo"><input className="entrada" value={f.modelo} onChange={set('modelo')} /></Campo>
        <Campo etiqueta="N.° de serie"><input className="entrada font-mono" value={f.serie} onChange={set('serie')} /></Campo>
        <Campo etiqueta="MAC"><input className="entrada font-mono" value={f.mac} onChange={set('mac')} placeholder="74-C6-3B-37-40-B5" /></Campo>
        <div className="sm:col-span-2"><Campo etiqueta="Características"><input className="entrada" value={f.caracteristicas} onChange={set('caracteristicas')} placeholder="Core i5-1335U, 8 GB RAM, SSD 480 GB, 23.8″" /></Campo></div>
        <Campo etiqueta="Fecha de ingreso"><input type="date" className="entrada" value={f.fecha_adquisicion} onChange={set('fecha_adquisicion')} /></Campo>
        <Campo etiqueta="Guía / factura"><input className="entrada" value={f.guia_factura} onChange={set('guia_factura')} /></Campo>
        <Campo etiqueta="Propiedad">
          <select className="entrada" value={f.propiedad} onChange={set('propiedad')}>
            <option value="">Sin dato</option><option value="PROPIO">Propio</option><option value="ALQUILADO">Alquilado</option>
          </select>
        </Campo>
        <Campo etiqueta="Responsable"><input className="entrada" value={f.responsable} onChange={set('responsable')} /></Campo>
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

const ESTADOS = [['OPERATIVO', 'Operativo'], ['MANTENIMIENTO', 'En mantenimiento'], ['AVERIADO', 'Averiado'], ['OBSOLETO', 'Obsoleto'], ['BAJA', 'De baja']];

// Importar el inventario desde el Excel de la sede: primero muestra qué hará, luego lo guarda
function ImportarExcel({ onCerrar, onImportado }) {
  const [archivo, setArchivo] = useState(null);
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (a, confirmar) => {
    setError('');
    setOcupado(true);
    try {
      const res = await subirArchivo(`/equipos/importar${confirmar ? '?confirmar=true' : ''}`, a);
      setR(res);
      if (confirmar) onImportado();
    } catch (e) { setError(e.message); setR(null); } finally { setOcupado(false); }
  };
  const elegir = (a) => { if (!a) return; setArchivo(a); enviar(a, false); };
  const cifras = r ? [['Nuevos', r.resumen.nuevos, 'text-emerald-600'], ['Se actualizan', r.resumen.actualizados, 'text-marca-500'],
    ['Sin cambios', r.resumen.sin_cambios, 'text-slate-700'], ['Excluidas', r.resumen.excluidas, 'text-red-600']] : [];
  return (
    <Modal titulo="Importar equipos desde Excel" onCerrar={onCerrar} ancho="max-w-3xl">
      {!r?.confirmado && (
        <label className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center hover:border-marca-300 hover:bg-marca-50/40"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); elegir(e.dataTransfer.files?.[0]); }}>
          <FileSpreadsheet size={36} className="text-emerald-600" />
          <span className="mt-2 font-semibold text-slate-800">{archivo ? archivo.name : 'Elige o arrastra el Excel del inventario (.xlsx)'}</span>
          <span className="mt-1 text-sm text-slate-500">Se lee la hoja con las columnas CÓDIGO, CATEGORÍA, MARCA, ESTADO ACTUAL y UBICACIÓN (como «INVENTARIO 2026»).</span>
          <input type="file" className="hidden" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => elegir(e.target.files?.[0])} />
        </label>
      )}
      {ocupado && <p className="mt-4 text-sm text-slate-500">Leyendo el archivo…</p>}
      <div className="mt-3"><Aviso>{error}</Aviso></div>
      {r && (
        <div className="space-y-4">
          {r.confirmado && <Aviso tipo="ok">Importación guardada: {r.resumen.nuevos} equipos nuevos y {r.resumen.actualizados} actualizados. Quedó registrada en la bitácora.</Aviso>}
          <p className="text-sm text-slate-500">Hoja «{r.resumen.hoja}» · {r.resumen.filas_vacias} filas vacías ignoradas{r.resumen.solo_en_sistema ? ` · ${r.resumen.solo_en_sistema} equipos del sistema no están en el archivo (no se tocan)` : ''}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cifras.map(([t, n, c]) => <div key={t} className="rounded-xl border border-slate-100 p-3"><div className="text-xs text-slate-500">{t}</div><div className={`text-2xl font-extrabold ${c}`}>{n}</div></div>)}
          </div>
          {r.excluidas.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-red-700"><X size={16} />Filas que no se importan (complétalas en el Excel y vuelve a importarlo)</div>
              <div className="max-h-52 overflow-auto rounded-xl border border-slate-100">
                <table className="tabla"><thead><tr><th>Fila</th><th>Código</th><th>Motivo</th></tr></thead>
                  <tbody>{r.excluidas.map((x) => <tr key={`${x.fila}-${x.codigo}`}><td>{x.fila}</td><td className="whitespace-nowrap font-mono">{x.codigo || '—'}</td><td>{x.motivo}</td></tr>)}</tbody></table>
              </div>
            </div>
          )}
          {r.avisos.length > 0 && (
            <div>
              <div className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-amber-700"><AlertTriangle size={16} />Datos para revisar (se importan tal cual)</div>
              <div className="max-h-40 overflow-auto rounded-xl border border-slate-100">
                <table className="tabla"><tbody>{r.avisos.map((x, i) => <tr key={i}><td>{x.fila}</td><td className="whitespace-nowrap font-mono">{x.codigo}</td><td>{x.aviso}</td></tr>)}</tbody></table>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-secundario" onClick={onCerrar}>{r.confirmado ? 'Cerrar' : 'Cancelar'}</button>
            {!r.confirmado && (
              <button className="btn-primario" disabled={ocupado || !(r.resumen.nuevos + r.resumen.actualizados)} onClick={() => enviar(archivo, true)}>
                <CheckCircle2 size={17} />Importar {r.resumen.nuevos + r.resumen.actualizados} equipos
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// Resumen en cifras para el Jefe de TI
function ResumenInventario({ equipos }) {
  const activos = equipos.filter((e) => e.estado !== 'BAJA');
  const n = (fn) => activos.filter(fn).length;
  const datos = [
    ['Equipos activos', activos.length, 'text-slate-900'],
    ['Operativos', n((e) => e.estado === 'OPERATIVO'), 'text-emerald-600'],
    ['Averiados o en mantenimiento', n((e) => ['AVERIADO', 'MANTENIMIENTO'].includes(e.estado)), 'text-red-600'],
    ['Obsoletos', n((e) => e.estado === 'OBSOLETO'), 'text-amber-600'],
    ['Alquilados', n((e) => e.propiedad === 'ALQUILADO'), 'text-marca-500'],
    ['Nunca verificados con QR', n((e) => !e.ultima_verificacion), 'text-amber-600'],
  ];
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {datos.map(([t, v, c]) => <div key={t} className="tarjeta p-4"><div className="text-xs text-slate-500">{t}</div><div className={`mt-1 text-2xl font-extrabold ${c}`}>{v}</div></div>)}
    </div>
  );
}

export default function Inventario() {
  const { catalogos, sedeParam, esDirector } = useSesion();
  const { id } = useParams();
  const navegar = useNavigate();
  const [filtros, setFiltros] = useState({ q: '', tipo_id: '', estado: '', ubicacion: '', marca: '', sin_verificar: '', propiedad: '' });
  const [equipos, setEquipos] = useState([]);
  const [todos, setTodos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  // accesos directos del panel operativo: /inventario?accion=nuevo | importar
  const [params0, setParams0] = useSearchParams();
  useEffect(() => {
    const accion = params0.get('accion');
    if (!esDirector && ['nuevo', 'importar'].includes(accion)) { setModal({ tipo: accion }); setParams0({}, { replace: true }); }
  }, [params0, setParams0, esDirector]);
  const [seleccion, setSeleccion] = useState(new Set());
  const [orden, setOrden] = useState(1);
  const [verFiltros, setVerFiltros] = useState(false);

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
  const cargarTodos = useCallback(() => { api.get(`/equipos${qs({ sede_id: sedeParam })}`).then(setTodos).catch(() => {}); }, [sedeParam]);
  useEffect(cargarTodos, [cargarTodos]);

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
      {esDirector && <ResumenInventario equipos={todos} />}
      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="entrada py-3 pl-11" placeholder={esDirector ? 'Buscar por código, marca, modelo o ubicación…' : 'Buscar por código, marca, serie, MAC, ubicación…'} value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} />
        </div>
        {!esDirector && (
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
            <button className="btn-secundario px-2 py-3 sm:px-4" onClick={() => navegar('/pistoleo')}><ScanLine size={18} />Escanear</button>
            <button className="btn-secundario px-2 py-3 sm:px-4" onClick={() => setModal({ tipo: 'importar' })}><Upload size={18} /><span>Importar<span className="hidden sm:inline"> Excel</span></span></button>
            <button className="btn-primario px-2 py-3 sm:px-4" onClick={() => setModal({ tipo: 'nuevo' })}><Plus size={18} /><span>Nuevo<span className="hidden sm:inline"> equipo</span></span></button>
          </div>
        )}
      </div>
      <button className="btn-secundario mt-3 w-full sm:hidden" onClick={() => setVerFiltros(!verFiltros)}>
        <Search size={16} />{verFiltros ? 'Ocultar filtros' : `Filtros${hayFiltros ? ' (activos)' : ''}`}
      </button>

      <div className={`tarjeta mt-5 space-y-4 p-5 ${verFiltros ? '' : 'hidden sm:block'}`}>
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-sm text-slate-500">Propiedad</span>
          {[['PROPIO', 'Propio'], ['ALQUILADO', 'Alquilado']].map(([v, t]) => <button key={v} className={`chip ${filtros.propiedad === v ? 'chip-activo' : ''}`} onClick={() => set('propiedad', v)}>{t}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <select className="entrada" value={filtros.marca} onChange={(e) => setFiltros({ ...filtros, marca: e.target.value })}>
            <option value="">Todas las marcas</option>{marcas.map((m) => <option key={m}>{m}</option>)}
          </select>
          <select className="entrada" value={filtros.ubicacion} onChange={(e) => setFiltros({ ...filtros, ubicacion: e.target.value })}>
            <option value="">Todas las ubicaciones</option>{ubicaciones.map((m) => <option key={m}>{m}</option>)}
          </select>
          <button className="btn px-3 text-slate-400 hover:text-slate-700 disabled:opacity-40" disabled={!hayFiltros}
            onClick={() => setFiltros({ q: '', tipo_id: '', estado: '', ubicacion: '', marca: '', sin_verificar: '', propiedad: '' })}><X size={16} />Limpiar filtros</button>
        </div>
      </div>

      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[15px] font-semibold text-slate-800">{lista.length} equipo{lista.length === 1 ? '' : 's'}</div>
        <div className="flex flex-wrap gap-2">
          {!esDirector && (
            <button className="btn-secundario py-2" disabled={!lista.length}
              onClick={() => imprimirEtiquetas(seleccion.size ? lista.filter((e) => seleccion.has(e.id)) : lista)}>
              <Printer size={16} />Imprimir etiquetas QR{seleccion.size ? ` (${seleccion.size})` : ''}
            </button>
          )}
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
              <th>Equipo</th>{!esDirector && <th>Serie / MAC</th>}<th>Estado</th>{esDirector && <th>Sede</th>}<th>Ubicación</th>{!esDirector && <th>Propiedad</th>}<th>Verificado</th>
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
                {!esDirector && <td className="font-mono text-xs text-slate-500"><div>{e.serie || '—'}</div><div>{e.mac || ''}</div></td>}
                <td>{insigniaEquipo(e)}</td>
                {esDirector && <td className="text-slate-600">{e.sede_nombre}</td>}
                <td className="text-slate-600">{e.ubicacion}</td>
                {!esDirector && <td className="text-xs text-slate-500">{e.propiedad === 'ALQUILADO' ? 'Alquilado' : e.propiedad === 'PROPIO' ? 'Propio' : '—'}</td>}
                <td className={`text-xs ${e.ultima_verificacion ? 'text-slate-400' : 'font-semibold text-amber-600'}`}>{hace(e.ultima_verificacion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && !lista.length && <Vacio>No se encontraron equipos con estos filtros</Vacio>}
      </div>

      {id && <FichaEquipo id={id} onCerrar={() => navegar('/inventario')} onCambio={cargar} />}
      {modal?.tipo === 'importar' && <ImportarExcel onCerrar={() => setModal(null)} onImportado={() => { cargar(); cargarTodos(); }} />}
      {modal?.tipo === 'nuevo' && <FormEquipo onCerrar={() => setModal(null)} onGuardado={(e) => { setModal(null); cargar(); navegar(`/inventario/${e.id}`); }} />}
    </div>
  );
}
