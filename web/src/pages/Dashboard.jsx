import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity, ArrowRight, ArrowUpRight, Boxes, ChevronRight, ClipboardCheck, Gauge, LifeBuoy, Mail, Plus, RefreshCw, ScanLine,
  ShieldCheck, Star, Timer, TrendingDown, Zap,
} from 'lucide-react';
import { api, qs } from '../api.js';
import { useSesion } from '../sesion.jsx';
import { Aviso, Avatar, COLOR_PRIORIDAD, NIVELES, hace } from '../components/ui.jsx';
import { describir } from '../components/describir.js';
import PanelOperativo from './PanelOperativo.jsx';

const ICONOS_KPI = { TRI: Timer, TAI: ClipboardCheck, ICI: Boxes, PIR: ShieldCheck, DT: Activity };
const fmt = (v, unidad) => {
  if (v === null || v === undefined) return '—';
  if (unidad === '%') return `${v} %`;
  if (unidad === 'min') return `${Math.round(v)} min`;
  if (unidad === 'días hábiles') return `${v} día${v === 1 ? '' : 's'}`;
  return `${v} ${unidad}`;
};
const corto = (v, unidad) => (unidad === 'días hábiles' ? `${v} días` : fmt(v, unidad));

// Avance hacia la meta: 0 en la línea base, 100 en la meta
function avance(k) {
  if (k.valor === null) return 0;
  if (k.mejor === 'menor') {
    if (k.base === null || k.base === k.meta) return k.valor <= k.meta ? 100 : 0;
    return Math.max(4, Math.min(100, ((k.base - k.valor) / (k.base - k.meta)) * 100));
  }
  return Math.max(4, Math.min(100, (k.valor / k.meta) * 100));
}

function estadoKpi(k) {
  if (k.valor === null) return ['Sin datos', 'bg-slate-100 text-slate-500'];
  if (k.cumple) return ['Cumple', 'bg-emerald-50 text-emerald-700'];
  const mejora = k.base !== null && (k.mejor === 'menor' ? k.valor < k.base : k.valor > k.base);
  return mejora || k.base === null ? ['En camino', 'bg-amber-50 text-amber-700'] : ['Bajo la base', 'bg-red-50 text-red-700'];
}

function detalleKpi(k) {
  if (k.valor === null) return 'Sin datos todavía';
  if (k.sigla === 'TRI') return `${k.n} tickets resueltos`;
  if (k.sigla === 'ICI') return `${k.completos} de ${k.n} completos`;
  if (k.sigla === 'PIR') return `${k.con_ticket} de ${k.n} fallas con ticket`;
  if (k.sigla === 'TAI') return `Última auditoría · ${k.n} sede(s)`;
  return `${k.n} equipos activos`;
}

function TarjetaKpi({ k }) {
  const Icono = ICONOS_KPI[k.sigla] || Gauge;
  const [estado, cls] = estadoKpi(k);
  const color = k.cumple ? 'bg-emerald-500' : 'bg-gradient-to-r from-marca-500 to-cyan-500';
  return (
    <div className="tarjeta flex flex-col p-5" title={k.nombre}>
      <div className="flex items-center gap-2.5">
        <span className="icono-tarjeta h-8 w-8"><Icono size={16} /></span>
        <span className="text-sm font-semibold text-slate-600">{k.sigla}</span>
        <span className={`ml-auto rounded-md px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{estado}</span>
      </div>
      <div className="mt-4 text-[32px] font-extrabold leading-none tracking-tight text-slate-900">{fmt(k.valor, k.unidad)}</div>
      <div className="mt-1.5 text-sm text-slate-500">{k.nombre}</div>
      <div className="mt-4 h-1.5 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${color}`} style={{ width: `${avance(k)}%` }} /></div>
      <div className="mt-2.5 text-xs font-semibold text-slate-600">
        Meta {k.mejor === 'menor' ? '≤' : '≥'} {corto(k.meta, k.unidad)}{k.base !== null ? ` · base ${corto(k.base, k.unidad).replace(' min', '')}` : ''}
      </div>
      <div className="mt-1 truncate text-xs text-slate-400" title={detalleKpi(k)}>{detalleKpi(k)}</div>
    </div>
  );
}

