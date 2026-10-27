import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, qs } from '../api.js';
import { useSesion } from '../sesion.jsx';
import { Aviso, Encabezado, Insignia, Vacio, fechaHora } from '../components/ui.jsx';

function Detalle({ id }) {
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get(`/qr/auditorias/${id}`).then(setA).catch((e) => setError(e.message)); }, [id]);
  if (error) return <Aviso>{error}</Aviso>;
  if (!a) return <div className="text-slate-500">Cargando…</div>;
  const tarjetas = [
    ['TEL', a.tel !== null ? `${a.tel} %` : '—', 'Meta ≥ 98 %'], ['TAI', a.tai_dias ? `${a.tai_dias} día(s) hábil(es)` : '—', 'Meta ≤ 3 días'],
    ['Esperados', a.equipos_esperados], ['Encontrados en su ambiente', a.equipos_encontrados ?? a.items.filter((i) => i.resultado === 'ENCONTRADO').length],
    ['Reubicados', a.equipos_reubicados ?? a.items.filter((i) => i.resultado === 'REUBICADO').length], ['Faltantes', a.faltantes.length],
  ];
  return (
    <div>
      <Link to="/auditorias" className="text-sm text-marca-600 hover:underline">← Auditorías</Link>
      <Encabezado titulo={`Auditoría #${a.id} · ${a.sede_nombre}`} subtitulo={`${a.usuario_nombre} · ${fechaHora(a.fecha_inicio)} → ${fechaHora(a.fecha_fin)}`}>
        <Insignia valor={a.estado === 'EN_CURSO' ? 'EN_PROCESO' : 'CERRADO'} texto={a.estado === 'EN_CURSO' ? 'En curso' : 'Finalizada'} />
      </Encabezado>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tarjetas.map(([k, v, s]) => (
          <div key={k} className="tarjeta p-3"><div className="text-xs text-slate-500">{k}</div><div className="text-xl font-semibold text-slate-800">{v}</div>{s && <div className="text-xs text-slate-400">{s}</div>}</div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="tarjeta overflow-x-auto">
          <h2 className="px-3 pt-3 font-semibold text-slate-700">Equipos faltantes</h2>
          <table className="tabla"><thead><tr><th>Código</th><th>Tipo</th><th>Ubicación registrada</th></tr></thead>
            <tbody>{a.faltantes.map((f) => <tr key={f.id}><td className="font-mono">{f.codigo}</td><td>{f.tipo}</td><td>{f.ubicacion}</td></tr>)}</tbody></table>
          {!a.faltantes.length && <Vacio>Sin faltantes</Vacio>}
        </div>
        <div className="tarjeta overflow-x-auto">
          <h2 className="px-3 pt-3 font-semibold text-slate-700">Lecturas</h2>
          <table className="tabla"><thead><tr><th>Código</th><th>Leído en</th><th>Figuraba en</th><th>Resultado</th></tr></thead>
            <tbody>{a.items.map((i) => <tr key={i.id}><td className="font-mono">{i.codigo}</td><td>{i.ambiente}</td><td>{i.ubicacion_anterior}</td><td><Insignia valor={i.resultado} /></td></tr>)}</tbody></table>
        </div>
      </div>
    </div>
  );
}

export default function Auditorias() {
  const { id } = useParams();
  const { sedeParam, esDirector } = useSesion();
  const [lista, setLista] = useState([]);
  useEffect(() => { if (!id) api.get(`/qr/auditorias${qs({ sede_id: sedeParam })}`).then(setLista); }, [id, sedeParam]);
  if (id) return <Detalle id={id} />;
  return (
    <div>
      <Encabezado titulo="Auditorías físicas del inventario" subtitulo="Cada auditoría por pistoleo QR calcula la TEL y el TAI">
        {!esDirector && <Link className="btn-primario" to="/pistoleo">Ir a Pistoleo QR</Link>}
      </Encabezado>
      <div className="tarjeta overflow-x-auto">
        <table className="tabla">
          <thead><tr><th>#</th><th>Sede</th><th>Responsable</th><th>Inicio</th><th>Fin</th><th>Leídos</th><th>TEL</th><th>TAI</th><th>Estado</th></tr></thead>
          <tbody>{lista.map((a) => (
            <tr key={a.id} className="hover:bg-slate-50">
              <td><Link className="text-marca-600 hover:underline" to={`/auditorias/${a.id}`}>#{a.id}</Link></td>
              <td>{a.sede_nombre}</td><td>{a.usuario_nombre}</td><td>{fechaHora(a.fecha_inicio)}</td><td>{fechaHora(a.fecha_fin)}</td>
              <td>{a.leidos} / {a.equipos_esperados}</td><td>{a.tel !== null ? `${a.tel} %` : '—'}</td><td>{a.tai_dias ? `${a.tai_dias} d` : '—'}</td>
              <td><Insignia valor={a.estado === 'EN_CURSO' ? 'EN_PROCESO' : 'CERRADO'} texto={a.estado === 'EN_CURSO' ? 'En curso' : 'Finalizada'} /></td>
            </tr>
          ))}</tbody>
        </table>
        {!lista.length && <Vacio>Todavía no hay auditorías.</Vacio>}
      </div>
    </div>
  );
}
