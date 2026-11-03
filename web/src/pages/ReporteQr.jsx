import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, LogIn, Mail, MapPin } from 'lucide-react';
import { api } from '../api.js';
import { Aviso, IconoTipo } from '../components/ui.jsx';
import { Logo } from '../components/Logo.jsx';
import Login, { BotonGoogle } from './Login.jsx';

const CUANDO = [['AHORA', 'Ahora, estoy en clase'], ['HOY', 'Hoy, antes de mi próxima clase'], ['PUEDE_ESPERAR', 'Puede esperar']];
const A_QUIEN = [['TODOS', 'A toda la clase o el ambiente'], ['VARIOS', 'A algunas personas'], ['SOLO_YO', 'Solo a mí']];

function Opciones({ titulo, opciones, valor, onChange }) {
  return (
    <fieldset className="mt-5">
      <legend className="etiqueta">{titulo}</legend>
      <div className="grid gap-2">
        {opciones.map(([v, t]) => (
          <button key={v} type="button" onClick={() => onChange(v)}
            className={`rounded-xl border px-4 py-3 text-left text-[15px] transition ${valor === v ? 'border-marca-500 bg-marca-50 font-semibold text-marca-700' : 'border-slate-200 bg-white text-slate-700'}`}>{t}</button>
        ))}
      </div>
    </fieldset>
  );
}

// Página que abre la cámara del celular al escanear la etiqueta QR, para quien no tiene sesión iniciada.
// El docente ve qué equipo es, cuenta qué pasa y envía el reporte con su cuenta de Google.
export default function ReporteQr({ token }) {
  const [e, setE] = useState(null);
  const [error, setError] = useState('');
  const [f, setF] = useState({ descripcion: '', cuando: '', a_quien: '' });
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState(null);
  const [personal, setPersonal] = useState(false);
  useEffect(() => { api.get(`/publico/equipos/${token}`).then(setE).catch((x) => setError(x.message)); }, [token]);

  const datos = useRef(f);
  datos.current = f;
  const [enviar] = useState(() => async (credential) => {
    setError('');
    setEnviando(true);
    try { setHecho(await api.post(`/publico/equipos/${token}/reportes`, { ...datos.current, credential })); } catch (x) { setError(x.message); } finally { setEnviando(false); }
  });

  if (personal) return <Login />;
  const listo = f.descripcion.trim().length >= 5 && f.cuando && f.a_quien;
  return (
    <div className="min-h-screen bg-fondo px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="mb-5 flex items-center gap-3"><Logo /><div><div className="font-extrabold text-slate-900">TICE · Avantgard</div><div className="text-xs text-slate-500">Reporte de fallas</div></div></div>
        {!e && !error && <p className="text-slate-500">Buscando el equipo…</p>}
        {!e && error && <Aviso>{error}</Aviso>}
        {e && (
          <>
            <div className="tarjeta p-5">
              <div className="flex items-center gap-2 text-sm text-slate-500"><IconoTipo tipo={e.tipo} />{e.tipo} · {e.sede_nombre}</div>
              <div className="mt-1 font-mono text-2xl font-semibold text-slate-900">{e.codigo}</div>
              <div className="text-slate-500">{e.marca} {e.modelo}</div>
              <div className="mt-2 flex items-center gap-1.5 text-sm text-slate-600"><MapPin size={15} />{e.ubicacion}</div>
            </div>

            {hecho ? (
              <div className="tarjeta mt-4 p-6 text-center">
                <CheckCircle2 className="mx-auto text-emerald-500" size={44} />
                <h1 className="mt-3 text-xl font-bold text-slate-900">{hecho.repetido ? 'Ya tienes un reporte abierto' : '¡Reporte enviado!'}</h1>
                <p className="mt-2 text-slate-600">Tu número de ticket es <b className="font-mono">{hecho.numero}</b>.</p>
                <p className="mt-2 text-sm text-slate-500">
                  {hecho.repetido ? 'El área TICE ya está atendiendo tu reporte de este equipo.' : `Te llegará un correo a ${hecho.correo} con el número y cada avance. Si quieres agregar algo, responde ese correo.`}
                </p>
              </div>
            ) : e.estado === 'BAJA' ? (
              <div className="mt-4"><Aviso tipo="info">Este equipo está dado de baja. Si lo necesitas, escribe a {e.buzon}.</Aviso></div>
            ) : (
              <div className="tarjeta mt-4 p-5">
                <h1 className="text-xl font-bold text-slate-900">Reportar una falla de este equipo</h1>
                {e.reportes_abiertos > 0 && <div className="mt-3"><Aviso tipo="info">Este equipo ya tiene {e.reportes_abiertos} reporte(s) en atención. Si es otro problema, cuéntalo igual.</Aviso></div>}
                <label className="mt-4 block">
                  <span className="etiqueta">¿Qué pasa?</span>
                  <textarea className="entrada" rows={3} value={f.descripcion} onChange={(x) => setF({ ...f, descripcion: x.target.value })}
                    placeholder="Ej.: no enciende, no proyecta, no hay internet, no imprime…" />
                </label>
                <Opciones titulo="¿Cuándo lo necesitas?" opciones={CUANDO} valor={f.cuando} onChange={(v) => setF({ ...f, cuando: v })} />
                <Opciones titulo="¿A quiénes afecta?" opciones={A_QUIEN} valor={f.a_quien} onChange={(v) => setF({ ...f, a_quien: v })} />
                <div className="mt-6">
                  {!e.google_client_id ? (
                    <a className="btn-primario w-full py-3" href={`mailto:${e.buzon}?subject=${encodeURIComponent(`Falla en ${e.codigo} (${e.ubicacion})`)}&body=${encodeURIComponent(f.descripcion)}`}>
                      <Mail size={18} />Enviar por correo al área TICE
                    </a>
                  ) : listo ? (
                    <>
                      <p className="mb-3 text-center text-sm text-slate-500">{e.dominios?.length ? <>Envía el reporte con tu cuenta @{e.dominios[0]}:</> : 'Envía el reporte con tu cuenta de Google:'}</p>
                      <BotonGoogle clientId={e.google_client_id} onCredencial={enviar} texto="continue_with" />
                      {enviando && <p className="mt-3 text-center text-sm text-slate-500">Enviando…</p>}
                    </>
                  ) : <p className="text-center text-sm text-slate-400">Completa las tres preguntas para enviar el reporte.</p>}
                  <div className="mt-3"><Aviso>{error}</Aviso></div>
                </div>
              </div>
            )}
            <button className="mx-auto mt-6 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700" onClick={() => setPersonal(true)}>
              <LogIn size={15} />¿Eres del área TICE? Inicia sesión
            </button>
          </>
        )}
      </div>
    </div>
  );
}
