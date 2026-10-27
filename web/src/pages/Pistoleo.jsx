import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, CheckCircle2, ClipboardCheck, CornerDownRight, ScanLine, ScanSearch, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useSesion } from '../sesion.jsx';
import Lector from '../components/Lector.jsx';
import { Aviso, Campo, Confirmar, IconoTipo, Insignia, Segmentado, Vacio, fechaHora } from '../components/ui.jsx';
import { FichaContenido } from './FichaEquipo.jsx';
import { NuevoTicket } from './MesaAyuda.jsx';

const MODOS = [['identificar', 'Identificar', ScanSearch], ['auditoria', 'Auditoría', ClipboardCheck], ['traslado', 'Traslado', ArrowLeftRight]];

function Lecturas({ titulo, filas }) {
  return (
    <div className="tarjeta p-5">
      <div className="mb-2 text-sm font-semibold text-slate-700">{titulo} · {filas.length}</div>
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {filas.map((f) => (
          <li key={f.clave} className="flex items-center gap-2 py-1 text-[15px]">
            {f.icono || <CheckCircle2 size={18} className="text-emerald-500" />}
            <span className="font-mono font-semibold text-slate-900">{f.codigo}</span>
            <span className="truncate text-slate-500">{f.texto}</span>
            <span className="ml-auto whitespace-nowrap text-xs text-slate-400">{f.derecha}</span>
          </li>
        ))}
        {!filas.length && <li className="py-2 text-sm text-slate-400">Todavía no hay lecturas.</li>}
      </ul>
    </div>
  );
}

function ModoIdentificar() {
  const [e, setE] = useState(null);
  const [error, setError] = useState('');
  const [reportar, setReportar] = useState(false);
  const [lecturas, setLecturas] = useState([]);
  const leer = async (lectura) => {
    setError('');
    try {
      const r = await api.post('/qr/identificar', { lectura });
      setE(r);
      setLecturas((l) => [{ clave: `${r.id}-${Date.now()}`, codigo: r.codigo, texto: `${r.marca} ${r.modelo || ''} · ${r.ubicacion}`, derecha: new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) }, ...l]);
    } catch (x) { setError(x.message); }
  };
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-4">
        <Lector onLectura={leer} aviso={error && <Aviso>{error}</Aviso>} />
        <Lecturas titulo="Lecturas de esta sesión" filas={lecturas} />
      </div>
      <div className="tarjeta self-start overflow-hidden">
        {e ? <FichaContenido e={e} onReportar={() => setReportar(true)} />
          : <Vacio className="py-24"><ScanLine className="mx-auto mb-3 text-slate-300" size={40} />Lee una etiqueta para ver la ficha del equipo, su historial y sus tickets.</Vacio>}
      </div>
      {reportar && <NuevoTicket equipoInicial={e} onCerrar={() => setReportar(false)} onCreado={() => { setReportar(false); leer(e.qr_token); }} />}
    </div>
  );
}

