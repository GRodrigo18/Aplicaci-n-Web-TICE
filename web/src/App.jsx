import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useState } from 'react';
import { useSesion } from './sesion.jsx';
import { SelectorSede } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inventario from './pages/Inventario.jsx';
import FichaEquipo from './pages/FichaEquipo.jsx';
import Etiquetas from './pages/Etiquetas.jsx';
import Pistoleo from './pages/Pistoleo.jsx';
import Auditorias from './pages/Auditorias.jsx';
import MesaAyuda from './pages/MesaAyuda.jsx';
import Bandeja from './pages/Bandeja.jsx';
import Bitacora from './pages/Bitacora.jsx';
import Administracion from './pages/Administracion.jsx';

const MENU = [
  { a: '/', t: 'Dashboard', i: '📊' },
  { a: '/inventario', t: 'Inventario', i: '🖥️' },
  { a: '/pistoleo', t: 'Pistoleo QR', i: '🔍', tice: true },
  { a: '/auditorias', t: 'Auditorías', i: '📋' },
  { a: '/bandeja', t: 'Bandeja de correos', i: '✉️' },
  { a: '/mesa', t: 'Mesa de ayuda', i: '🛠️' },
  { a: '/bitacora', t: 'Bitácora', i: '🔒', director: true },
  { a: '/administracion', t: 'Usuarios y sedes', i: '👥', director: true },
];

function Layout({ children }) {
  const { usuario, cerrar, esDirector, sedes, sedeSel, setSedeSel } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const items = MENU.filter((m) => (!m.director || esDirector) && (!m.tice || !esDirector));
  return (
    <div className="min-h-screen md:flex">
      <aside className={`no-imprimir fixed inset-y-0 left-0 z-30 w-60 transform bg-marca-900 text-slate-100 transition md:static md:translate-x-0 ${abierto ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="px-4 py-5">
          <div className="text-lg font-bold">Sistema TICE</div>
          <div className="text-xs text-slate-300">Inventario y mesa de ayuda</div>
        </div>
        <nav className="space-y-0.5 px-2">
          {items.map((m) => (
            <NavLink key={m.a} to={m.a} end={m.a === '/'} onClick={() => setAbierto(false)}
              className={({ isActive }) => `flex items-center gap-2 rounded-md px-3 py-2 text-sm ${isActive ? 'bg-white/15 font-medium text-white' : 'text-slate-300 hover:bg-white/10'}`}>
              <span aria-hidden>{m.i}</span>{m.t}
            </NavLink>
          ))}
        </nav>
      </aside>
      {abierto && <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setAbierto(false)} />}
      <div className="min-w-0 flex-1">
        <header className="no-imprimir sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
          <button className="rounded p-1.5 text-slate-600 hover:bg-slate-100 md:hidden" onClick={() => setAbierto(true)} aria-label="Menú">☰</button>
          {esDirector ? (
            <div className="w-48"><SelectorSede valor={sedeSel} onChange={setSedeSel} sedes={sedes} className="entrada py-1.5" /></div>
          ) : (
            <span className="text-sm font-medium text-slate-700">{usuario.sede_nombre}</span>
          )}
          <div className="ml-auto text-right">
            <div className="text-sm font-medium text-slate-800">{usuario.nombre}</div>
            <div className="text-xs text-slate-500">{esDirector ? 'Director de TI · todas las sedes' : 'Usuario TICE'}</div>
          </div>
          <button className="btn-secundario py-1.5" onClick={cerrar}>Salir</button>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
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
            <Route path="/inventario/:id" element={<FichaEquipo />} />
            <Route path="/pistoleo" element={<Pistoleo />} />
            <Route path="/auditorias" element={<Auditorias />} />
            <Route path="/auditorias/:id" element={<Auditorias />} />
            <Route path="/bandeja" element={<Bandeja />} />
            <Route path="/mesa" element={<MesaAyuda />} />
            {esDirector && <Route path="/bitacora" element={<Bitacora />} />}
            {esDirector && <Route path="/administracion" element={<Administracion />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      } />
    </Routes>
  );
}
