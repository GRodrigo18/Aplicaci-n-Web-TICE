import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Database, Download, FlaskConical, Lock, Play, Table2, Terminal } from 'lucide-react';
import { api, descargar, qs } from '../api.js';
import { useSesion } from '../sesion.jsx';
import { Aviso, Campo, Modal, Segmentado, Vacio } from '../components/ui.jsx';

// Visor de solo lectura de las tablas de PostgreSQL (Director de TI)
function celda(v) {
  if (v === null || v === undefined) return <span className="text-slate-300">null</span>;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return <span className="font-mono text-[11px] text-slate-500">{JSON.stringify(v)}</span>;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return new Date(s).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'medium' });
  return s;
}

const EJEMPLOS = [
  ['Equipos por estado', 'SELECT estado, count(*) AS equipos\nFROM equipos\nGROUP BY estado\nORDER BY equipos DESC;'],
  ['Últimos equipos registrados', 'SELECT codigo, marca, modelo, ubicacion, creado_en\nFROM equipos\nORDER BY creado_en DESC\nLIMIT 20;'],
  ['Últimas operaciones (bitácora)', 'SELECT secuencia, fecha, usuario_correo, entidad, accion\nFROM logs_auditoria\nORDER BY secuencia DESC\nLIMIT 20;'],
  ['Tickets abiertos', "SELECT numero, asunto, prioridad, estado, fecha_registro\nFROM incidencias\nWHERE estado IN ('PENDIENTE', 'EN_PROCESO')\nORDER BY fecha_registro;"],
];

// Consulta SQL de solo lectura contra PostgreSQL (la API la ejecuta en una transacción READ ONLY)
function ConsultaSql() {
  const [sql, setSql] = useState(EJEMPLOS[0][1]);
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const ejecutar = async () => {
    setError('');
    setOcupado(true);
    try { setR(await api.post('/basedatos/consulta', { sql })); } catch (e) { setError(e.message); setR(null); } finally { setOcupado(false); }
  };
  return (
    <div className="space-y-4">
      <div className="tarjeta p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {EJEMPLOS.map(([t, q]) => <button key={t} className="chip" onClick={() => setSql(q)}>{t}</button>)}
        </div>
        <textarea className="entrada min-h-[140px] font-mono text-sm" spellCheck={false} value={sql} onChange={(e) => setSql(e.target.value)}
          onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') ejecutar(); }} />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button className="btn-primario" onClick={ejecutar} disabled={ocupado || !sql.trim()}><Play size={16} />Ejecutar</button>
          <span className="text-xs text-slate-500">Ctrl + Enter · Solo lectura: INSERT, UPDATE y DELETE se rechazan · máximo 500 filas y 5 s</span>
        </div>
      </div>
      <Aviso>{error}</Aviso>
      {r && (
        <div>
          <div className="mb-2 text-sm text-slate-500">{r.filas.length} fila{r.filas.length === 1 ? '' : 's'}{r.truncado ? ' (se muestran las primeras 500)' : ''} · {r.ms} ms</div>
          <div className="tarjeta max-h-[60vh] overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-white"><tr>{r.columnas.map((c, i) => <th key={i} className="whitespace-nowrap border-b border-slate-100 px-3 py-2.5 font-semibold text-slate-600">{c}</th>)}</tr></thead>
              <tbody>{r.filas.map((f, i) => (
                <tr key={i} className="hover:bg-slate-50">{f.map((v, j) => <td key={j} className="max-w-[280px] truncate whitespace-nowrap border-t border-slate-100 px-3 py-2 text-slate-700">{celda(v)}</td>)}</tr>
              ))}</tbody>
            </table>
            {!r.filas.length && <Vacio>La consulta no devolvió filas</Vacio>}
          </div>
        </div>
      )}
    </div>
  );
}