// Evolución semanal del MTTR frente a la línea base y la meta
function GraficoMttr({ datos, base, meta }) {
  const W = 760; const H = 300; const izq = 40; const der = 16; const arr = 26; const aba = 30;
  if (!datos.length) return <p className="py-16 text-center text-sm text-slate-400">Todavía no hay tickets resueltos en las últimas semanas.</p>;
  const max = Math.ceil(Math.max(base || 0, ...datos.map((d) => d.tri)) / 60) * 60 || 60;
  const x = (i) => izq + (datos.length === 1 ? (W - izq - der) / 2 : (i / (datos.length - 1)) * (W - izq - der));
  const y = (v) => arr + (1 - v / max) * (H - arr - aba);
  const linea = datos.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.tri)}`).join(' ');
  const area = `${linea} L${x(datos.length - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const marcas = Array.from({ length: 5 }, (_, i) => Math.round((max / 4) * i));
  const ultimo = datos[datos.length - 1];
  const etiquetaFecha = (s) => new Date(`${s}T12:00:00`).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }).replace(' de ', '-').replace('.', '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="areaMttr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6366f1" stopOpacity=".22" /><stop offset="1" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>
      {marcas.map((m) => (
        <g key={m}>
          <line x1={izq} x2={W - der} y1={y(m)} y2={y(m)} stroke="currentColor" className="text-slate-100" />
          <text x={izq - 8} y={y(m) + 4} textAnchor="end" className="fill-slate-400 text-[11px]">{m}</text>
        </g>
      ))}
      {base !== null && <>
        <line x1={izq} x2={W - der} y1={y(base)} y2={y(base)} stroke="#94a3b8" strokeDasharray="4 4" />
        <text x={W - der} y={y(base) - 6} textAnchor="end" className="fill-slate-500 text-[11px]">Línea base {base} min</text>
      </>}
      <line x1={izq} x2={W - der} y1={y(meta)} y2={y(meta)} stroke="#10b981" strokeDasharray="6 4" strokeWidth="1.5" />
      <text x={izq + 6} y={y(meta) - 6} className="fill-emerald-600 text-[11px] font-semibold">Meta ≤ {meta} min</text>
      <path d={area} fill="url(#areaMttr)" />
      <path d={linea} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(datos.length - 1)} cy={y(ultimo.tri)} r="5" fill="#6366f1" stroke="white" strokeWidth="2" />
      <text x={x(datos.length - 1) - 8} y={y(ultimo.tri) - 10} textAnchor="end" className="fill-slate-800 text-[12px] font-bold">{Math.round(ultimo.tri)} min</text>
      {datos.map((d, i) => (i % 2 === 0 || i === datos.length - 1) && (
        <text key={d.semana} x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-400 text-[11px]">{etiquetaFecha(d.semana)}</text>
      ))}
    </svg>
  );
}

const COLOR_ESTADO = { OPERATIVO: '#10b981', MANTENIMIENTO: '#f59e0b', AVERIADO: '#ef4444', OBSOLETO: '#fb923c', BAJA: '#94a3b8' };

