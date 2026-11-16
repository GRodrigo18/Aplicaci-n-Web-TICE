import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { onServicioCaido } from '../api.js';
import { Logo } from './Logo.jsx';

// Consulta /api/salud/bd cada 10 s mientras "activo" y avisa cuando el sistema terminó de arrancar y su base responde
function useEsperarServicio(activo, alVolver) {
  useEffect(() => {
    if (!activo) return undefined;
    let vivo = true;
    let t;
    const revisar = async () => {
      const ok = await fetch('/api/salud/bd', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null)).then((b) => b?.listo === true).catch(() => false);
      if (!vivo) return;
      if (ok) alVolver();
      else t = setTimeout(revisar, 10000);
    };
    t = setTimeout(revisar, 5000);
    return () => { vivo = false; clearTimeout(t); };
  }, [activo, alVolver]);
}

const recargar = () => window.location.reload();

// Pantalla completa cuando no se pudo abrir la sesión porque el servidor no respondió (no se cierra la sesión)
export function SinConexion({ mensaje }) {
  useEsperarServicio(true, recargar);
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex justify-center"><Logo /></div>
        <h1 className="mt-5 text-lg font-bold text-slate-900 dark:text-slate-100">El sistema no responde en este momento</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Puede estar despertando (tarda hasta un minuto) o en mantenimiento. Sus datos están a salvo y su sesión sigue abierta.
          Esta página se recargará sola cuando el sistema vuelva.
        </p>
        {mensaje && <p className="mt-3 text-xs text-slate-400">{mensaje}</p>}
        <div className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500">
          <RefreshCw size={15} className="animate-spin" /> Reintentando…
        </div>
        <button className="btn-primario mt-5" onClick={recargar}>Reintentar ahora</button>
        <p className="mt-5 text-xs text-slate-400">Si pasan más de 10 minutos, avise al TICE de su sede o al Jefe de TI.</p>
      </div>
    </div>
  );
}

// Aviso fijo arriba cuando una solicitud no llegó al servidor; se quita solo al volver la conexión
export function AvisoConexion() {
  const [caido, setCaido] = useState(false);
  useEffect(() => { onServicioCaido(() => setCaido(true)); }, []);
  const ocultar = useCallback(() => setCaido(false), []);
  useEsperarServicio(caido, ocultar);
  if (!caido) return null;
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow">
      <CloudOff size={16} /> Se perdió la conexión con el sistema. Reintentando… Lo que ya guardó no se pierde.
    </div>
  );
}
