import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Lector from '../components/Lector.jsx';
import { Aviso, Campo, Encabezado, Insignia, fechaHora } from '../components/ui.jsx';
import { NuevoTicket } from './MesaAyuda.jsx';

const MODOS = [
  ['identificar', 'Identificar', 'Lea una etiqueta para ver la ficha del equipo.'],
  ['auditoria', 'Auditoría', 'Elija el ambiente y lea cada equipo; al final el sistema calcula la TEL y el TAI.'],
  ['traslado', 'Traslado', 'Lea varios equipos y muévalos juntos a un nuevo ambiente.'],
];

function ModoIdentificar() {
  const [e, setE] = useState(null);
  const [error, setError] = useState('');
  const [reportar, setReportar] = useState(false);
  const [estado, setEstado] = useState('');
  const navegar = useNavigate();
  const leer = async (lectura) => {
    setError(''); setE(null);
    try { setE(await api.post('/qr/identificar', { lectura })); } catch (x) { setError(x.message); }
  };
  const cambiarEstado = async () => {
    try { await api.put(`/equipos/${e.id}`, { estado }); setE({ ...e, estado, estado_nombre: estado }); setEstado(''); } catch (x) { setError(x.message); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="tarjeta p-4"><Lector onLectura={leer} /></div>
      <div className="space-y-3">
        <Aviso>{error}</Aviso>
        {e && (
          <div className="tarjeta p-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xl font-semibold">{e.codigo}</span>
              <Insignia valor={e.estado} texto={e.estado_nombre} />
            </div>
            <p className="text-sm text-slate-600">{e.tipo} · {e.marca} {e.modelo} · {e.ubicacion}</p>
            {e.tickets.length > 0 && (
              <ul className="mt-2 text-sm">
                {e.tickets.map((t) => <li key={t.id}><span className="font-mono">{t.numero}</span> {t.asunto} <Insignia valor={t.estado} /></li>)}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-secundario" onClick={() => navegar(`/inventario/${e.id}`)}>Ver ficha</button>
              {e.estado !== 'BAJA' && <button className="btn-primario" onClick={() => setReportar(true)}>Reportar falla</button>}
              {e.estado !== 'BAJA' && (
                <span className="flex gap-1">
                  <select className="entrada py-1.5" value={estado} onChange={(x) => setEstado(x.target.value)}>
                    <option value="">Cambiar estado…</option>
                    <option value="OPERATIVO">Operativo</option><option value="MANTENIMIENTO">En mantenimiento</option><option value="AVERIADO">Averiado</option>
                  </select>
                  {estado && <button className="btn-secundario" onClick={cambiarEstado}>Guardar</button>}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      {reportar && <NuevoTicket equipoInicial={e} onCerrar={() => setReportar(false)} onCreado={() => { setReportar(false); leer(e.qr_token); }} />}
    </div>
  );
}

function ModoAuditoria() {
  const [auditoria, setAuditoria] = useState(null);
  const [ambiente, setAmbiente] = useState('');
  const [lecturas, setLecturas] = useState([]);
  const [msg, setMsg] = useState({ tipo: 'error', texto: '' });
  const navegar = useNavigate();

  useEffect(() => {
    api.get('/qr/auditorias').then((l) => {
      const enCurso = l.find((a) => a.estado === 'EN_CURSO');
      if (enCurso) api.get(`/qr/auditorias/${enCurso.id}`).then((d) => { setAuditoria(d); setLecturas(d.items); });
    });
  }, []);

  const iniciar = async () => {
    try { const a = await api.post('/qr/auditorias'); setAuditoria({ ...a, items: [], faltantes: [] }); setLecturas([]); }
    catch (x) { setMsg({ tipo: 'error', texto: x.message }); }
  };
  const leer = async (lectura) => {
    if (!ambiente.trim()) { setMsg({ tipo: 'error', texto: 'Escriba primero el ambiente que está revisando' }); return; }
    try {
      const it = await api.post(`/qr/auditorias/${auditoria.id}/lectura`, { lectura, ambiente });
      setLecturas([it, ...lecturas]);
      setMsg(it.resultado === 'ENCONTRADO'
        ? { tipo: 'ok', texto: `✔ ${it.codigo} verificado en ${ambiente}` }
        : { tipo: 'info', texto: `↪ ${it.codigo} figuraba en "${it.ubicacion_anterior}"; se corrigió a ${ambiente}` });
    } catch (x) { setMsg({ tipo: 'error', texto: x.message }); }
  };
  const finalizar = async () => {
    if (!window.confirm('¿Finalizar la auditoría? Los equipos no leídos quedarán como faltantes.')) return;
    try { const a = await api.post(`/qr/auditorias/${auditoria.id}/finalizar`); navegar(`/auditorias/${a.id}`); }
    catch (x) { setMsg({ tipo: 'error', texto: x.message }); }
  };

  if (!auditoria) {
    return (
      <div className="tarjeta p-6 text-center">
        <p className="mb-3 text-sm text-slate-600">No hay una auditoría en curso en su sede.</p>
        <button className="btn-primario" onClick={iniciar}>Iniciar auditoría del inventario</button>
        <div className="mt-3"><Aviso>{msg.texto}</Aviso></div>
      </div>
    );
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="tarjeta space-y-3 p-4">
        <div className="text-sm text-slate-600">Auditoría #{auditoria.id} iniciada el {fechaHora(auditoria.fecha_inicio)} · {lecturas.length} de {auditoria.equipos_esperados} equipos leídos</div>
        <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-marca-500" style={{ width: `${(lecturas.length / auditoria.equipos_esperados) * 100}%` }} /></div>
        <Campo etiqueta="Ambiente que está revisando"><input className="entrada" value={ambiente} onChange={(e) => setAmbiente(e.target.value)} placeholder="Ej.: Laboratorio 1" /></Campo>
        <Lector onLectura={leer} deshabilitado={!ambiente.trim()} />
        <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>
        <button className="btn-primario w-full" onClick={finalizar}>Finalizar auditoría y calcular TEL y TAI</button>
      </div>
      <div className="tarjeta overflow-x-auto">
        <table className="tabla">
          <thead><tr><th>Equipo</th><th>Ambiente</th><th>Resultado</th></tr></thead>
          <tbody>{lecturas.map((l) => (
            <tr key={l.id}><td className="font-mono">{l.codigo}</td><td>{l.ambiente}</td><td><Insignia valor={l.resultado} /></td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

function ModoTraslado() {
  const [lista, setLista] = useState([]);
  const [destino, setDestino] = useState('');
  const [msg, setMsg] = useState({ tipo: 'error', texto: '' });
  const leer = async (lectura) => {
    setMsg({ texto: '' });
    try {
      const e = await api.post('/qr/identificar', { lectura });
      if (lista.some((x) => x.id === e.id)) return;
      setLista([...lista, { ...e, lectura }]);
    } catch (x) { setMsg({ tipo: 'error', texto: x.message }); }
  };
  const trasladar = async () => {
    try {
      const r = await api.post('/qr/traslado', { ubicacion: destino, lecturas: lista.map((x) => x.lectura) });
      setMsg({ tipo: 'ok', texto: `${r.trasladados} equipo(s) trasladado(s) a ${destino}` });
      setLista([]);
    } catch (x) { setMsg({ tipo: 'error', texto: x.message }); }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="tarjeta space-y-3 p-4">
        <Lector onLectura={leer} />
        <Campo etiqueta="Nuevo ambiente"><input className="entrada" value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Ej.: Aula 3B" /></Campo>
        <button className="btn-primario w-full" disabled={!lista.length || !destino.trim()} onClick={trasladar}>Trasladar {lista.length} equipo(s)</button>
        <Aviso tipo={msg.tipo}>{msg.texto}</Aviso>
      </div>
      <div className="tarjeta overflow-x-auto">
        <table className="tabla">
          <thead><tr><th>Equipo</th><th>Ubicación actual</th><th /></tr></thead>
          <tbody>{lista.map((e) => (
            <tr key={e.id}><td className="font-mono">{e.codigo}</td><td>{e.ubicacion}</td>
              <td className="text-right"><button className="text-xs text-red-600" onClick={() => setLista(lista.filter((x) => x.id !== e.id))}>Quitar</button></td></tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

export default function Pistoleo() {
  const [modo, setModo] = useState('identificar');
  return (
    <div>
      <Encabezado titulo="Pistoleo QR" subtitulo={MODOS.find((m) => m[0] === modo)[2]}>
        <Link className="btn-secundario" to="/auditorias">Ver auditorías</Link>
      </Encabezado>
      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1">
        {MODOS.map(([k, t]) => (
          <button key={k} onClick={() => setModo(k)} className={`rounded-md px-4 py-1.5 text-sm ${modo === k ? 'bg-marca-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{t}</button>
        ))}
      </div>
      {modo === 'identificar' && <ModoIdentificar />}
      {modo === 'auditoria' && <ModoAuditoria />}
      {modo === 'traslado' && <ModoTraslado />}
    </div>
  );
}