// Borra la demostración y deja la sede, el Jefe de TI y el TICE reales (solo mientras la base tiene la demo)
function PasarADatosReales({ onCerrar }) {
  const { cerrar } = useSesion();
  const [f, setF] = useState({ sede_codigo: 'CEN', sede_nombre: 'Sede Central', correo_buzon: '', director_nombre: '', director_correo: '', tice_nombre: '', tice_correo: '', password: '', confirmacion: '' });
  const [error, setError] = useState('');
  const [hecho, setHecho] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setOcupado(true);
    try {
      setHecho(await api.post('/basedatos/datos-reales', {
        sede: { codigo: f.sede_codigo, nombre: f.sede_nombre, correo_buzon: f.correo_buzon },
        director: { nombre: f.director_nombre, correo: f.director_correo },
        tice: { nombre: f.tice_nombre, correo: f.tice_correo },
        password: f.password, confirmacion: f.confirmacion,
      }));
    } catch (x) { setError(x.message); } finally { setOcupado(false); }
  };
  if (hecho) {
    return (
      <Modal titulo="Base lista con datos reales" onCerrar={cerrar}>
        <Aviso tipo="ok">Se borró la demostración. Quedaron la {hecho.sede}, el Jefe de TI ({hecho.director}) y el TICE ({hecho.tice}).</Aviso>
        <p className="mt-3 text-sm text-slate-600">Tu sesión de demostración ya no existe. Ingresa como TICE e importa el Excel del inventario desde <b>Inventario → Importar Excel</b>.</p>
        <div className="mt-5 flex justify-end"><button className="btn-primario" onClick={cerrar}>Ir al inicio de sesión</button></div>
      </Modal>
    );
  }
  return (
    <Modal titulo="Pasar a datos reales" onCerrar={onCerrar} ancho="max-w-2xl">
      <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Aviso tipo="info">Se borran todos los datos de demostración (equipos, tickets, correos, auditorías, usuarios y bitácora) y se crean la sede y las dos cuentas reales. No se puede deshacer.</Aviso></div>
        <Campo etiqueta="Código de la sede *"><input className="entrada font-mono uppercase" value={f.sede_codigo} onChange={set('sede_codigo')} required /></Campo>
        <Campo etiqueta="Nombre de la sede *"><input className="entrada" value={f.sede_nombre} onChange={set('sede_nombre')} required /></Campo>
        <div className="sm:col-span-2"><Campo etiqueta="Buzón TICE de la sede *"><input type="email" className="entrada" value={f.correo_buzon} onChange={set('correo_buzon')} placeholder="tice.central@…" required /></Campo></div>
        <Campo etiqueta="Jefe de TI: nombre *"><input className="entrada" value={f.director_nombre} onChange={set('director_nombre')} required /></Campo>
        <Campo etiqueta="Jefe de TI: correo *"><input type="email" className="entrada" value={f.director_correo} onChange={set('director_correo')} required /></Campo>
        <Campo etiqueta="TICE de la sede: nombre *"><input className="entrada" value={f.tice_nombre} onChange={set('tice_nombre')} required /></Campo>
        <Campo etiqueta="TICE de la sede: correo *"><input type="email" className="entrada" value={f.tice_correo} onChange={set('tice_correo')} required /></Campo>
        <Campo etiqueta="Contraseña inicial de ambos (mín. 8) *"><input type="password" className="entrada" value={f.password} onChange={set('password')} minLength={8} required autoComplete="new-password" /></Campo>
        <Campo etiqueta="Escribe BORRAR DEMO para confirmar *"><input className="entrada font-mono" value={f.confirmacion} onChange={set('confirmacion')} required /></Campo>
        <div className="sm:col-span-2"><Aviso>{error}</Aviso></div>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-secundario" onClick={onCerrar}>Cancelar</button>
          <button className="btn-peligro" disabled={ocupado || f.confirmacion !== 'BORRAR DEMO'}>{ocupado ? 'Preparando…' : 'Borrar demo y crear cuentas'}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function BaseDatos() {
  const [vista, setVista] = useState('tablas');
  const [reales, setReales] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [tabla, setTabla] = useState('');
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [respaldo, setRespaldo] = useState('');

  const descargarRespaldo = async () => {
    setRespaldo('Generando…');
    try {
      await descargar('/basedatos/respaldo', `respaldo_tice_${new Date().toISOString().slice(0, 10)}.sql`);
      setRespaldo('');
    } catch (e) { setRespaldo(e.message); }
  };

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
        <button className="btn-secundario" onClick={descargarRespaldo} disabled={respaldo === 'Generando…'} title="Copia completa en un archivo .sql (pg_dump)">
          <Download size={16} />{respaldo === 'Generando…' ? 'Generando…' : 'Descargar respaldo'}
        </button>
        {respaldo && respaldo !== 'Generando…' && <div className="w-full text-sm text-red-600">{respaldo}</div>}
      </section>
      {resumen.datos_demo && (
        <section className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <FlaskConical size={22} className="text-amber-600" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-amber-900">La base tiene datos de demostración</div>
            <div className="text-sm text-amber-800">Cuando quieras trabajar con la información real, bórrala y crea la sede y las cuentas reales.</div>
          </div>
          <button className="btn-secundario" onClick={() => setReales(true)}>Pasar a datos reales</button>
        </section>
      )}
      {reales && <PasarADatosReales onCerrar={() => setReales(false)} />}
      <Segmentado className="mb-5" valor={vista} onChange={setVista} opciones={[['tablas', 'Tablas', Table2], ['sql', 'Consulta SQL', Terminal]]} />
      {vista === 'sql' ? <ConsultaSql /> : (
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
      )}
    </div>
  );
}
