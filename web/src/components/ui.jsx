import { useEffect } from 'react';

export const fechaHora = (v) => (v ? new Date(v).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const fecha = (v) => (v ? new Date(v.length === 10 ? `${v}T12:00:00` : v).toLocaleDateString('es-PE') : '—');

// Niveles de escalamiento de ITIL 4 (igual que api/src/lib/escalamiento.js)
export const NIVELES = { 1: 'N1 · TICE de la sede', 2: 'N2 · Coordinación TICE / Director de TI', 3: 'N3 · Proveedor externo' };

export function minutosATexto(m) {
  if (m === null || m === undefined) return '—';
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h} h ${r} min` : `${h} h`;
}

const COLORES = {
  CRITICA: 'bg-red-100 text-red-800 ring-red-200',
  ALTA: 'bg-orange-100 text-orange-800 ring-orange-200',
  MEDIA: 'bg-amber-100 text-amber-800 ring-amber-200',
  BAJA: 'bg-slate-100 text-slate-700 ring-slate-200',
  OPERATIVO: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  MANTENIMIENTO: 'bg-amber-100 text-amber-800 ring-amber-200',
  AVERIADO: 'bg-red-100 text-red-800 ring-red-200',
  PENDIENTE: 'bg-slate-100 text-slate-700 ring-slate-200',
  EN_PROCESO: 'bg-blue-100 text-blue-800 ring-blue-200',
  RESUELTO: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  CERRADO: 'bg-slate-200 text-slate-700 ring-slate-300',
  ENCONTRADO: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  REUBICADO: 'bg-amber-100 text-amber-800 ring-amber-200',
  POR_ATENDER: 'bg-blue-100 text-blue-800 ring-blue-200',
  CONVERTIDO: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  DESCARTADO: 'bg-slate-200 text-slate-700 ring-slate-300',
};

export function Insignia({ valor, texto }) {
  const cls = COLORES[valor] || 'bg-slate-100 text-slate-700 ring-slate-200';
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}>{texto || valor}</span>;
}

export function Modal({ titulo, onCerrar, children, ancho = 'max-w-lg' }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8" onMouseDown={onCerrar}>
      <div className={`tarjeta w-full ${ancho}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-800">{titulo}</h2>
          <button className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" onClick={onCerrar} aria-label="Cerrar">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function Campo({ etiqueta, children, ayuda }) {
  return (
    <label className="block">
      <span className="etiqueta">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-slate-500">{ayuda}</span>}
    </label>
  );
}

export function Aviso({ tipo = 'error', children }) {
  if (!children) return null;
  const cls = { error: 'bg-red-50 text-red-700 ring-red-200', ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200', info: 'bg-blue-50 text-blue-700 ring-blue-200' }[tipo];
  return <div className={`rounded-md px-3 py-2 text-sm ring-1 ring-inset ${cls}`}>{children}</div>;
}

export function Encabezado({ titulo, subtitulo, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold text-slate-800">{titulo}</h1>
        {subtitulo && <p className="text-sm text-slate-500">{subtitulo}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function Vacio({ children }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-500">{children}</div>;
}

// Confirmación para acciones críticas (RNF-03)
export function Confirmar({ titulo, mensaje, textoBoton = 'Confirmar', peligro, onConfirmar, onCancelar, ocupado }) {
  return (
    <Modal titulo={titulo} onCerrar={onCancelar} ancho="max-w-md">
      <p className="text-sm text-slate-600">{mensaje}</p>
      <div className="mt-4 flex justify-end gap-2">
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
