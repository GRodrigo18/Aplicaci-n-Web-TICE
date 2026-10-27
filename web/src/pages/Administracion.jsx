import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSesion } from '../sesion.jsx';
import { Aviso, Campo, Confirmar, Encabezado, Insignia, Modal, SelectorSede, fechaHora } from '../components/ui.jsx';

function FormUsuario({ usuario, onCerrar, onGuardado }) {
  const { sedes } = useSesion();
  const nuevo = !usuario;
  const [f, setF] = useState(usuario ? { nombre: usuario.nombre, rol: usuario.rol, sede_id: usuario.sede_id || '', password: '' }
    : { nombre: '', correo: '', rol: 'TICE', sede_id: '', password: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    const datos = { ...f };
    if (!nuevo && !datos.password) delete datos.password;
    try { onGuardado(nuevo ? await api.post('/usuarios', datos) : await api.put(`/usuarios/${usuario.id}`, datos)); } catch (x) { setError(x.message); }
  };
  return (
    <Modal titulo={nuevo ? 'Nuevo usuario' : `Editar ${usuario.correo}`} onCerrar={onCerrar}>
      <form onSubmit={guardar} className="space-y-3">
        <Campo etiqueta="Nombre *"><input className="entrada" value={f.nombre} onChange={set('nombre')} required /></Campo>
        {nuevo && <Campo etiqueta="Correo institucional *" ayuda="Solo se aceptan correos del dominio del colegio. Con ese correo también puede entrar con Google."><input type="email" className="entrada" value={f.correo} onChange={set('correo')} required /></Campo>}
        <Campo etiqueta="Rol">
          <select className="entrada" value={f.rol} onChange={set('rol')}><option value="TICE">Usuario TICE</option><option value="DIRECTOR">Director de TI</option></select>
        </Campo>
        {f.rol === 'TICE' && <Campo etiqueta="Sede *" ayuda="Cada sede tiene un solo TICE activo"><SelectorSede valor={f.sede_id} onChange={(v) => setF({ ...f, sede_id: v })} sedes={sedes} todas={false} /></Campo>}
        <Campo etiqueta={nuevo ? 'Contraseña inicial * (mínimo 8 caracteres)' : 'Nueva contraseña (dejar vacío para no cambiar)'}>
          <input type="password" className="entrada" value={f.password} onChange={set('password')} autoComplete="new-password" {...(nuevo ? { required: true, minLength: 8 } : {})} />
        </Campo>
        <Aviso>{error}</Aviso>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario">Guardar</button></div>
      </form>
    </Modal>
  );
}

function FormSede({ sede, onCerrar, onGuardado }) {
  const [f, setF] = useState(sede ? { nombre: sede.nombre, direccion: sede.direccion || '', correo_buzon: sede.correo_buzon } : { codigo: '', nombre: '', direccion: '', correo_buzon: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal titulo={sede ? `Editar ${sede.nombre}` : 'Nueva sede'} onCerrar={onCerrar}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        try { onGuardado(sede ? await api.put(`/sedes/${sede.id}`, f) : await api.post('/sedes', f)); } catch (x) { setError(x.message); }
      }}>
        {!sede && <Campo etiqueta="Código *"><input className="entrada uppercase" maxLength={10} value={f.codigo} onChange={set('codigo')} required /></Campo>}
        <Campo etiqueta="Nombre *"><input className="entrada" value={f.nombre} onChange={set('nombre')} required /></Campo>
        <Campo etiqueta="Dirección"><input className="entrada" value={f.direccion} onChange={set('direccion')} /></Campo>
        <Campo etiqueta="Buzón TICE de la sede *" ayuda="Los correos enviados a esta dirección llegan a la bandeja de la sede"><input type="email" className="entrada" value={f.correo_buzon} onChange={set('correo_buzon')} required /></Campo>
        <Aviso>{error}</Aviso>
        <div className="flex justify-end gap-2"><button type="button" className="btn-secundario" onClick={onCerrar}>Cancelar</button><button className="btn-primario">Guardar</button></div>
      </form>
    </Modal>
  );
}

