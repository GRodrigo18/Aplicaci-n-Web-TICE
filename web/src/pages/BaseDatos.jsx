import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Database, Lock, Table2 } from 'lucide-react';
import { api, qs } from '../api.js';
import { Aviso, Vacio } from '../components/ui.jsx';

// Visor de solo lectura de las tablas de PostgreSQL (Director de TI)
function celda(v) {
  if (v === null || v === undefined) return <span className="text-slate-300">null</span>;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return <span className="font-mono text-[11px] text-slate-500">{JSON.stringify(v)}</span>;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return new Date(s).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'medium' });
  return s;
}

export default function BaseDatos() {
  const [resumen, setResumen] = useState(null);
  const [tabla, setTabla] = useState('');
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { api.get('/basedatos').then((r) => { setResumen(r); setTabla((t) => t || 'equipos'); }).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!tabla) return;
    setDatos(null);
    api.get(`/basedatos/${tabla}${qs({ pagina })}`).then(setDatos).catch((e) => setError(e.message));
  }, [tabla, pagina]);

  if (error) return <Aviso>{error}</Aviso>;
  if (!resumen) return <div className="text-slate-500">Cargando…</div>;
  const paginas = datos ? Math.max(1, Math.ceil(datos.total / datos.por_pagina)) : 1;
  return (
    <div>
      <section className="tarjeta mb-5 flex flex-wrap items-center gap-4 p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-marca-50 text-marca-500"><Database size={22} /></span>
        <div className="min-w-0 flex-1">
          <div className="font-bold text-slate-900">Base de datos PostgreSQL · {resumen.tablas.length} tablas · {resumen.tamano}</div>
          <div className="truncate text-sm text-slate-500">{resumen.version.split(',')[0]}</div>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600"><Lock size={13} />Solo lectura · sin contraseñas</span>
      </section>
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <nav className="tarjeta self-start p-2">
          {resumen.tablas.map((t) => (
            <button key={t.tabla} onClick={() => { setTabla(t.tabla); setPagina(1); }}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${tabla === t.tabla ? 'bg-marca-50 font-semibold text-marca-600' : 'text-slate-600 hover:bg-slate-50'}`}>
              <Table2 size={15} /><span className="flex-1 truncate font-mono">{t.tabla}</span><span className="text-xs text-slate-400">{t.filas}</span>
            </button>
          ))}
        </nav>
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="font-mono text-[15px] font-semibold text-slate-800">{tabla} <span className="font-sans text-sm font-normal text-slate-500">· {datos?.total ?? '…'} registros</span></div>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              página {pagina} de {paginas}
              <button className="btn-secundario px-2 py-1.5" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} aria-label="Anterior"><ChevronLeft size={16} /></button>
              <button className="btn-secundario px-2 py-1.5" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)} aria-label="Siguiente"><ChevronRight size={16} /></button>
            </div>
          </div>
          <div className="tarjeta overflow-x-auto">
            {!datos ? <Vacio>Cargando…</Vacio> : (
              <table className="w-full text-left text-xs">
                <thead><tr>{datos.columnas.map((c) => <th key={c.nombre} className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5 font-semibold text-slate-600" title={c.tipo}>{c.nombre}</th>)}</tr></thead>
                <tbody>{datos.filas.map((f, i) => (
                  <tr key={i} className="hover:bg-slate-50">{datos.columnas.map((c) => (
                    <td key={c.nombre} className="max-w-[280px] truncate whitespace-nowrap border-t border-slate-100 px-3 py-2 text-slate-700">{celda(f[c.nombre])}</td>
                  ))}</tr>
                ))}</tbody>
              </table>
            )}
            {datos && !datos.filas.length && <Vacio>La tabla está vacía</Vacio>}
          </div>
        </div>
      </div>
    </div>
  );
}
