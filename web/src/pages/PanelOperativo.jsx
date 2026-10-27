// Panel del TICE de la sede: lo que hay que atender hoy (tickets por vencer, correos, equipos con falla,
// auditoría). Los indicadores de gestión (KPI, comparación entre sedes) están en el panel del Jefe de TI.
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ClipboardCheck, LifeBuoy, Mail, Plus, ScanLine, ShieldAlert, Upload, Wrench } from 'lucide-react';
import { api } from '../api.js';
import { useSesion } from '../sesion.jsx';
import { Anillo, Aviso, IconoTipo, Insignia, hace, insigniaEquipo } from '../components/ui.jsx';
import { NuevoTicket, Sla } from './MesaAyuda.jsx';

function Cabecera({ icono: Icono, titulo, sub, a, texto = 'Ver todo' }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="icono-tarjeta"><Icono size={18} /></span>
      <div className="min-w-0 flex-1"><div className="titulo-tarjeta">{titulo}</div>{sub && <div className="sub-tarjeta">{sub}</div>}</div>
      {a && <Link to={a} className="whitespace-nowrap text-sm font-medium text-marca-500 hover:underline">{texto}</Link>}
    </div>
  );
}

const saludo = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };

export default function PanelOperativo() {
  const { usuario } = useSesion();
  const navegar = useNavigate();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [nuevo, setNuevo] = useState(false);

  const cargar = useCallback(() => {
    Promise.all([
      api.get('/incidencias'), api.get('/correos'), api.get('/qr/auditorias'),
      api.get('/equipos?estado=AVERIADO'), api.get('/equipos?estado=MANTENIMIENTO'), api.get('/equipos'),
    ]).then(([tickets, correos, auditorias, averiados, mantenimiento, equipos]) => {
      setDatos({ tickets, correos, auditorias, conFalla: [...averiados, ...mantenimiento], equipos });
    }).catch((e) => setError(e.message));
  }, []);
  useEffect(cargar, [cargar]);

  if (error) return <Aviso>{error}</Aviso>;
  if (!datos) return <div className="text-slate-500">Cargando…</div>;

  const abiertos = datos.tickets.filter((t) => ['PENDIENTE', 'EN_PROCESO'].includes(t.estado))
    .sort((a, b) => (b.minutos / b.sla_minutos) - (a.minutos / a.sla_minutos));
  const porCerrar = datos.tickets.filter((t) => t.estado === 'RESUELTO');
  const vencidos = abiertos.filter((t) => t.minutos > t.sla_minutos).length;
  const enCurso = datos.auditorias.find((a) => a.estado === 'EN_CURSO');
  const ultima = datos.auditorias.find((a) => a.estado === 'FINALIZADA');
  const sinVerificar = datos.equipos.filter((e) => !e.ultima_verificacion).length;

  const contadores = [
    [LifeBuoy, 'Tickets abiertos', abiertos.length, vencidos ? `${vencidos} fuera del SLA` : 'Todos dentro del SLA', vencidos ? 'text-red-600' : 'text-emerald-600', '/mesa'],
    [Mail, 'Correos por atender', datos.correos.length, datos.correos.length ? `El más antiguo ${hace(datos.correos.at(-1).recibido_en)}` : 'Bandeja al día', 'text-slate-500', '/mesa?vista=correos'],
    [Wrench, 'Equipos con falla', datos.conFalla.length, 'Averiados o en mantenimiento', 'text-slate-500', '/inventario'],
    [ScanLine, 'Sin verificar con QR', sinVerificar, `de ${datos.equipos.length} equipos activos`, 'text-slate-500', '/pistoleo?modo=auditoria'],
  ];

  return (
    <div className="space-y-6">
      <section className="tarjeta relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-[38rem] rounded-full bg-gradient-to-r from-marca-200/40 via-cyan-100/40 to-pink-100/40 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <div className="text-[15px] text-slate-500">{saludo()}, {usuario.nombre.split(' ')[0]} · {usuario.sede_nombre}</div>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              {abiertos.length || datos.correos.length
                ? <>Tienes <span className="text-marca-500">{abiertos.length} ticket{abiertos.length === 1 ? '' : 's'}</span> y <span className="text-marca-500">{datos.correos.length} correo{datos.correos.length === 1 ? '' : 's'}</span> por atender</>
                : 'Todo al día en tu sede'}
            </h2>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <button className="btn-primario" onClick={() => navegar('/pistoleo')}><ScanLine size={18} />Pistolear</button>
            <button className="btn-secundario" onClick={() => setNuevo(true)}><LifeBuoy size={18} />Nuevo ticket</button>
            <button className="btn-secundario" onClick={() => navegar('/inventario?accion=nuevo')}><Plus size={18} />Registrar equipo</button>
            <button className="btn-secundario" onClick={() => navegar('/inventario?accion=importar')}><Upload size={18} />Importar Excel</button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {contadores.map(([Icono, t, n, sub, color, a]) => (
          <Link key={t} to={a} className="tarjeta block p-5 transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-600"><Icono size={16} className="text-marca-500" />{t}</div>
            <div className="mt-2 text-3xl font-extrabold text-slate-900">{n}</div>
            <div className={`mt-1 text-xs ${color}`}>{sub}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="tarjeta min-w-0 p-5 sm:p-6">
          <Cabecera icono={ShieldAlert} titulo="Tickets por vencer" sub="Ordenados por el tiempo de SLA consumido" a="/mesa" />
          <ul className="divide-y divide-slate-100">
            {abiertos.slice(0, 7).map((t) => (
              <li key={t.id}>
                <Link to={`/mesa?ticket=${t.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 hover:bg-slate-50">
                  <span className="font-mono text-xs text-slate-500">{t.numero}</span>
                  <Insignia valor={t.prioridad} texto={t.prioridad_nombre} />
                  {t.nivel_escalamiento > 1 && <span className="rounded-md bg-amber-100 px-1.5 text-[11px] font-bold text-amber-800">N{t.nivel_escalamiento}</span>}
                  <span className="ml-auto"><Sla t={t} /></span>
                  <span className="w-full truncate text-[15px] text-slate-800">{t.asunto}</span>
                </Link>
              </li>
            ))}
            {!abiertos.length && <li className="py-6 text-center text-sm text-slate-400">No hay tickets abiertos.</li>}
          </ul>
          {porCerrar.length > 0 && <p className="mt-3 text-sm text-slate-500">{porCerrar.length} ticket{porCerrar.length === 1 ? '' : 's'} resuelto{porCerrar.length === 1 ? '' : 's'} esperando cierre.</p>}
        </section>

        <section className="tarjeta min-w-0 p-5 sm:p-6">
          <Cabecera icono={Mail} titulo="Correos por atender" sub="Llegaron al buzón TICE de la sede" a="/mesa?vista=correos" />
          <ul className="divide-y divide-slate-100">
            {datos.correos.slice(0, 6).map((c) => (
              <li key={c.id}>
                <Link to={`/mesa?vista=correos&correo=${c.id}`} className="block py-3 hover:bg-slate-50">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="truncate font-semibold text-slate-800">{c.remitente_nombre || c.remitente}</span>
                    {c.externo && <span className="rounded bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-800">Fuera del dominio</span>}
                    <span className="ml-auto whitespace-nowrap text-xs text-slate-400">{hace(c.recibido_en)}</span>
                  </div>
                  <div className="truncate text-[15px] text-slate-600">{c.asunto}</div>
                </Link>
              </li>
            ))}
            {!datos.correos.length && <li className="py-6 text-center text-sm text-slate-400">La bandeja está al día.</li>}
          </ul>
        </section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="tarjeta min-w-0 p-5 sm:p-6">
          <Cabecera icono={AlertTriangle} titulo="Equipos que necesitan atención" sub="Averiados o en mantenimiento" a="/inventario" />
          <ul className="divide-y divide-slate-100">
            {datos.conFalla.slice(0, 8).map((e) => (
              <li key={e.id}>
                <Link to={`/inventario/${e.id}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50">
                  <span className="icono-tarjeta text-slate-500"><IconoTipo tipo={e.tipo} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-semibold text-slate-900">{e.codigo}</div>
                    <div className="truncate text-xs text-slate-500">{e.marca} {e.modelo} · {e.ubicacion}</div>
                  </div>
                  {insigniaEquipo(e)}
                </Link>
              </li>
            ))}
            {!datos.conFalla.length && <li className="py-6 text-center text-sm text-slate-400">Ningún equipo averiado ni en mantenimiento.</li>}
          </ul>
        </section>

        <section className="tarjeta min-w-0 p-5 sm:p-6">
          <Cabecera icono={ClipboardCheck} titulo="Auditoría del inventario" sub="Verificación física con pistoleo QR" a="/auditorias" texto="Historial" />
          {enCurso ? (
            <div className="flex flex-wrap items-center gap-6">
              <Anillo valor={Math.round((enCurso.leidos / enCurso.equipos_esperados) * 100)} tamano={110}>
                <span className="text-lg font-bold text-slate-900">{enCurso.leidos}/{enCurso.equipos_esperados}</span>
              </Anillo>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-900">Auditoría #{enCurso.id} en curso</div>
                <div className="text-sm text-slate-500">Iniciada {hace(enCurso.fecha_inicio)}. Faltan {enCurso.equipos_esperados - enCurso.leidos} equipos por leer.</div>
                <button className="btn-primario mt-4" onClick={() => navegar('/pistoleo?modo=auditoria')}>Continuar auditoría <ArrowRight size={16} /></button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[15px] text-slate-600">
                {ultima ? <>La última auditoría terminó {hace(ultima.fecha_fin)} con <b>{ultima.tel ?? '—'} %</b> de equipos localizados.</> : 'Todavía no se ha hecho ninguna auditoría en la sede.'}
                {' '}{sinVerificar ? `${sinVerificar} equipos nunca se han verificado con QR.` : ''}
              </p>
              <button className="btn-primario mt-4" onClick={() => navegar('/pistoleo?modo=auditoria')}><ClipboardCheck size={17} />Iniciar auditoría</button>
            </div>
          )}
        </section>
      </div>
      {nuevo && <NuevoTicket onCerrar={() => setNuevo(false)} onCreado={() => { setNuevo(false); cargar(); }} />}
    </div>
  );
}