export default function Administracion() {
  const { sedes, recargarContexto, usuario: yo } = useSesion();
  const [usuarios, setUsuarios] = useState([]);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => api.get('/usuarios').then(setUsuarios), []);
  useEffect(() => { cargar(); }, [cargar]);
  const listo = () => { setModal(null); cargar(); recargarContexto(); };

  return (
    <div>
      <Encabezado titulo="Usuarios y sedes" subtitulo="Los usuarios se desactivan, no se eliminan">
        <button className="btn-secundario" onClick={() => setModal({ tipo: 'sede' })}>+ Nueva sede</button>
        <button className="btn-primario" onClick={() => setModal({ tipo: 'usuario' })}>+ Nuevo usuario</button>
      </Encabezado>
      <Aviso>{error}</Aviso>
      <div className="tarjeta mb-6 overflow-x-auto">
        <table className="tabla">
          <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Sede</th><th>Estado</th><th /></tr></thead>
          <tbody>{usuarios.map((u) => (
            <tr key={u.id}>
              <td>{u.nombre}</td><td>{u.correo}</td><td>{u.rol === 'DIRECTOR' ? 'Director de TI' : 'Usuario TICE'}</td><td>{u.sede_nombre || 'Todas'}</td>
              <td>
                <Insignia valor={u.activo ? 'OPERATIVO' : 'BAJA'} texto={u.activo ? 'Activo' : 'Inactivo'} />
                {u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date() && <span className="ml-1 text-xs text-red-600">bloqueado hasta {fechaHora(u.bloqueado_hasta)}</span>}
              </td>
              <td className="whitespace-nowrap text-right text-xs">
                <button className="px-1 text-marca-600 hover:underline" onClick={() => setModal({ tipo: 'usuario', u })}>Editar</button>
                {u.bloqueado_hasta && <button className="px-1 text-marca-600 hover:underline" onClick={async () => { await api.put(`/usuarios/${u.id}`, { desbloquear: true }); cargar(); }}>Desbloquear</button>}
                {u.id !== yo.id && <button className="px-1 text-red-600 hover:underline" onClick={() => setModal({ tipo: 'activar', u })}>{u.activo ? 'Desactivar' : 'Activar'}</button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <h2 className="mb-2 font-semibold text-slate-700">Sedes</h2>
      <div className="tarjeta overflow-x-auto">
        <table className="tabla">
          <thead><tr><th>Código</th><th>Nombre</th><th>Buzón TICE</th><th>TICE activo</th><th /></tr></thead>
          <tbody>{sedes.map((s) => (
            <tr key={s.id}>
              <td className="font-mono">{s.codigo}</td><td>{s.nombre}</td><td>{s.correo_buzon}</td>
              <td>{usuarios.find((u) => u.sede_id === s.id && u.rol === 'TICE' && u.activo)?.nombre || <span className="text-amber-600">Sin TICE</span>}</td>
              <td className="text-right"><button className="text-xs text-marca-600 hover:underline" onClick={() => setModal({ tipo: 'sede', s })}>Editar</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {modal?.tipo === 'usuario' && <FormUsuario usuario={modal.u} onCerrar={() => setModal(null)} onGuardado={listo} />}
      {modal?.tipo === 'sede' && <FormSede sede={modal.s} onCerrar={() => setModal(null)} onGuardado={listo} />}
      {modal?.tipo === 'activar' && (
        <Confirmar titulo={modal.u.activo ? 'Desactivar usuario' : 'Activar usuario'} peligro={modal.u.activo}
          mensaje={`${modal.u.activo ? 'Desactivar' : 'Activar'} a ${modal.u.nombre}. ${modal.u.activo ? 'No podrá iniciar sesión.' : ''}`}
          onCancelar={() => setModal(null)}
          onConfirmar={async () => { try { await api.put(`/usuarios/${modal.u.id}`, { activo: !modal.u.activo }); setError(''); } catch (x) { setError(x.message); } listo(); }} />
      )}
    </div>
  );
}
