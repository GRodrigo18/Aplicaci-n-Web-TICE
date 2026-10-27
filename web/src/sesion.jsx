import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, guardarToken, leerToken, onSesionExpirada } from './api.js';

const Ctx = createContext(null);

export function SesionProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(!!leerToken());
  const [catalogos, setCatalogos] = useState(null);
  const [sedes, setSedes] = useState([]);
  // sede elegida por el Director en el selector ('' = todas)
  const [sedeSel, setSedeSel] = useState('');

  const cerrar = useCallback(() => {
    guardarToken(null);
    setUsuario(null);
  }, []);

  const cargarContexto = useCallback(async () => {
    const [cat, s] = await Promise.all([api.get('/catalogos'), api.get('/sedes')]);
    setCatalogos(cat);
    setSedes(s);
  }, []);

  useEffect(() => {
    onSesionExpirada(cerrar);
    if (!leerToken()) return;
    api.get('/auth/me')
      .then(async (u) => { setUsuario(u); await cargarContexto(); })
      .catch(cerrar)
      .finally(() => setCargando(false));
  }, [cerrar, cargarContexto]);

  const iniciar = async (correo, password) => {
    const r = await api.post('/auth/login', { correo, password });
    guardarToken(r.token);
    setUsuario(r.usuario);
    await cargarContexto();
  };

  const esDirector = usuario?.rol === 'DIRECTOR';
  // parámetro sede_id para las consultas (el TICE siempre ve su sede; la API lo fuerza)
  const sedeParam = esDirector ? sedeSel : '';

  return (
    <Ctx.Provider value={{ usuario, cargando, iniciar, cerrar, catalogos, sedes, setSedes, esDirector, sedeSel, setSedeSel, sedeParam, recargarContexto: cargarContexto }}>
      {children}
    </Ctx.Provider>
  );
}

export const useSesion = () => useContext(Ctx);
