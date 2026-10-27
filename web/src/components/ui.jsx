import { useEffect } from 'react';
import {
  Battery, Box, Laptop, Monitor, Network, Presentation, Printer, Projector, Server, Speaker, Tablet, Tv, Wifi, X,
} from 'lucide-react';

export const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).replace(/ de /g, '-').replace('.', '') : '—');
export const fecha = (v) => (v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/ de /g, ' ') : '—');

// "hace 5 min", "hace 3 h", "hace 21 días"
export function hace(v) {
  if (!v) return 'nunca';
  const m = (Date.now() - new Date(v).getTime()) / 60000;
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${Math.round(m)} min`;
  if (m < 60 * 24) return `hace ${Math.round(m / 60)} h`;
  const d = Math.round(m / 1440);
  return `hace ${d} día${d === 1 ? '' : 's'}`;
}

// Niveles de escalamiento de ITIL 4 (igual que api/src/lib/escalamiento.js)
export const NIVELES = { 1: 'N1 · TICE de la sede', 2: 'N2 · Coordinación TICE / Director de TI', 3: 'N3 · Proveedor externo' };
export const NOMBRE_PRIORIDAD = { CRITICA: 'Crítica', ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' };
export const COLOR_PRIORIDAD = { CRITICA: '#ef4444', ALTA: '#f59e0b', MEDIA: '#3b82f6', BAJA: '#94a3b8' };

export function minutosATexto(m) {
  if (m === null || m === undefined) return '—';
  const v = Math.abs(m);
  if (v < 60) return `${Math.round(v)} min`;
  if (v < 60 * 24) {
    const h = Math.floor(v / 60);
    const r = Math.round(v % 60);
    return r ? `${h} h ${r} min` : `${h} h`;
  }
  const d = Math.floor(v / 1440);
  const h = Math.round((v % 1440) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}

const COLORES = {
  CRITICA: 'bg-red-50 text-red-700 ring-red-200',
  ALTA: 'bg-amber-50 text-amber-700 ring-amber-200',
  MEDIA: 'bg-blue-50 text-blue-700 ring-blue-200',
  BAJA: 'bg-slate-100 text-slate-600 ring-slate-200',
  OPERATIVO: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  MANTENIMIENTO: 'bg-amber-50 text-amber-700 ring-amber-200',
  AVERIADO: 'bg-red-50 text-red-700 ring-red-200',
  BAJA_EQUIPO: 'bg-slate-100 text-slate-500 ring-slate-200',
  PENDIENTE: 'bg-amber-50 text-amber-700 ring-amber-200',
  EN_PROCESO: 'bg-blue-50 text-blue-700 ring-blue-200',
  EN_CURSO: 'bg-blue-50 text-blue-700 ring-blue-200',
  RESUELTO: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  FINALIZADA: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CERRADO: 'bg-slate-100 text-slate-600 ring-slate-200',
  ENCONTRADO: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  REUBICADO: 'bg-amber-50 text-amber-700 ring-amber-200',
  POR_ATENDER: 'bg-blue-50 text-blue-700 ring-blue-200',
  CONVERTIDO: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  DESCARTADO: 'bg-slate-100 text-slate-600 ring-slate-200',
};
const PUNTO = {
  OPERATIVO: 'bg-emerald-500', MANTENIMIENTO: 'bg-amber-500', AVERIADO: 'bg-red-500', BAJA_EQUIPO: 'bg-slate-400',
  EN_CURSO: 'bg-blue-500', FINALIZADA: 'bg-emerald-500', PENDIENTE: 'bg-amber-500', EN_PROCESO: 'bg-blue-500', RESUELTO: 'bg-emerald-500',
};

// Pastilla de estado o prioridad. Para un equipo dado de baja use valor="BAJA_EQUIPO".
export function Insignia({ valor, texto, punto = true }) {
  const cls = COLORES[valor] || 'bg-slate-100 text-slate-600 ring-slate-200';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}>
      {punto && PUNTO[valor] && <span className={`h-1.5 w-1.5 rounded-full ${PUNTO[valor]}`} />}
      {texto || valor}
    </span>
  );
}
export const insigniaEquipo = (e) => <Insignia valor={e.estado === 'BAJA' ? 'BAJA_EQUIPO' : e.estado} texto={e.estado_nombre} />;

function useEscape(onCerrar) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);
}

export function Modal({ titulo, onCerrar, children, ancho = 'max-w-lg' }) {
  useEscape(onCerrar);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 backdrop-blur-sm sm:p-8" onMouseDown={onCerrar}>
      <div className={`tarjeta w-full ${ancho}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-bold text-slate-800">{titulo}</h2>
          <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={onCerrar} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// Panel lateral derecho (ficha del equipo, detalle del ticket)
export function Panel({ onCerrar, children, ancho = 'max-w-2xl' }) {
  useEscape(onCerrar);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30 backdrop-blur-sm" onMouseDown={onCerrar}>
      <aside className={`relative h-full w-full ${ancho} overflow-y-auto bg-white shadow-2xl`} onMouseDown={(e) => e.stopPropagation()}>
        <button className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={onCerrar} aria-label="Cerrar"><X size={20} /></button>
        {children}
      </aside>
    </div>
  );
}

