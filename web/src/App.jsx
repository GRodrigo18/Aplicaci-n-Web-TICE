import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  ClipboardCheck, Database, LayoutGrid, LifeBuoy, LogOut, Menu, Moon, Boxes, ScanLine, ScrollText, Search, Sun, Ticket, Users,
} from 'lucide-react';
import { api, qs } from './api.js';
import { useSesion } from './sesion.jsx';
import { Avatar, IconoTipo, Insignia, SelectorSede } from './components/ui.jsx';
import { Logo } from './components/Logo.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inventario from './pages/Inventario.jsx';
import Etiquetas from './pages/Etiquetas.jsx';
import Pistoleo from './pages/Pistoleo.jsx';
import Auditorias from './pages/Auditorias.jsx';
import MesaAyuda from './pages/MesaAyuda.jsx';
import Bitacora from './pages/Bitacora.jsx';
import Administracion from './pages/Administracion.jsx';
import BaseDatos from './pages/BaseDatos.jsx';

const MENU = [
  { a: '/', t: 'Dashboard', i: LayoutGrid },
  { a: '/inventario', t: 'Inventario', i: Boxes },
  { a: '/pistoleo', t: 'Pistoleo QR', i: ScanLine, insignia: 'QR' },
  { a: '/mesa', t: 'Mesa de ayuda', i: LifeBuoy },
  { a: '/auditorias', t: 'Auditorías', i: ClipboardCheck },
  { a: '/bitacora', t: 'Bitácora', i: ScrollText, director: true },
  { a: '/administracion', t: 'Usuarios y sedes', i: Users, director: true },
  { a: '/basedatos', t: 'Base de datos', i: Database, director: true },
];

function useTema() {
  const [oscuro, setOscuro] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', oscuro);
    try { localStorage.setItem('tice_tema', oscuro ? 'oscuro' : 'claro'); } catch { /* sin almacenamiento */ }
  }, [oscuro]);
  return [oscuro, () => setOscuro(!oscuro)];
}

// Búsqueda global (Ctrl K): equipos por código, marca o ubicación y tickets por número o asunto
function Buscador({ onCerrar }) {
  const { sedeParam } = useSesion();
  const [q, setQ] = useState('');
  const [res, setRes] = useState({ equipos: [], tickets: [] });
  const navegar = useNavigate();
  const entrada = useRef(null);
  useEffect(() => { entrada.current?.focus(); }, []);
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);
  useEffect(() => {
    if (q.trim().length < 2) { setRes({ equipos: [], tickets: [] }); return undefined; }
    const t = setTimeout(async () => {
      const [equipos, tickets] = await Promise.all([
        api.get(`/equipos${qs({ q, sede_id: sedeParam })}`).catch(() => []),
        api.get(`/incidencias${qs({ q, sede_id: sedeParam })}`).catch(() => []),
      ]);
      setRes({ equipos: equipos.slice(0, 6), tickets: tickets.slice(0, 6) });
    }, 200);
    return () => clearTimeout(t);
  }, [q, sedeParam]);
  const ir = (ruta) => { onCerrar(); navegar(ruta); };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onCerrar}>
      <div className="tarjeta w-full max-w-xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4">
          <Search size={18} className="text-slate-400" />
          <input ref={entrada} className="w-full bg-transparent py-4 text-[15px] outline-none placeholder:text-slate-400" placeholder="Buscar equipo (código, marca, ubicación) o ticket…"
            value={q} onChange={(e) => setQ(e.target.value)} />
          <kbd className="rounded-md border border-slate-200 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">Esc</kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {q.trim().length < 2 && <p className="px-3 py-6 text-center text-sm text-slate-400">Escribe al menos 2 caracteres</p>}
          {res.equipos.length > 0 && <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Equipos</div>}
          {res.equipos.map((e) => (
            <button key={e.id} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50" onClick={() => ir(`/inventario/${e.id}`)}>
              <span className="icono-tarjeta h-8 w-8"><IconoTipo tipo={e.tipo} /></span>
              <span className="min-w-0 flex-1"><span className="font-mono text-sm font-semibold">{e.codigo}</span>
                <span className="block truncate text-xs text-slate-500">{e.marca} {e.modelo} · {e.ubicacion}</span></span>
            </button>
          ))}
          {res.tickets.length > 0 && <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Tickets</div>}
          {res.tickets.map((t) => (
            <button key={t.id} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50" onClick={() => ir(`/mesa?ticket=${t.id}`)}>
              <span className="icono-tarjeta h-8 w-8"><Ticket size={16} /></span>
              <span className="min-w-0 flex-1"><span className="font-mono text-xs text-slate-500">{t.numero}</span>
                <span className="block truncate text-sm">{t.asunto}</span></span>
              <Insignia valor={t.estado} texto={t.estado_nombre} />
            </button>
          ))}
          {q.trim().length >= 2 && !res.equipos.length && !res.tickets.length && <p className="px-3 py-6 text-center text-sm text-slate-400">Sin resultados</p>}
        </div>
      </div>
    </div>
  );
}

