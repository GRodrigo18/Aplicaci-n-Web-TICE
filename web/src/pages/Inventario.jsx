import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, descargar, qs } from '../api.js';
import { useSesion } from '../sesion.jsx';
import { Aviso, Campo, Encabezado, Insignia, Modal, SelectorSede, Vacio, fecha } from '../components/ui.jsx';

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
      <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
        {nuevo && <Campo etiqueta="Código (único en la sede) *"><input className="entrada uppercase" value={f.codigo} onChange={set('codigo')} required /></Campo>}
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
        <Campo etiqueta="Ubicación física (ambiente) *"><input className="entrada" value={f.ubicacion} onChange={set('ubicacion')} placeholder="Ej.: Laboratorio 1" required /></Campo>
        <div className="sm:col-span-2"><Campo etiqueta="Observaciones"><textarea className="entrada" rows={2} value={f.observaciones} onChange={set('observaciones')} /></Campo></div>
        <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primario" disabled={ocupado}>{nuevo ? 'Registrar' : 'Guardar cambios'}</button>
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
      <p className="mb-3 text-sm text-slate-600">La baja es lógica: el equipo y su historial se conservan. No se puede dar de baja un equipo con un ticket abierto.</p>
      <Campo etiqueta="Motivo de la baja *"><textarea className="entrada" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
      <div className="mt-3"><Aviso>{error}</Aviso></div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secundario" onClick={onCerrar}>Cancelar</button>
        {confirmar
          ? <button className="btn-peligro" onClick={enviar}>Sí, dar de baja</button>
          : <button className="btn-peligro" disabled={!motivo.trim()} onClick={() => setConfirmar(true)}>Dar de baja</button>}
      </div>
    </Modal>
  );
}

export default function Inventario() {
  const { catalogos, sedeParam, esDirector } = useSesion();
  const navegar = useNavigate();
  const [filtros, setFiltros] = useState({ q: '', tipo_id: '', estado: '', ubicacion: '', marca: '' });
  const [equipos, setEquipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [seleccion, setSeleccion] = useState(new Set());

  const params = { ...filtros, sede_id: sedeParam, incluir_bajas: filtros.estado === 'BAJA' ? 'true' : '' };
  const clave = JSON.stringify(params);

  const cargar = useCallback(() => {
    setCargando(true);
    api.get(`/equipos${qs(JSON.parse(clave))}`).then((r) => { setEquipos(r); setError(''); })
      .catch((e) => setError(e.message)).finally(() => setCargando(false));
  }, [clave]);

  // resultados en tiempo real mientras se escribe (con una pequeña espera)
  useEffect(() => { const t = setTimeout(cargar, 250); return () => clearTimeout(t); }, [cargar]);

  const set = (k) => (e) => setFiltros({ ...filtros, [k]: e.target.value });
  const exportar = async () => {
    try { await descargar(`/equipos/exportar.csv${qs(params)}`, `inventario_${new Date().toISOString().slice(0, 10)}.csv`); }
    catch (e) { setError(e.message); }
  };
  const alternar = (id) => { const s = new Set(seleccion); s.has(id) ? s.delete(id) : s.add(id); setSeleccion(s); };
  const imprimir = () => {
    const ids = seleccion.size ? [...seleccion] : equipos.map((e) => e.id);
    try { sessionStorage.setItem('tice_etiquetas', JSON.stringify(equipos.filter((e) => ids.includes(e.id)))); } catch { /* */ }
    window.open('/etiquetas', '_blank');
  };

  return (
    <div>
      <Encabezado titulo="Inventario de equipos" subtitulo={`${equipos.length} equipo(s) en la vista`}>
        <button className="btn-secundario" onClick={imprimir} disabled={!equipos.length}>🏷️ Imprimir etiquetas QR{seleccion.size ? ` (${seleccion.size})` : ''}</button>
        {esDirector && <button className="btn-secundario" onClick={exportar}>⬇️ Exportar CSV</button>}
        <button className="btn-primario" onClick={() => setModal({ tipo: 'nuevo' })}>+ Ingresar nuevo equipo</button>
      </Encabezado>

      <div className="tarjeta mb-4 grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-5">
        <input className="entrada lg:col-span-1" placeholder="Buscar código, marca, serie…" value={filtros.q} onChange={set('q')} />
        <select className="entrada" value={filtros.tipo_id} onChange={set('tipo_id')}>
          <option value="">Todos los tipos</option>
          {catalogos.tipos_equipo.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
        </select>
        <select className="entrada" value={filtros.estado} onChange={set('estado')}>
          <option value="">Activos (sin bajas)</option>
          {catalogos.estados_equipo.map((s) => <option key={s.codigo} value={s.codigo}>{s.nombre}</option>)}
        </select>
        <input className="entrada" placeholder="Marca" value={filtros.marca} onChange={set('marca')} />
        <input className="entrada" placeholder="Ubicación" value={filtros.ubicacion} onChange={set('ubicacion')} />
      </div>

      <Aviso>{error}</Aviso>
      <div className="tarjeta overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th className="w-8"><input type="checkbox" aria-label="Seleccionar todos" checked={equipos.length > 0 && seleccion.size === equipos.length}
                onChange={(e) => setSeleccion(e.target.checked ? new Set(equipos.map((x) => x.id)) : new Set())} /></th>
              <th>Código</th><th>Tipo</th><th>Marca / modelo</th>{esDirector && <th>Sede</th>}<th>Ubicación</th><th>Estado</th><th>Verificado</th><th />
            </tr>
          </thead>
          <tbody>
            {equipos.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td><input type="checkbox" checked={seleccion.has(e.id)} onChange={() => alternar(e.id)} aria-label={`Seleccionar ${e.codigo}`} /></td>
                <td className="font-mono font-medium"><Link className="text-marca-600 hover:underline" to={`/inventario/${e.id}`}>{e.codigo}</Link></td>
                <td>{e.tipo}</td>
                <td>{e.marca} <span className="text-slate-500">{e.modelo}</span></td>
                {esDirector && <td>{e.sede_nombre}</td>}
                <td>{e.ubicacion}</td>
                <td><Insignia valor={e.estado} texto={e.estado_nombre} /></td>
                <td className="text-xs text-slate-500">{fecha(e.ultima_verificacion)}</td>
                <td className="whitespace-nowrap text-right">
                  {e.estado !== 'BAJA' && <>
                    <button className="px-1 text-xs text-marca-600 hover:underline" onClick={() => setModal({ tipo: 'editar', equipo: e })}>Editar</button>
                    <button className="px-1 text-xs text-red-600 hover:underline" onClick={() => setModal({ tipo: 'baja', equipo: e })}>Dar de baja</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!cargando && !equipos.length && <Vacio>No se encontraron equipos</Vacio>}
      </div>

      {modal?.tipo === 'nuevo' && <FormEquipo onCerrar={() => setModal(null)} onGuardado={(e) => { setModal(null); navegar(`/inventario/${e.id}`); }} />}
      {modal?.tipo === 'editar' && <FormEquipo equipo={modal.equipo} onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); cargar(); }} />}
      {modal?.tipo === 'baja' && <FormBaja equipo={modal.equipo} onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); cargar(); }} />}
    </div>
  );
}