function Dona({ segmentos, total }) {
  const r = 58; const c = 2 * Math.PI * r;
  let acumulado = 0;
  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 160 160" className="-rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="currentColor" strokeWidth="16" className="text-slate-100" />
        {segmentos.filter((s) => s.n > 0).map((s) => {
          const largo = (s.n / Math.max(1, segmentos.reduce((a, b) => a + b.n, 0))) * c;
          const el = <circle key={s.estado} cx="80" cy="80" r={r} fill="none" stroke={COLOR_ESTADO[s.estado]} strokeWidth="16"
            strokeDasharray={`${Math.max(0, largo - 2)} ${c}`} strokeDashoffset={-acumulado} />;
          acumulado += largo;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold text-slate-900">{total}</span>
        <span className="text-xs text-slate-500">equipos activos</span>
      </div>
    </div>
  );
}

function Cabecera({ icono: Icono, titulo, sub, a }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="icono-tarjeta"><Icono size={18} /></span>
      <div className="min-w-0 flex-1"><div className="titulo-tarjeta">{titulo}</div>{sub && <div className="sub-tarjeta">{sub}</div>}</div>
      {a && <Link to={a} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Ver más"><ArrowRight size={18} /></Link>}
    </div>
  );
}

const ICONO_ACTIVIDAD = { CREAR: Plus, CAMBIO_ESTADO: RefreshCw, RESOLVER: Star, ESCALAR: ArrowUpRight, RECIBIR: Mail, CONVERTIR: Mail, DESCARTAR: Mail, FINALIZAR: ClipboardCheck, INICIAR: ScanLine };

const saludo = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };
const hoyMenos = (d) => { const f = new Date(Date.now() - d * 86400000); return f.toLocaleDateString('en-CA'); };

// El TICE ve su panel operativo; el Jefe de TI, el panel de gestión con los indicadores
export default function Dashboard() {
  const { esDirector } = useSesion();
  return esDirector ? <PanelGestion /> : <PanelOperativo />;
}

function PanelGestion() {
  const { usuario, sedeParam, sedeSel, sedes, esDirector } = useSesion();
  const navegar = useNavigate();
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [dias, setDias] = useState(30);
  const [cargado, setCargado] = useState(null);

  useEffect(() => {
    setError('');
    const t0 = performance.now();
    api.get(`/dashboard${qs({ sede_id: sedeParam, desde: dias ? hoyMenos(dias) : '' })}`)
      .then((r) => { setD(r); setCargado({ en: new Date(), s: (performance.now() - t0) / 1000 }); })
      .catch((e) => setError(e.message));
  }, [sedeParam, dias]);

  const resumen = useMemo(() => {
    if (!d) return null;
    const abiertos = d.tickets_abiertos.reduce((s, r) => s + r.n, 0);
    const vencidos = d.tickets_abiertos.reduce((s, r) => s + r.vencidos, 0);
    const porPrioridad = ['CRITICA', 'ALTA', 'MEDIA', 'BAJA'].map((p) => [p, d.tickets_abiertos.filter((r) => r.prioridad === p).reduce((s, r) => s + r.n, 0)]);
    const activos = d.equipos_por_estado.filter((e) => e.estado !== 'BAJA').reduce((s, e) => s + e.n, 0);
    const totalEquipos = d.equipos_por_estado.reduce((s, e) => s + e.n, 0);
    return { abiertos, vencidos, porPrioridad, activos, totalEquipos };
  }, [d]);

  if (error) return <Aviso>{error}</Aviso>;
  if (!d) return <div className="text-slate-500">Cargando indicadores…</div>;

  const tri = d.indicadores.find((k) => k.sigla === 'TRI');
  const bajo = tri.valor !== null && tri.base ? Math.round(((tri.base - tri.valor) / tri.base) * 100) : null;
  const sedeNombre = esDirector ? (sedes.find((s) => String(s.id) === String(sedeSel))?.nombre || 'Todas las sedes') : usuario.sede_nombre;
  const maxTipo = Math.max(1, ...d.equipos_por_tipo.map((t) => t.n));
  const orden = ['OPERATIVO', 'MANTENIMIENTO', 'AVERIADO', 'OBSOLETO', 'BAJA'];
  const estados = orden.map((e) => d.equipos_por_estado.find((x) => x.estado === e) || { estado: e, nombre: e, n: 0 });

  return (
    <div className="space-y-6">
      <section className="tarjeta relative overflow-hidden p-7 sm:p-9">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-[38rem] rounded-full bg-gradient-to-r from-marca-200/40 via-cyan-100/40 to-pink-100/40 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-3xl">
            <div className="text-[15px] text-slate-500">{saludo()}, {usuario.nombre.split(' ')[0]}</div>
            <h2 className="mt-1 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[40px]">
              {bajo !== null && bajo > 0
                ? <>El tiempo de resolución bajó <span className="bg-gradient-to-r from-marca-500 to-cyan-500 bg-clip-text text-transparent">{bajo} %</span> frente a la línea base</>
                : tri.valor !== null ? <>Tiempo medio de resolución: <span className="text-marca-500">{Math.round(tri.valor)} min</span></> : 'Indicadores del área TICE'}
            </h2>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <select className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm" value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Periodo">
                <option value={7}>Últimos 7 días</option><option value={30}>Últimos 30 días</option><option value={90}>Últimos 90 días</option><option value={0}>Todo el historial</option>
              </select>
              · {sedeNombre} · actualizado {cargado?.en.toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(' de ', '-')}
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <button className="btn-secundario" onClick={() => navegar('/auditorias')}><ClipboardCheck size={18} />Ver auditorías</button>
            <button className="btn-secundario" onClick={() => navegar('/inventario')}><Boxes size={18} />Resumen del inventario</button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-5">
        {d.indicadores.map((k) => <TarjetaKpi key={k.sigla} k={k} />)}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <section className="tarjeta p-6 xl:col-span-2">
          <Cabecera icono={TrendingDown} titulo="Evolución del TRI" sub="Promedio semanal entre el registro y la solución de cada ticket" />
          <GraficoMttr datos={d.tri_semanal} base={tri.base} meta={tri.meta} />
        </section>
        <section className="tarjeta p-6">
          <Cabecera icono={LifeBuoy} titulo="Mesa de ayuda" sub="Tickets abiertos por prioridad" a="/mesa" />
          <div className="flex items-center gap-4">
            <span className="text-6xl font-extrabold text-slate-900">{resumen.abiertos}</span>
            <div className="text-[15px] text-slate-600">abiertos ahora<br />{d.resueltos_por_cerrar} resueltos por cerrar{resumen.vencidos ? <><br /><span className="font-semibold text-red-600">{resumen.vencidos} fuera del SLA</span></> : null}</div>
          </div>
          <ul className="mt-5 space-y-3">
            {resumen.porPrioridad.map(([p, n]) => (
              <li key={p} className="flex items-center gap-3 text-[15px] text-slate-700">
                <span className="h-3 w-3 rotate-45 rounded-[2px]" style={{ background: COLOR_PRIORIDAD[p] }} />
                {{ CRITICA: 'Crítica', ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' }[p]}<span className="ml-auto font-semibold">{n}</span>
              </li>
            ))}
          </ul>
          <Link to="/mesa?vista=correos" className="mt-5 flex items-center gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600 hover:text-slate-900">
            <Mail size={18} className="text-marca-500" />
            <span className="flex-1">Correos por convertir en ticket{d.correos_por_atender.n ? ` · el más antiguo ${hace(d.correos_por_atender.mas_antiguo)}` : ''}</span>
            <span className="font-semibold text-marca-500">{d.correos_por_atender.n}</span>
          </Link>
          {d.tickets_por_nivel.some((x) => x.nivel > 1) && (
            <div className="mt-3 space-y-1 text-xs text-slate-500">
              {d.tickets_por_nivel.filter((x) => x.nivel > 1).map((x) => <div key={x.nivel} className="flex justify-between"><span>{NIVELES[x.nivel]}</span><b>{x.n}</b></div>)}
            </div>
          )}
          <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4 text-sm text-slate-600">
            <Zap size={18} className="text-amber-500" /><span className="flex-1">Resueltos dentro del SLA</span>
            <span className="font-semibold text-slate-900">{d.sla.porcentaje === null ? '—' : `${d.sla.porcentaje} %`}</span>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="tarjeta p-6">
          <Cabecera icono={Gauge} titulo="Estado de los equipos" sub="Distribución por estado operativo" />
          <Dona segmentos={estados.filter((e) => e.estado !== 'BAJA')} total={resumen.activos} />
          <ul className="mt-6 space-y-2.5">
            {estados.map((e) => (
              <li key={e.estado} className="flex items-center gap-3 text-[15px]">
                <span className="h-3 w-3 rounded-[3px]" style={{ background: COLOR_ESTADO[e.estado] }} />
                <span className="flex-1 text-slate-600">{e.nombre === 'BAJA' ? 'De baja' : e.nombre}</span>
                <span className="w-12 text-right font-semibold text-slate-900">{e.n}</span>
                <span className="w-10 text-right text-xs text-slate-400">{resumen.totalEquipos ? Math.round((e.n / resumen.totalEquipos) * 100) : 0}%</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="tarjeta p-6">
          <Cabecera icono={Boxes} titulo="Equipos por tipo" sub={sedeNombre} a="/inventario" />
          <div className="space-y-3.5">
            {d.equipos_por_tipo.slice(0, 8).map((t) => (
              <div key={t.tipo}>
                <div className="flex justify-between text-sm"><span className="text-slate-700">{t.tipo}</span><span className="font-semibold text-slate-900">{t.n}</span></div>
                <div className="mt-1.5 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-marca-500" style={{ width: `${(t.n / maxTipo) * 100}%` }} /></div>
              </div>
            ))}
            {!d.equipos_por_tipo.length && <p className="text-sm text-slate-400">Sin equipos registrados.</p>}
          </div>
        </section>
        <section className="tarjeta p-6">
          <Cabecera icono={Activity} titulo="Actividad reciente" sub="Desde la bitácora de auditoría" a={esDirector ? '/bitacora' : undefined} />
          <ul className="space-y-4">
            {d.actividad.map((a) => {
              const Icono = ICONO_ACTIVIDAD[a.accion] || ChevronRight;
              return (
                <li key={a.secuencia} className="flex gap-3">
                  <Avatar nombre={a.usuario_nombre || 'Sistema'} />
                  <div className="min-w-0">
                    <div className="flex gap-1.5 text-sm text-slate-800"><Icono size={15} className="mt-0.5 shrink-0 text-marca-500" /><span className="line-clamp-2">{describir(a)}</span></div>
                    <div className="text-xs text-slate-400">{a.usuario_nombre || 'Sistema'} · {hace(a.fecha)}</div>
                  </div>
                </li>
              );
            })}
            {!d.actividad.length && <p className="text-sm text-slate-400">Sin actividad todavía.</p>}
          </ul>
        </section>
      </div>

      {esDirector && !sedeSel && (
        <section className="tarjeta p-6">
          <Cabecera icono={Boxes} titulo="Equipos por sede" sub="Consolidado de todas las sedes" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {sedes.map((s) => {
              const filas = d.equipos.por_sede.filter((x) => x.id === s.id);
              const total = filas.reduce((a, b) => a + b.n, 0);
              return <div key={s.id} className="rounded-xl bg-slate-50 p-4"><div className="text-sm text-slate-500">{s.nombre}</div><div className="text-2xl font-extrabold text-slate-900">{total}</div></div>;
            })}
          </div>
        </section>
      )}

      {d.sin_verificar > 0 && (
        <section className="tarjeta flex flex-wrap items-center gap-4 p-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-400 text-white"><ScanLine size={22} /></span>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-900">{d.sin_verificar} equipo{d.sin_verificar === 1 ? '' : 's'} sin verificar en los últimos 6 meses</div>
            <div className="text-sm text-slate-500">Una auditoría con pistoleo QR los concilia en minutos por ambiente y calcula el tiempo de auditoría (TAI).</div>
          </div>
          {!esDirector && <button className="btn-primario" onClick={() => navegar('/pistoleo?modo=auditoria')}>Iniciar auditoría <ArrowRight size={16} /></button>}
        </section>
      )}

      <p className="flex items-center gap-2 text-xs text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Dashboard cargado en {cargado ? cargado.s.toFixed(2) : '—'} s con {resumen.totalEquipos} equipos (RNF-02: menos de 2 s)
      </p>
    </div>
  );
}
