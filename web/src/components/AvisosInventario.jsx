import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Building2, CalendarClock, Laptop, Wrench } from 'lucide-react';
import { api, qs } from '../api.js';
import { useSesion } from '../sesion.jsx';

// Equipos propios y alquilados, y lo que necesita atención: contratos por vencer, bajas por aprobar
// (las decide el Jefe de TI) y mantenimientos preventivos próximos.
export default function AvisosInventario() {
  const { sedeParam, esDirector } = useSesion();
  const [inv, setInv] = useState(null);
  useEffect(() => { api.get(`/dashboard${qs({ sede_id: sedeParam })}`).then((d) => setInv(d.inventario)).catch(() => {}); }, [sedeParam]);
  if (!inv) return null;
  const items = [
    [Laptop, 'Equipos propios', inv.propios, '/inventario?propiedad=PROPIO', 'text-slate-900'],
    [Building2, 'Equipos alquilados', inv.alquilados, '/inventario?propiedad=ALQUILADO', 'text-marca-600',
      inv.alquilados_sin_proveedor ? `${inv.alquilados_sin_proveedor} sin proveedor registrado` : 'con proveedor registrado'],
    [CalendarClock, 'Contratos por vencer', inv.contratos_por_vencer, '/inventario?por_vencer=true', inv.contratos_por_vencer ? 'text-amber-600' : 'text-slate-900', 'en los próximos 60 días'],
    [Ban, 'Bajas por aprobar', inv.bajas_por_aprobar, '/inventario?baja_pendiente=true', inv.bajas_por_aprobar ? 'text-red-600' : 'text-slate-900',
      esDirector ? 'las decide usted' : 'las decide el Jefe de TI'],
    [Wrench, 'Mantenimientos próximos', inv.mantenimientos_proximos, '/inventario', 'text-slate-900', 'preventivos en 15 días'],
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {items.map(([Icono, t, v, a, c, sub]) => (
        <Link key={t} to={a} className="tarjeta block p-4 transition hover:-translate-y-0.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-500"><Icono size={14} />{t}</div>
          <div className={`mt-1 text-2xl font-extrabold ${c}`}>{v}</div>
          {sub && <div className="text-xs text-slate-500">{sub}</div>}
        </Link>
      ))}
    </div>
  );
}
