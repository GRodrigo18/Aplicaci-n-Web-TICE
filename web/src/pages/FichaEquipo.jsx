import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Aviso, Insignia, fecha, fechaHora } from '../components/ui.jsx';
import { EtiquetaEquipo, ImagenQr } from '../components/Etiqueta.jsx';
import { FormBaja, FormEquipo } from './Inventario.jsx';

export function Historial({ registros }) {
  if (!registros?.length) return <p className="text-sm text-slate-500">Sin registros.</p>;
  return (
    <ol className="space-y-2">
      {registros.map((h, i) => (
        <li key={i} className="border-l-2 border-slate-200 pl-3 text-sm">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium text-slate-700">{h.accion.replace(/_/g, ' ').toLowerCase()}</span>
            <span className="text-xs text-slate-400">{fechaHora(h.fecha)} · {h.usuario_correo || 'sistema'}</span>
          </div>
          {h.detalle?.cambios && Object.entries(h.detalle.cambios).map(([k, v]) => (
            <div key={k} className="text-xs text-slate-500">{k}: <s>{String(v.antes ?? '—')}</s> → {String(v.despues ?? '—')}</div>
          ))}
          {h.detalle?.motivo && <div className="text-xs text-slate-500">Motivo: {h.detalle.motivo}</div>}
        </li>
      ))}
    </ol>
  );
}

export default function FichaEquipo() {
  const { id } = useParams();
  const [e, setE] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const cargar = useCallback(() => api.get(`/equipos/${id}`).then(setE).catch((x) => setError(x.message)), [id]);
  useEffect(() => { cargar(); }, [cargar]);
  if (error) return <Aviso>{error}</Aviso>;
  if (!e) return <div className="text-slate-500">Cargando…</div>;

  const datos = [
    ['Tipo', e.tipo], ['Marca', e.marca], ['Modelo', e.modelo], ['Serie', e.serie], ['Sede', e.sede_nombre],
    ['Ubicación', e.ubicacion], ['Adquisición', fecha(e.fecha_adquisicion)], ['Última verificación', fechaHora(e.ultima_verificacion)],
  ];
  return (
    <div>
      <Link to="/inventario" className="text-sm text-marca-600 hover:underline">← Inventario</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-semibold text-slate-800">{e.codigo}</h1>
        <Insignia valor={e.estado} texto={e.estado_nombre} />
        {e.estado !== 'BAJA' && (
          <div className="ml-auto flex gap-2">
            <button className="btn-secundario" onClick={() => setModal('editar')}>Editar</button>
            <button className="btn-secundario text-red-600" onClick={() => setModal('baja')}>Dar de baja</button>
          </div>
        )}
      </div>
      {e.estado === 'BAJA' && <div className="mt-3"><Aviso tipo="info">Dado de baja el {fechaHora(e.fecha_baja)}. Motivo: {e.motivo_baja}</Aviso></div>}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="tarjeta p-4 lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            {datos.map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="font-medium text-slate-800">{v || '—'}</dd></div>)}
          </dl>
          {e.observaciones && <p className="mt-3 text-sm text-slate-600">{e.observaciones}</p>}
          <h2 className="mb-2 mt-6 font-semibold text-slate-700">Tickets del equipo</h2>
          {e.tickets.length ? (
            <table className="tabla">
              <thead><tr><th>Ticket</th><th>Asunto</th><th>Prioridad</th><th>Estado</th><th>Registro</th></tr></thead>
              <tbody>{e.tickets.map((t) => (
                <tr key={t.id}><td className="font-mono">{t.numero}</td><td>{t.asunto}</td><td><Insignia valor={t.prioridad} /></td><td><Insignia valor={t.estado} /></td><td>{fechaHora(t.fecha_registro)}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="text-sm text-slate-500">Sin incidencias registradas.</p>}
          <h2 className="mb-2 mt-6 font-semibold text-slate-700">Historial (bitácora)</h2>
          <Historial registros={e.historial} />
        </div>
        <div className="tarjeta flex flex-col items-center gap-3 p-4">
          <ImagenQr token={e.qr_token} tamano={180} />
          <div className="text-center text-xs text-slate-500">Etiqueta QR única del equipo</div>
          <div className="w-full"><EtiquetaEquipo equipo={e} /></div>
          <button className="btn-secundario w-full" onClick={() => {
            try { sessionStorage.setItem('tice_etiquetas', JSON.stringify([e])); } catch { /* */ }
            window.open('/etiquetas', '_blank');
          }}>🏷️ Imprimir etiqueta</button>
        </div>
      </div>
      {modal === 'editar' && <FormEquipo equipo={e} onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); cargar(); }} />}
      {modal === 'baja' && <FormBaja equipo={e} onCerrar={() => setModal(null)} onGuardado={() => { setModal(null); cargar(); }} />}
    </div>
  );
}