function Layout({ children }) {
  const { usuario, cerrar, esDirector, sedes, sedeSel, setSedeSel } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [buscar, setBuscar] = useState(false);
  const [oscuro, alternarTema] = useTema();
  const { pathname } = useLocation();
  const items = MENU.filter((m) => !m.director || esDirector);
  const actual = [...items].reverse().find((m) => (m.a === '/' ? pathname === '/' : pathname.startsWith(m.a)));

  useEffect(() => {
    const f = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBuscar(true); } };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);

  return (
    <div className="min-h-screen md:flex">
      <aside className={`no-imprimir fixed inset-y-0 left-0 z-30 flex w-72 transform flex-col border-r border-slate-200/80 bg-white transition md:sticky md:top-0 md:h-screen md:translate-x-0 ${abierto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center gap-3 px-6 pb-6 pt-6">
          <Logo />
          <div>
            <div className="text-[17px] font-extrabold leading-tight text-slate-900">TICE·Merced</div>
            <div className="text-xs text-slate-500">Inventario y mesa de ayuda</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-4">
          {items.map((m) => (
            <NavLink key={m.a} to={m.a} end={m.a === '/'} onClick={() => setAbierto(false)}
              className={({ isActive }) => `relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] transition ${isActive
                ? 'bg-marca-50 font-semibold text-marca-600 before:absolute before:-left-4 before:top-2 before:h-7 before:w-1 before:rounded-r before:bg-marca-500'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
              <m.i size={19} strokeWidth={1.8} />{m.t}
              {m.insignia && <span className="ml-auto rounded-full bg-gradient-to-r from-marca-500 to-cyan-500 px-2 py-0.5 text-[10px] font-bold text-white">{m.insignia}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-4">
          <Avatar nombre={usuario.nombre} tamano="h-10 w-10 text-sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-slate-800">{usuario.nombre}</div>
            <div className="truncate text-xs text-slate-500">{esDirector ? 'Director de TI · todas las sedes' : `Usuario TICE · ${usuario.sede_nombre}`}</div>
          </div>
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={alternarTema} title={oscuro ? 'Modo claro' : 'Modo oscuro'} aria-label="Cambiar tema">
            {oscuro ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={cerrar} title="Cerrar sesión" aria-label="Cerrar sesión"><LogOut size={18} /></button>
        </div>
      </aside>
      {abierto && <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setAbierto(false)} />}
      <div className="min-w-0 flex-1">
        <header className="no-imprimir sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200/80 bg-fondo/80 px-4 py-4 backdrop-blur sm:px-8">
          <button className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 md:hidden" onClick={() => setAbierto(true)} aria-label="Menú"><Menu size={20} /></button>
          <h1 className="text-xl font-bold text-slate-900">{actual?.t || 'TICE'}</h1>
          {esDirector && (
            <div className="ml-2 w-48"><SelectorSede valor={sedeSel} onChange={setSedeSel} sedes={sedes} className="entrada py-2" /></div>
          )}
          <button className="ml-auto flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-[15px] text-slate-600 hover:border-slate-300" onClick={() => setBuscar(true)}>
            <Search size={17} /><span className="hidden sm:inline">Buscar</span>
            <kbd className="hidden rounded-md border border-slate-200 px-1.5 font-mono text-[11px] text-slate-400 sm:inline">Ctrl K</kbd>
          </button>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 sm:p-8">{children}</main>
      </div>
      {buscar && <Buscador onCerrar={() => setBuscar(false)} />}
    </div>
  );
}

export default function App() {
  const { usuario, cargando, catalogos, esDirector } = useSesion();
  if (cargando) return <div className="p-10 text-center text-slate-500">Cargando…</div>;
  if (!usuario) return <Login />;
  if (!catalogos) return <div className="p-10 text-center text-slate-500">Cargando…</div>;
  return (
    <Routes>
      <Route path="/etiquetas" element={<Etiquetas />} />
      <Route path="*" element={
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/inventario" element={<Inventario />} />
            <Route path="/inventario/:id" element={<Inventario />} />
            <Route path="/pistoleo" element={<Pistoleo />} />
            <Route path="/auditorias" element={<Auditorias />} />
            <Route path="/auditorias/:id" element={<Auditorias />} />
            <Route path="/mesa" element={<MesaAyuda />} />
            <Route path="/bandeja" element={<Navigate to="/mesa?vista=correos" replace />} />
            {esDirector && <Route path="/bitacora" element={<Bitacora />} />}
            {esDirector && <Route path="/administracion" element={<Administracion />} />}
            {esDirector && <Route path="/basedatos" element={<BaseDatos />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  );
}
