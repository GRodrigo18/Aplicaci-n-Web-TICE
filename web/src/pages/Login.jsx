import { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Laptop, Lock, Mail, Monitor, Moon, Printer, Projector, ShieldCheck, Sun } from 'lucide-react';
import { useSesion } from '../sesion.jsx';
import { Aviso } from '../components/ui.jsx';
import { Logo } from '../components/Logo.jsx';

// Matriz de puntos que imita un código QR (decorativa)
function MiniQr({ semilla }) {
  const celdas = Array.from({ length: 25 }, (_, i) => ((i * 7 + semilla * 13) % 5 !== 0) || i % 6 === 0);
  return (
    <div className="grid grid-cols-5 gap-[3px]">
      {celdas.map((v, i) => <span key={i} className={`h-2.5 w-2.5 rounded-[2px] ${v ? 'bg-white/90' : 'bg-transparent'}`} />)}
    </div>
  );
}

function Etiqueta({ codigo, Icono, semilla, className }) {
  return (
    <div className={`absolute w-44 rounded-2xl border border-white/10 bg-white/[.04] p-4 backdrop-blur ${className}`}>
      <div className="flex items-start justify-between">
        <Icono size={26} className="text-indigo-300" strokeWidth={1.5} />
        <MiniQr semilla={semilla} />
      </div>
      <div className="mt-5 flex items-center justify-between font-mono text-[13px] text-slate-200">
        {codigo}<span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
      </div>
    </div>
  );
}

export default function Login() {
  const { iniciar } = useSesion();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [oscuro, setOscuro] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', oscuro);
    try { localStorage.setItem('tice_tema', oscuro ? 'oscuro' : 'claro'); } catch { /* */ }
  }, [oscuro]);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setOcupado(true);
    try {
      await iniciar(correo, password);
    } catch (err) {
      const restantes = err.cuerpo?.intentosRestantes;
      setError(restantes !== undefined ? `${err.message}. Te quedan ${restantes} intento(s).` : err.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <section className="relative hidden w-[52%] overflow-hidden bg-[#0b1024] lg:block">
        <div className="cuadricula absolute inset-0" />
        <div className="absolute -right-24 top-1/4 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute -left-24 bottom-0 h-96 w-96 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="relative flex items-center gap-3 p-14">
          <Logo />
          <div>
            <div className="text-2xl font-extrabold text-white">TICE · Merced</div>
            <div className="text-sm text-slate-400">Área de Tecnologías de la Información y Comunicación Educativa</div>
          </div>
        </div>
        <div className="absolute left-[14%] right-[10%] top-[30%] h-[40%]">
          <Etiqueta codigo="SC-LAP-0042" Icono={Laptop} semilla={1} className="left-[8%] top-[8%]" />
          <Etiqueta codigo="SC-PRY-0007" Icono={Projector} semilla={2} className="left-[44%] top-0" />
          <Etiqueta codigo="SC-PC-0118" Icono={Monitor} semilla={3} className="left-[22%] top-[58%]" />
          <Etiqueta codigo="SC-IMP-0003" Icono={Printer} semilla={4} className="left-[60%] top-[52%]" />
          <div className="absolute left-0 right-0 top-[52%] h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_18px_rgba(34,211,238,.8)]" />
        </div>
        <div className="absolute bottom-14 left-14 flex gap-5">
          {[['QR', 'en cada equipo, con su historial'], ['5 sedes', 'en una sola base de datos'], ['100 %', 'operaciones en bitácora']].map(([v, t]) => (
            <div key={v} className="w-52 rounded-2xl border border-white/10 bg-white/[.04] p-5">
              <div className="text-3xl font-extrabold text-white">{v}</div>
              <div className="mt-1 text-sm text-slate-400">{t}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative flex flex-1 items-center justify-center bg-fondo p-6">
        <button className="absolute right-6 top-6 rounded-lg p-2 text-slate-500 hover:bg-slate-100" onClick={() => setOscuro(!oscuro)} aria-label="Cambiar tema">
          {oscuro ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <form onSubmit={enviar} className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden"><Logo /><span className="text-xl font-extrabold">TICE · Merced</span></div>
          <p className="text-[15px] font-semibold text-marca-500">Inventario · Mesa de ayuda · Pistoleo QR</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-slate-900">Bienvenido de vuelta</h1>
          <p className="mt-3 text-[15px] text-slate-500">Ingresa con tu correo institucional. Verás la información de tu sede; el Director de TI ve las cinco.</p>
          <label className="mt-8 block">
            <span className="etiqueta">Correo institucional</span>
            <span className="relative block">
              <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="entrada py-3 pl-11" type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required placeholder="usuario@colegio.edu.pe" />
            </span>
          </label>
          <label className="mt-5 block">
            <span className="etiqueta">Contraseña</span>
            <span className="relative block">
              <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="entrada py-3 pl-11 pr-11" type={ver ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => setVer(!ver)} aria-label="Mostrar contraseña">
                {ver ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>
          <div className="mt-4"><Aviso>{error}</Aviso></div>
          <button className="btn-primario mt-5 w-full py-3.5 text-base" disabled={ocupado}>{ocupado ? 'Ingresando…' : <>Ingresar <ArrowRight size={18} /></>}</button>
          <p className="mt-5 flex items-start gap-2 text-[13px] text-slate-400">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />Sesión protegida con JWT. 5 intentos fallidos bloquean la cuenta 15 minutos.
          </p>
        </form>
      </section>
    </div>
  );
}
