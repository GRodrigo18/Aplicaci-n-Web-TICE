import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { useSesion } from '../sesion.jsx';
import { Aviso, Encabezado, fechaHora } from '../components/ui.jsx';

export default function Bitacora() {
  const { sedeParam } = useSesion();
  const [f, setF] = useState({ entidad: '', accion: '', usuario: '', desde: '', hasta: '' });
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState({ registros: [], total: 0, limite: 100 });
  const [verif, setVerif] = useState(null);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPagina(1); };
  const cargar = useCallback(() => api.get(`/bitacora${qs({ ...f, sede_id: sedeParam, pagina })}`).then(setDatos), [f, sedeParam, pagina]);
  useEffect(() => { cargar(); }, [cargar]);
  const paginas = Math.max(1, Math.ceil(datos.total / datos.limite));

  return (
    <div>
      <Encabezado titulo="Bitácora de auditoría" subtitulo="Registro inmutable: cada registro guarda el hash SHA-256 del anterior">
        <button className="btn-primario" onClick={() => api.get('/bitacora/verificar').then(setVerif)}>Verificar integridad</button>
      </Encabezado>
      {verif && (
        <div className="mb-4 space-y-2">
          <Aviso tipo={verif.integra ? 'ok' : 'error'}>
            {verif.integra ? `Cadena íntegra: ${verif.registros} registros verificados.` : `Se detectaron ${verif.registros_alterados.length} registro(s) alterado(s) (secuencia ${verif.registros_alterados.map((r) => r.secuencia).join(', ')}).`}
          </Aviso>
          <Aviso tipo={verif.completa ? 'ok' : 'error'}>
            {verif.completa ? `Las ${verif.operaciones_contadas} operaciones sobre equipos e incidencias tienen su registro en la bitácora.` : `${verif.operaciones_sin_bitacora.length} operación(es) sin registro en la bitácora (hechas por fuera del sistema).`}
          </Aviso>
        </div>
      )}
      <div className="tarjeta mb-4 grid gap-2 p-3 sm:grid-cols-5">
        <select className="entrada" value={f.entidad} onChange={set('entidad')}>
          <option value="">Todas las entidades</option>
          {['equipo', 'incidencia', 'correo', 'usuario', 'sede', 'auditoria', 'sistema'].map((x) => <option key={x}>{x}</option>)}
        </select>
        <input className="entrada" placeholder="Acción (p. ej. BAJA)" value={f.accion} onChange={set('accion')} />
        <input className="entrada" placeholder="Usuario" value={f.usuario} onChange={set('usuario')} />
        <input type="date" className="entrada" value={f.desde} onChange={set('desde')} />
        <input type="date" className="entrada" value={f.hasta} onChange={set('hasta')} />
      </div>
      <div className="tarjeta overflow-x-auto">
        <table className="tabla">
          <thead><tr><th>#</th><th>Fecha</th><th>Usuario</th><th>Sede</th><th>Entidad</th><th>Acción</th><th>Detalle</th><th>Hash</th></tr></thead>
          <tbody>{datos.registros.map((r) => (
            <tr key={r.id}>
              <td className="text-xs text-slate-500">{r.secuencia}</td>
              <td className="whitespace-nowrap text-xs">{fechaHora(r.fecha)}</td>
              <td className="text-xs">{r.usuario_correo || 'sistema'}</td>
              <td className="text-xs">{r.sede_nombre || '—'}</td>
              <td className="text-xs">{r.entidad} {r.entidad_id ? `#${r.entidad_id}` : ''}</td>
              <td className="text-xs font-medium">{r.accion}</td>
              <td className="max-w-xs truncate font-mono text-[11px] text-slate-500" title={JSON.stringify(r.detalle)}>{JSON.stringify(r.detalle)}</td>
              <td className="font-mono text-[11px] text-slate-400" title={`anterior: ${r.hash_anterior}\nactual: ${r.hash}`}>{r.hash.slice(0, 10)}…</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-end gap-2 text-sm">
        <span className="text-slate-500">{datos.total} registros · página {pagina} de {paginas}</span>
        <button className="btn-secundario" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>Anterior</button>
        <button className="btn-secundario" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>Siguiente</button>
      </div>
    </div>
  );
}