function ModoAuditoria() {
  const [auditoria, setAuditoria] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [ambiente, setAmbiente] = useState('');
  const [lecturas, setLecturas] = useState([]);
  const [msg, setMsg] = useState({ tipo: 'error', texto: '' });
  const [confirmar, setConfirmar] = useState(false);
  const navegar = useNavigate();

  useEffect(() => {
    api.get('/qr/auditorias').then((l) => {
      const enCurso = l.find((a) => a.estado === 'EN_CURSO');
      if (enCurso) return api.get(`/qr/auditorias/${enCurso.id}`).then((d) => { setAuditoria(d); setLecturas([...d.items].reverse()); });
      return null;
    }).finally(() => setCargando(false));
  }, []);

  const iniciar = async () => {
    try { const a = await api.post('/qr/auditorias'); setAuditoria({ ...a, items: [], faltantes: [] }); setLecturas([]); }
    catch (x) { setMsg({ tipo: 'error', texto: x.message }); }
  };
  const leer = async (lectura) => {
    if (!ambiente.trim()) { setMsg({ tipo: 'error', texto: 'Escribe primero el ambiente que estás revisando' }); return; }
    try {
      const it = await api.post(`/qr/auditorias/${auditoria.id}/lectura`, { lectura, ambiente });
      setLecturas([it, ...lecturas]);
      setMsg(it.resultado === 'ENCONTRADO'
        ? { tipo: 'ok', texto: `${it.codigo} verificado en ${ambiente}` }
        : { tipo: 'info', texto: `${it.codigo} figuraba en «${it.ubicacion_anterior}»; se corrigió a ${ambiente}` });
    } catch (x) { setMsg({ tipo: 'error', texto: x.message }); }
  };
  const finalizar = async () => {
    try { const a = await api.post(`/qr/auditorias/${auditoria.id}/finalizar`); navegar(`/auditorias/${a.id}`); }
    catch (x) { setMsg({ tipo: 'error', texto: x.message }); setConfirmar(false); }
  };

  if (cargando) return <div className="text-slate-500">Cargando…</div>;
  if (!auditoria) {
    return (
      <div className="tarjeta mx-auto max-w-xl p-10 text-center">
        <ClipboardCheck size={40} className="mx-auto text-marca-500" />
        <h2 className="mt-3 text-lg font-bold text-slate-900">No hay una auditoría en curso en tu sede</h2>
        <p className="mt-1 text-sm text-slate-500">Al iniciarla, el sistema registra la hora de inicio (para el TAI) y los equipos esperados. Luego lee cada equipo en su ambiente.</p>
        <button className="btn-primario mt-5" onClick={iniciar}>Iniciar auditoría del inventario</button>
        <div className="mt-3"><Aviso>{msg.texto}</Aviso></div>
      </div>
    );
  }
  const pct = (lecturas.length / auditoria.equipos_esperados) * 100;
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-4">
        <div className="tarjeta p-5">
          <div className="flex items-baseline justify-between text-sm text-slate-600">
            <span>Auditoría #{auditoria.id} · iniciada {fechaHora(auditoria.fecha_inicio)}</span>
            <b className="text-slate-900">{lecturas.length} / {auditoria.equipos_esperados}</b>
          </div>
          <div className="mt-2 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-gradient-to-r from-marca-500 to-cyan-500" style={{ width: `${Math.max(1, pct)}%` }} /></div>
          <div className="mt-4"><Campo etiqueta="Ambiente que estás revisando"><input className="entrada" value={ambiente} onChange={(e) => setAmbiente(e.target.value)} placeholder="Ej.: Aula 301" /></Campo></div>
        </div>
        <Lector onLectura={leer} deshabilitado={!ambiente.trim()} aviso={<Aviso tipo={msg.tipo}>{msg.texto}</Aviso>} />
      </div>
      <div className="space-y-4">
        <Lecturas titulo="Equipos leídos" filas={lecturas.map((l) => ({
          clave: l.id, codigo: l.codigo, texto: l.ambiente, derecha: <Insignia valor={l.resultado} texto={l.resultado === 'ENCONTRADO' ? 'Encontrado' : 'Reubicado'} />,
          icono: l.resultado === 'ENCONTRADO' ? undefined : <CornerDownRight size={18} className="text-amber-500" />,
        }))} />
        <button className="btn-primario w-full py-3" onClick={() => setConfirmar(true)}>Finalizar auditoría y calcular TEL y TAI</button>
      </div>
      {confirmar && <Confirmar titulo="Finalizar auditoría" textoBoton="Finalizar"
        mensaje={`Se leyeron ${lecturas.length} de ${auditoria.equipos_esperados} equipos. Los equipos no leídos quedarán como faltantes.`}
        onCancelar={() => setConfirmar(false)} onConfirmar={finalizar} />}
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
    <div className="grid gap-6 xl:grid-cols-2">
      <Lector onLectura={leer} aviso={<Aviso tipo={msg.tipo}>{msg.texto}</Aviso>} />
      <div className="tarjeta self-start p-5">
        <div className="mb-3 text-sm font-semibold text-slate-700">Equipos por trasladar · {lista.length}</div>
        <ul className="space-y-2">
          {lista.map((e) => (
            <li key={e.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
              <span className="icono-tarjeta text-slate-500"><IconoTipo tipo={e.tipo} /></span>
              <div className="min-w-0 flex-1"><div className="font-mono font-semibold">{e.codigo}</div><div className="text-xs text-slate-500">Ahora en {e.ubicacion}</div></div>
              <button className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" onClick={() => setLista(lista.filter((x) => x.id !== e.id))} aria-label={`Quitar ${e.codigo}`}><Trash2 size={16} /></button>
            </li>
          ))}
          {!lista.length && <li className="text-sm text-slate-400">Lee los equipos que vas a mover.</li>}
        </ul>
        <div className="mt-4"><Campo etiqueta="Nuevo ambiente"><input className="entrada" value={destino} onChange={(e) => setDestino(e.target.value)} placeholder="Ej.: Aula 302" /></Campo></div>
        <button className="btn-primario mt-4 w-full" disabled={!lista.length || !destino.trim()} onClick={trasladar}>Trasladar {lista.length} equipo(s)</button>
      </div>
    </div>
  );
}

export default function Pistoleo() {
  const { esDirector } = useSesion();
  const [params, setParams] = useSearchParams();
  const modo = MODOS.some((m) => m[0] === params.get('modo')) ? params.get('modo') : 'identificar';
  const modos = esDirector ? MODOS.filter((m) => m[0] === 'identificar') : MODOS;
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[15px] text-slate-500">Escanea con la cámara del celular o de la PC, o dispara una pistola lectora USB/Bluetooth.</p>
        <Segmentado valor={modo} onChange={(m) => setParams(m === 'identificar' ? {} : { modo: m })} opciones={modos} />
      </div>
      {modo === 'identificar' && <ModoIdentificar />}
      {modo === 'auditoria' && <ModoAuditoria />}
      {modo === 'traslado' && <ModoTraslado />}
    </div>
  );
}
