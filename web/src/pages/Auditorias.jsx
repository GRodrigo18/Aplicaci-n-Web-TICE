import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ScanLine } from 'lucide-react';
import { api, qs } from '../api.js';
import { useSesion } from '../sesion.jsx';
import { Anillo, Aviso, Insignia, Vacio, fecha, fechaHora } from '../components/ui.jsx';

const insigniaAuditoria = (a) => <Insignia valor={a.estado} texto={a.estado === 'EN_CURSO' ? 'En curso' : 'Finalizada'} />;
const colorMeta = (cumple) => (cumple === null ? 'text-slate-900' : cumple ? 'text-emerald-600' : 'text-amber-600');

function Detalle({ id }) {
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get(`/qr/auditorias/${id}`).then(setA).catch((e) => setError(e.message)); }, [id]);
  if (error) return <Aviso>{error}</Aviso>;
  if (!a) return <div className="text-slate-500">Cargando…</div>;
  const encontrados = a.equipos_encontrados ?? a.items.filter((i) => i.resultado === 'ENCONTRADO').length;
  const reubicados = a.equipos_reubicados ?? a.items.filter((i) => i.resultado === 'REUBICADO').length;
  const tarjetas = [
    ['TEL', a.tel !== null ? `${a.tel} %` : '—', 'Meta ≥ 98 %', a.tel === null ? null : a.tel >= 98],
    ['TAI', a.tai_dias ? `${a.tai_dias} día${a.tai_dias === 1 ? '' : 's'}` : '—', 'Meta ≤ 3 días hábiles', a.tai_dias ? a.tai_dias <= 3 : null],
    ['Esperados', a.equipos_esperados], ['En su ambiente', encontrados], ['Reubicados', reubicados], ['Faltantes', a.faltantes.length],
  ];
  return (
    <div>
      <Link to="/auditorias" className="inline-flex items-center gap-1 text-sm font-medium text-marca-500 hover:underline"><ArrowLeft size={16} />Auditorías</Link>
      <div className="mb-5 mt-3 flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold text-slate-900">#{a.id} · {a.sede_nombre}</h2>{insigniaAuditoria(a)}
        <span className="text-sm text-slate-500">{a.usuario_nombre} · {fechaHora(a.fecha_inicio)} → {fechaHora(a.fecha_fin)}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {tarjetas.map(([k, v, s, cumple]) => (
          <div key={k} className="tarjeta p-5"><div className="text-sm text-slate-500">{k}</div>
            <div className={`mt-1 text-2xl font-extrabold ${colorMeta(cumple ?? null)}`}>{v}</div>{s && <div className="text-xs text-slate-400">{s}</div>}</div>
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <div className="tarjeta overflow-x-auto">
          <h3 className="px-5 pt-5 font-bold text-slate-800">Equipos faltantes</h3>
          <table className="tabla"><thead><tr><th>Código</th><th>Tipo</th><th>Ubicación registrada</th></tr></thead>
            <tbody>{a.faltantes.map((f) => <tr key={f.id}><td className="whitespace-nowrap font-mono font-semibold">{f.codigo}</td><td>{f.tipo}</td><td>{f.ubicacion}</td></tr>)}</tbody></table>
          {!a.faltantes.length && <Vacio>Sin faltantes</Vacio>}
        </div>
        <div className="tarjeta max-h-[560px] overflow-auto">
          <h3 className="px-5 pt-5 font-bold text-slate-800">Lecturas ({a.items.length})</h3>
          <table className="tabla"><thead><tr><th>Código</th><th>Leído en</th><th>Figuraba en</th><th>Resultado</th></tr></thead>
            <tbody>{a.items.map((i) => <tr key={i.id}><td className="whitespace-nowrap font-mono font-semibold">{i.codigo}</td><td>{i.ambiente}</td><td>{i.ubicacion_anterior}</td>
              <td><Insignia valor={i.resultado} texto={i.resultado === 'ENCONTRADO' ? 'Encontrado' : 'Reubicado'} /></td></tr>)}</tbody></table>
        </div>
      </div>
    </div>
  );
}

export default function Auditorias() {
  const { id } = useParams();
  const { sedeParam, esDirector } = useSesion();
  const navegar = useNavigate();
  const [lista, setLista] = useState([]);
  useEffect(() => { if (!id) api.get(`/qr/auditorias${qs({ sede_id: sedeParam })}`).then(setLista); }, [id, sedeParam]);
  if (id) return <Detalle id={id} />;
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-3xl text-[15px] text-slate-500">Cada auditoría registra cuándo empezó y terminó la verificación física (TAI) y cuántos equipos se encontraron en su ambiente registrado (TEL).</p>
        {!esDirector && <button className="btn-primario" onClick={() => navegar('/pistoleo?modo=auditoria')}><ScanLine size={18} />Auditar con pistoleo</button>}
      </div>
      <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
        {lista.map((a) => {
          const pct = Math.round((a.leidos / a.equipos_esperados) * 100);
          return (
            <Link key={a.id} to={`/auditorias/${a.id}`} className="tarjeta block p-6 transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-bold text-slate-900">#{a.id} · {a.sede_nombre}</div>
                  <div className="text-sm text-slate-500">{fecha(a.fecha_inicio)}{a.fecha_fin ? ` → ${fecha(a.fecha_fin)}` : ''} · {a.usuario_nombre}</div>
                </div>
                {insigniaAuditoria(a)}
              </div>
              <div className="mt-5 flex items-center gap-6">
                <Anillo valor={pct} tamano={104}><span className="text-lg font-bold text-slate-900">{pct}%</span></Anillo>
                <dl className="flex-1 space-y-2 text-[15px]">
                  <div className="flex justify-between"><dt className="text-slate-500">TEL</dt><dd className={`font-bold ${colorMeta(a.tel === null ? null : a.tel >= 98)}`}>{a.tel !== null ? `${a.tel} %` : '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">TAI</dt><dd className={`font-bold ${colorMeta(a.tai_dias ? a.tai_dias <= 3 : null)}`}>{a.tai_dias ? `${a.tai_dias} día${a.tai_dias === 1 ? '' : 's'}` : '—'}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Verificados</dt><dd className="font-bold text-slate-900">{a.leidos}/{a.equipos_esperados}</dd></div>
                </dl>
              </div>
            </Link>
          );
        })}
      </div>
      {!lista.length && <div className="tarjeta"><Vacio>Todavía no hay auditorías.</Vacio></div>}
    </div>
  );
}
