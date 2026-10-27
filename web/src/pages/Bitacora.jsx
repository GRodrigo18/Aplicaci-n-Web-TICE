import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Search, ShieldCheck } from 'lucide-react';
import { api, qs } from '../api.js';
import { useSesion } from '../sesion.jsx';
import { Aviso, Avatar, fechaHora } from '../components/ui.jsx';
import { colorAccion, describir } from '../components/describir.js';

const ACCIONES = ['CREAR', 'MODIFICAR', 'BAJA', 'CAMBIO_ESTADO', 'RESOLVER', 'ESCALAR', 'ALERTA_SLA', 'CONVERTIR', 'DESCARTAR', 'RECIBIR',
  'LECTURA_QR', 'VERIFICADO', 'TRASLADO', 'INICIAR', 'FINALIZAR', 'LOGIN'];

export default function Bitacora() {
  const { sedeParam } = useSesion();
  const [f, setF] = useState({ entidad: '', accion: '', usuario: '', desde: '', hasta: '' });
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState({ registros: [], total: 0, limite: 100 });
  const [verif, setVerif] = useState(null);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPagina(1); };
  const cargar = useCallback(() => api.get(`/bitacora${qs({ ...f, sede_id: sedeParam, pagina })}`).then(setDatos), [f, sedeParam, pagina]);
  useEffect(() => { const t = setTimeout(cargar, 200); return () => clearTimeout(t); }, [cargar]);
  const paginas = Math.max(1, Math.ceil(datos.total / datos.limite));

  return (
    <div className="space-y-5">
      <section className="tarjeta flex flex-wrap items-center gap-5 p-6">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-marca-50 text-marca-500"><Lock size={24} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold text-slate-900">Registro inmutable de cada operación</div>
          <div className="text-[15px] text-slate-500">La base de datos rechaza cualquier edición o borrado, y cada registro guarda el hash SHA-256 del anterior: si alguien altera una fila, la cadena lo delata.</div>
        </div>
        <button className="btn-secundario" onClick={() => api.get('/bitacora/verificar').then(setVerif)}><ShieldCheck size={17} />Verificar integridad</button>
      </section>
      {verif && (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Aviso tipo={verif.integra ? 'ok' : 'error'}>
            {verif.integra ? `Cadena íntegra: ${verif.registros} registros verificados.` : `Se detectaron ${verif.registros_alterados.length} registro(s) alterado(s) (secuencia ${verif.registros_alterados.map((r) => r.secuencia).join(', ')}).`}
          </Aviso>
          <Aviso tipo={verif.completa ? 'ok' : 'error'}>
            {verif.completa ? `Las ${verif.operaciones_contadas} operaciones sobre equipos e incidencias tienen su registro en la bitácora.` : `${verif.operaciones_sin_bitacora.length} operación(es) sin registro en la bitácora (hechas por fuera del sistema).`}
          </Aviso>
        </div>
      )}
      <div className="tarjeta grid grid-cols-1 gap-3 p-5 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="entrada pl-11" placeholder="Buscar por usuario…" value={f.usuario} onChange={set('usuario')} />
        </div>
        <select className="entrada" value={f.entidad} onChange={set('entidad')}>
          <option value="">Todo</option>
          {[['equipo', 'Equipos'], ['incidencia', 'Tickets'], ['correo', 'Correos'], ['auditoria', 'Auditorías'], ['usuario', 'Usuarios'], ['sede', 'Sedes'], ['sistema', 'Sistema']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <select className="entrada" value={f.accion} onChange={set('accion')}>
          <option value="">Toda acción</option>{ACCIONES.map((a) => <option key={a}>{a}</option>)}
        </select>
        <input type="date" className="entrada" value={f.desde} onChange={set('desde')} aria-label="Desde" />
        <input type="date" className="entrada" value={f.hasta} onChange={set('hasta')} aria-label="Hasta" />
      </div>
      <div className="tarjeta divide-y divide-slate-100">
        {datos.registros.map((r) => (
          <div key={r.id} className="flex gap-4 px-6 py-4">
            <Avatar nombre={r.usuario_nombre || r.usuario_correo || 'Sistema'} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 text-xs">
                <span className={`font-mono font-semibold ${colorAccion(r.accion)}`}>{r.accion}</span>
                <span className="text-slate-400">{r.entidad}{r.entidad_id ? ` #${r.entidad_id}` : ''}</span>
                {r.sede_nombre && <span className="text-slate-400">· {r.sede_nombre}</span>}
              </div>
              <div className="mt-0.5 text-[15px] text-slate-800">{describir(r)}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-semibold text-slate-800">{fechaHora(r.fecha)}</div>
              <div className="text-xs text-slate-500">{r.usuario_nombre || r.usuario_correo || 'Sistema'}</div>
              <div className="font-mono text-[11px] text-slate-400" title={`anterior: ${r.hash_anterior}\nactual: ${r.hash}`}>#{r.secuencia} · {r.hash.slice(0, 9)}…</div>
            </div>
          </div>
        ))}
        {!datos.registros.length && <div className="p-10 text-center text-sm text-slate-400">Sin registros con estos filtros.</div>}
      </div>
      <div className="flex items-center justify-end gap-2 text-sm text-slate-500">
        {datos.total} registros · página {pagina} de {paginas}
        <button className="btn-secundario px-2 py-1.5" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} aria-label="Anterior"><ChevronLeft size={16} /></button>
        <button className="btn-secundario px-2 py-1.5" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)} aria-label="Siguiente"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
