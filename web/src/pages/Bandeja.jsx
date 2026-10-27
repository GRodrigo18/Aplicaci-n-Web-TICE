import { useCallback, useEffect, useState } from 'react';
import { api, qs } from '../api.js';
import { useSesion } from '../sesion.jsx';
import { Aviso, Campo, Encabezado, Insignia, Modal, Vacio, fechaHora } from '../components/ui.jsx';
import { FormTicket } from './MesaAyuda.jsx';

function RegistrarCorreo({ onCerrar, onGuardado }) {
  const [f, setF] = useState({ de: '', nombre: '', asunto: '', cuerpo: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal titulo="Registrar correo recibido" onCerrar={onCerrar}>
      <p className="mb-3 text-xs text-slate-500">Use esta opción si el buzón todavía no reenvía los correos automáticamente al sistema.</p>
      <div className="space-y-3">
        <Campo etiqueta="Remitente (correo) *"><input type="email" className="entrada" value={f.de} onChange={set('de')} /></Campo>
        <Campo etiqueta="Nombre del remitente"><input className="entrada" value={f.nombre} onChange={set('nombre')} /></Campo>
        <Campo etiqueta="Asunto *"><input className="entrada" value={f.asunto} onChange={set('asunto')} /></Campo>
        <Campo etiqueta="Cuerpo del correo *"><textarea className="entrada" rows={4} value={f.cuerpo} onChange={set('cuerpo')} /></Campo>
        <Aviso>{error}</Aviso>
        <div className="flex justify-end gap-2">
          <button className="btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn-primario" onClick={async () => { try { onGuardado(await api.post('/correos', f)); } catch (x) { setError(x.message); } }}>Guardar en la bandeja</button>
        </div>
      </div>
    </Modal>
  );
}

function Convertir({ correo, onCerrar, onHecho }) {
  const [p, setP] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get(`/correos/${correo.id}/propuesta`).then((r) => setP(r.propuesta)).catch((e) => setError(e.message)); }, [correo.id]);
  return (
    <Modal titulo="Ticket propuesto desde el correo" onCerrar={onCerrar} ancho="max-w-3xl">
      <div className="mb-3 rounded-md bg-slate-50 p-3 text-sm">
        <div className="text-xs text-slate-500">De: {correo.remitente_nombre} &lt;{correo.remitente}&gt; · {fechaHora(correo.recibido_en)}</div>
        <div className="font-medium">{correo.asunto}</div>
        <p className="mt-1 whitespace-pre-wrap text-slate-700">{correo.cuerpo}</p>
      </div>
      <Aviso>{error}</Aviso>
      {p && (
        <>
          <p className="mb-2 text-xs text-slate-500">El sistema propuso la categoría, el impacto, la urgencia y los equipos a partir del texto. Revíselos antes de registrar.</p>
          <FormTicket sedeId={correo.sede_id} inicial={p} textoBoton="Convertir en ticket" onCancelar={onCerrar}
            onEnviar={async (d) => onHecho(await api.post(`/correos/${correo.id}/convertir`, d))} />
        </>
      )}
    </Modal>
  );
}

function Descartar({ correo, onCerrar, onHecho }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal titulo="Descartar correo" onCerrar={onCerrar}>
      <p className="mb-3 text-sm text-slate-600">"{correo.asunto}" no se convertirá en ticket. Indique el motivo; quedará en la bitácora.</p>
      <Campo etiqueta="Motivo *"><input className="entrada" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: No es una incidencia" /></Campo>
      <div className="mt-3"><Aviso>{error}</Aviso></div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secundario" onClick={onCerrar}>Cancelar</button>
        <button className="btn-peligro" disabled={!motivo.trim()} onClick={async () => { try { onHecho(await api.post(`/correos/${correo.id}/descartar`, { motivo })); } catch (x) { setError(x.message); } }}>Descartar</button>
      </div>
    </Modal>
  );
}

export default function Bandeja() {
  const { sedeParam, esDirector } = useSesion();
  const [estado, setEstado] = useState('POR_ATENDER');
  const [correos, setCorreos] = useState([]);
  const [modal, setModal] = useState(null);
  const [aviso, setAviso] = useState('');
  const cargar = useCallback(() => api.get(`/correos${qs({ sede_id: sedeParam, estado })}`).then(setCorreos), [sedeParam, estado]);
  useEffect(() => { cargar(); const t = setInterval(cargar, 30000); return () => clearInterval(t); }, [cargar]);
  const hecho = (msg) => { setModal(null); setAviso(msg); cargar(); };

  return (
    <div>
      <Encabezado titulo="Bandeja de correos por atender" subtitulo="Correos que los solicitantes envían al buzón TICE de la sede">
        <select className="entrada w-40" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="POR_ATENDER">Por atender</option><option value="CONVERTIDO">Convertidos</option><option value="DESCARTADO">Descartados</option><option value="TODOS">Todos</option>
        </select>
        {!esDirector && <button className="btn-secundario" onClick={() => setModal({ tipo: 'registrar' })}>+ Registrar correo recibido</button>}
      </Encabezado>
      {aviso && <div className="mb-3"><Aviso tipo="ok">{aviso}</Aviso></div>}
      <div className="tarjeta divide-y divide-slate-100">
        {correos.map((c) => (
          <div key={c.id} className="flex flex-wrap items-start gap-3 p-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-800">{c.asunto}</span>
                <Insignia valor={c.estado} texto={{ POR_ATENDER: 'Por atender', CONVERTIDO: `Ticket ${c.ticket_numero || ''}`, DESCARTADO: 'Descartado' }[c.estado]} />
              </div>
              <div className="text-xs text-slate-500">{c.remitente_nombre || c.remitente} &lt;{c.remitente}&gt; · {fechaHora(c.recibido_en)}{esDirector ? ` · ${c.sede_nombre}` : ''}</div>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{c.cuerpo}</p>
              {c.motivo_descarte && <p className="mt-1 text-xs text-slate-500">Motivo del descarte: {c.motivo_descarte}</p>}
            </div>
            {c.estado === 'POR_ATENDER' && (
              <div className="flex gap-2">
                <button className="btn-primario" onClick={() => setModal({ tipo: 'convertir', c })}>Convertir en ticket</button>
                <button className="btn-secundario" onClick={() => setModal({ tipo: 'descartar', c })}>Descartar</button>
              </div>
            )}
          </div>
        ))}
        {!correos.length && <Vacio>No hay correos en esta vista.</Vacio>}
      </div>
      {modal?.tipo === 'registrar' && <RegistrarCorreo onCerrar={() => setModal(null)} onGuardado={() => hecho('Correo guardado en la bandeja')} />}
      {modal?.tipo === 'convertir' && <Convertir correo={modal.c} onCerrar={() => setModal(null)} onHecho={(t) => hecho(`Se creó el ticket ${t.numero} con prioridad ${t.prioridad_nombre}; se envió el acuse al solicitante.`)} />}
      {modal?.tipo === 'descartar' && <Descartar correo={modal.c} onCerrar={() => setModal(null)} onHecho={() => hecho('Correo descartado')} />}
    </div>
  );
}
