import { useState } from 'react';
import { useSesion } from '../sesion.jsx';
import { Aviso } from '../components/ui.jsx';

export default function Login() {
  const { iniciar } = useSesion();
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setOcupado(true);
    try {
      await iniciar(correo, password);
    } catch (err) {
      const restantes = err.cuerpo?.intentosRestantes;
      setError(restantes !== undefined ? `${err.message}. Le quedan ${restantes} intento(s).` : err.message);
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-marca-900 to-marca-600 p-4">
      <form onSubmit={enviar} className="tarjeta w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-marca-700 text-lg font-bold text-white">TI</div>
          <h1 className="text-lg font-semibold text-slate-800">Sistema TICE</h1>
          <p className="text-sm text-slate-500">Inventario de equipos y mesa de ayuda</p>
        </div>
        <label className="block">
          <span className="etiqueta">Correo institucional</span>
          <input className="entrada" type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
        </label>
        <label className="block">
          <span className="etiqueta">Contraseña</span>
          <input className="entrada" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <Aviso>{error}</Aviso>
        <button className="btn-primario w-full" disabled={ocupado}>{ocupado ? 'Ingresando…' : 'Ingresar'}</button>
        <p className="text-center text-xs text-slate-400">La cuenta se bloquea 15 minutos tras 5 intentos fallidos.</p>
      </form>
    </div>
  );
}