export function Campo({ etiqueta, children, ayuda }) {
  return (
    <label className="block">
      <span className="etiqueta">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1.5 block text-xs text-slate-500">{ayuda}</span>}
    </label>
  );
}

export function Aviso({ tipo = 'error', children }) {
  if (!children) return null;
  const cls = { error: 'bg-red-50 text-red-700 ring-red-200', ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200', info: 'bg-blue-50 text-blue-700 ring-blue-200' }[tipo];
  return <div className={`rounded-xl px-4 py-2.5 text-sm ring-1 ring-inset ${cls}`}>{children}</div>;
}

// Texto de apoyo de la página (el título va en la barra superior) y sus acciones
export function Encabezado({ subtitulo, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-3xl text-[15px] text-slate-500">{subtitulo}</p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Vacio({ children, className = '' }) {
  return <div className={`px-4 py-10 text-center text-sm text-slate-400 ${className}`}>{children}</div>;
}

// Confirmación para acciones críticas (RNF-03)
export function Confirmar({ titulo, mensaje, textoBoton = 'Confirmar', peligro, onConfirmar, onCancelar, ocupado }) {
  return (
    <Modal titulo={titulo} onCerrar={onCancelar} ancho="max-w-md">
      <p className="text-sm text-slate-600">{mensaje}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secundario" onClick={onCancelar}>Cancelar</button>
        <button className={peligro ? 'btn-peligro' : 'btn-primario'} onClick={onConfirmar} disabled={ocupado}>{textoBoton}</button>
      </div>
    </Modal>
  );
}

export function SelectorSede({ valor, onChange, sedes, todas = true, className = 'entrada' }) {
  return (
    <select className={className} value={valor} onChange={(e) => onChange(e.target.value)}>
      {todas && <option value="">Todas las sedes</option>}
      {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
    </select>
  );
}

// Control segmentado (pestañas, impacto, urgencia)
export function Segmentado({ opciones, valor, onChange, className = '' }) {
  return (
    <div className={`inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 ${className}`}>
      {opciones.map(([v, t, Icono]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`flex flex-1 items-center whitespace-nowrap justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${valor === v ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800'}`}>
          {Icono && <Icono size={16} />}{t}
        </button>
      ))}
    </div>
  );
}

const DEGRADADOS = ['from-fuchsia-500 to-pink-600', 'from-blue-500 to-indigo-600', 'from-lime-500 to-emerald-600', 'from-amber-500 to-orange-600', 'from-cyan-500 to-sky-600', 'from-violet-500 to-purple-600'];
export const iniciales = (nombre = '') => nombre.replace(/^(Prof\.|Dr\.|Lic\.)\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '·';
export function Avatar({ nombre, tamano = 'h-9 w-9 text-xs' }) {
  const i = [...(nombre || '')].reduce((s, c) => s + c.charCodeAt(0), 0) % DEGRADADOS.length;
  const color = /rodrigo/i.test(nombre || '') ? 'from-fuchsia-500 to-pink-600' : DEGRADADOS[i];
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white ${color} ${tamano}`}>{iniciales(nombre)}</span>;
}

// Ícono de cada tipo de equipo
const ICONOS_TIPO = {
  'Access point': Wifi, 'Computadora de escritorio': Server, 'PC de escritorio': Server, 'PC All in One': Monitor, Impresora: Printer,
  Laptop, Monitor, 'Pizarra digital': Presentation, 'Pizarra interactiva': Presentation, Proyector: Projector, 'Switch de red': Network,
  Switch: Network, Tablet, UPS: Battery, Televisor: Tv, 'Equipo de sonido': Speaker,
};
export function IconoTipo({ tipo, size = 16, className = '' }) {
  const Icono = ICONOS_TIPO[tipo] || Box;
  return <Icono size={size} className={className} />;
}

// Anillo de progreso (auditorías, estado de los equipos)
export function Anillo({ valor, tamano = 96, grosor = 9, color = '#6366f1', children }) {
  const r = (tamano - grosor) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} className="-rotate-90">
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" stroke="currentColor" strokeWidth={grosor} className="text-slate-100" />
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round"
          strokeDasharray={`${(Math.max(0, Math.min(100, valor)) / 100) * c} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
