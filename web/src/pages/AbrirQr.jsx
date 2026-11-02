import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { Aviso } from '../components/ui.jsx';

// Se abre al leer la etiqueta con la cámara del celular (enlace /q/<código>): identifica el equipo,
// deja la lectura en la bitácora y muestra su ficha con el historial y los tickets.
export default function AbrirQr() {
  const { token } = useParams();
  const navegar = useNavigate();
  const [error, setError] = useState('');
  useEffect(() => {
    api.post('/qr/identificar', { lectura: token })
      .then((e) => navegar(`/inventario/${e.id}`, { replace: true }))
      .catch((x) => setError(x.message));
  }, [token, navegar]);
  return (
    <div className="mx-auto max-w-md p-6 text-center">
      {error
        ? <><Aviso>{error}</Aviso><Link className="btn-secundario mt-4 inline-flex" to="/pistoleo">Ir al pistoleo QR</Link></>
        : <p className="text-slate-500">Buscando el equipo…</p>}
    </div>
  );
}
