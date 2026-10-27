import { useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { useSesion } from '../sesion.jsx';
import { Aviso, Encabezado, Insignia, NIVELES, fechaHora } from '../components/ui.jsx';

const fmt = (v, unidad) => {
  if (v === null || v === undefined) return '—';
  return unidad === '%' ? `${v} %` : unidad === 'min' ? `${v} min` : `${v} ${unidad}`;
};

function TarjetaKpi({ k }) {
  const color = k.cumple === null ? 'border-slate-200' : k.cumple ? 'border-emerald-400' : 'border-amber-400';
  return (
    <div className={`tarjeta border-t-4 p-4 ${color}`}>
      <div className="flex items-start justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.sigla}</div>
        {k.cumple !== null && <Insignia valor={k.cumple ? 'OPERATIVO' : 'MANTENIMIENTO'} texto={k.cumple ? 'Cumple la meta' : 'Bajo la meta'} />}
      </div>
      <div className="mt-1 text-sm text-slate-600">{k.nombre}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-800">{fmt(k.valor, k.unidad)}</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
        <div>Línea base: <span className="font-medium text-slate-700">{k.base === null ? 'por medir' : fmt(k.base, k.unidad)}</span></div>
        <div>Meta: <span className="font-medium text-slate-700">{k.mejor === 'menor' ? '≤' : '≥'} {fmt(k.meta, k.unidad)}</span></div>
      </div>
      <div className="mt-1 text-xs text-slate-400">
        {k.valor === null ? 'Sin datos todavía' : k.sigla === 'TEL' || k.sigla === 'TAI' ? `Última auditoría (${k.n} ${k.sigla === 'TAI' ? 'sede(s)' : 'equipos esperados'})` : k.sigla === 'DT' ? `${k.n} equipos activos` : `${k.n} incidencias resueltas`}
      </div>
    </div>
  );
}

function Barras({ datos, max }) {
  return (
    <div className="space-y-2">
      {datos.map((d) => (
        <div key={d.etiqueta}>
          <div className="flex justify-between text-xs text-slate-600"><span>{d.etiqueta}</span><span className="font-medium">{d.valor}</span></div>
          <div className="mt-0.5 h-2 rounded bg-slate-100">
            <div className={`h-2 rounded ${d.color || 'bg-marca-500'}`} style={{ width: `${max ? (d.valor / max) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const COLOR_ESTADO = { OPERATIVO: 'bg-emerald-500', MANTENIMIENTO: 'bg-amber-400', AVERIADO: 'bg-red-500', BAJA: 'bg-slate-400' };

export default function Dashboard() {
  const { sedeParam, esDirector } = useSesion();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  useEffect(() => {
    setError('');
    api.get(`/dashboard${qs({ sede_id: sedeParam, desde, hasta })}`).then(setD).catch((e) => setError(e.message));
  }, [sedeParam, desde, hasta]);

  if (error) return <Aviso>{error}</Aviso>;
  if (!d) return <div className="text-slate-500">Cargando indicadores…</div>;

  // equipos por sede (filas) y estado (segmentos)
  const sedes = {};
  d.equipos.por_sede.forEach((r) => {
    sedes[r.nombre] = sedes[r.nombre] || { total: 0, estados: {} };
    sedes[r.nombre].total += r.n;
    sedes[r.nombre].estados[r.estado] = r.n;
  });
  const maxSede = Math.max(1, ...Object.values(sedes).map((s) => s.total));
  const abiertos = d.tickets_abiertos.reduce((s, r) => s + r.n, 0);
  const vencidos = d.tickets_abiertos.reduce((s, r) => s + r.vencidos, 0);
  const porPrioridad = ['CRITICA', 'ALTA', 'MEDIA', 'BAJA'].map((p) => ({
    etiqueta: { CRITICA: 'Crítica', ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' }[p],
    valor: d.tickets_abiertos.filter((r) => r.prioridad === p).reduce((s, r) => s + r.n, 0),
    color: { CRITICA: 'bg-red-500', ALTA: 'bg-orange-400', MEDIA: 'bg-amber-400', BAJA: 'bg-slate-400' }[p],
  }));

  return (
    <div>
      <Encabezado titulo="Dashboard de indicadores" subtitulo={esDirector ? 'Consolidado según la sede elegida arriba' : 'Indicadores de su sede'}>
        <label className="text-xs text-slate-500">Resueltas desde <input type="date" className="entrada py-1" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="text-xs text-slate-500">hasta <input type="date" className="entrada py-1" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
      </Encabezado>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {d.indicadores.map((k) => <TarjetaKpi key={k.sigla} k={k} />)}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="tarjeta p-4 lg:col-span-2">
          <h2 className="mb-3 font-semibold text-slate-700">Equipos por sede y estado</h2>
          <div className="space-y-3">
            {Object.entries(sedes).map(([nombre, s]) => (
              <div key={nombre}>
                <div className="flex justify-between text-xs text-slate-600"><span>{nombre}</span><span className="font-medium">{s.total}</span></div>
                <div className="mt-0.5 flex h-3 overflow-hidden rounded bg-slate-100" style={{ width: `${(s.total / maxSede) * 100}%` }}>
                  {Object.entries(s.estados).map(([e, n]) => (
                    <div key={e} className={COLOR_ESTADO[e]} style={{ width: `${(n / s.total) * 100}%` }} title={`${e}: ${n}`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
            {Object.entries(COLOR_ESTADO).map(([e, c]) => <span key={e} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-sm ${c}`} />{e.charAt(0) + e.slice(1).toLowerCase()}</span>)}
          </div>
        </div>
        <div className="tarjeta p-4">
          <h2 className="font-semibold text-slate-700">Tickets abiertos</h2>
          <div className="mb-3 mt-1 text-3xl font-semibold text-slate-800">{abiertos}</div>
          {vencidos > 0 && <div className="mb-3"><Aviso>{vencidos} ticket(s) fuera del SLA</Aviso></div>}
          <Barras datos={porPrioridad} max={Math.max(1, ...porPrioridad.map((p) => p.valor))} />
          <h3 className="mb-1 mt-4 text-xs font-semibold uppercase text-slate-500">Por nivel de escalamiento</h3>
          <Barras datos={[1, 2, 3].map((n) => ({ etiqueta: NIVELES[n], valor: (d.tickets_por_nivel.find((x) => x.nivel === n) || { n: 0 }).n }))}
            max={Math.max(1, ...d.tickets_por_nivel.map((x) => x.n))} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="tarjeta p-4">
          <h2 className="mb-3 font-semibold text-slate-700">Incidencias por categoría</h2>
          {d.tickets_por_categoria.length
            ? <Barras datos={d.tickets_por_categoria.map((c) => ({ etiqueta: c.categoria, valor: c.n }))} max={Math.max(...d.tickets_por_categoria.map((c) => c.n))} />
            : <p className="text-sm text-slate-500">Sin incidencias registradas.</p>}
        </div>
        <div className="tarjeta p-4">
          <h2 className="mb-3 font-semibold text-slate-700">Última auditoría física por sede</h2>
          {d.auditorias.length ? (
            <table className="tabla">
              <thead><tr><th>Sede</th><th>Fin</th><th>TEL</th><th>TAI</th><th>Faltantes</th></tr></thead>
              <tbody>{d.auditorias.map((a) => (
                <tr key={a.id}><td>{a.sede_nombre}</td><td>{fechaHora(a.fecha_fin)}</td><td>{a.tel} %</td><td>{a.tai_dias} d</td><td>{a.equipos_faltantes}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="text-sm text-slate-500">Todavía no hay auditorías finalizadas.</p>}
        </div>
      </div>
    </div>
  );
}
