import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, ImageUp, Keyboard, Zap } from 'lucide-react';

// Lector de QR: la pistola USB/Bluetooth escribe en el campo y envía Enter;
// la cámara del celular o de la PC usa html5-qrcode (requiere HTTPS o localhost);
// "Foto" lee el QR de una imagen. También se puede escribir el código del equipo.
export default function Lector({ onLectura, deshabilitado, compacto, aviso }) {
  const [texto, setTexto] = useState('');
  const [camara, setCamara] = useState(false);
  const [error, setError] = useState('');
  const entrada = useRef(null);
  const archivo = useRef(null);
  const escaner = useRef(null);
  const ultima = useRef({ v: '', t: 0 });
  const idCamara = useRef(`lector-${Math.random().toString(36).slice(2)}`);

  const emitir = (v) => {
    const valor = v.trim();
    if (!valor) return;
    // evita lecturas repetidas de la cámara sobre la misma etiqueta
    const ahora = Date.now();
    if (ultima.current.v === valor && ahora - ultima.current.t < 2500) return;
    ultima.current = { v: valor, t: ahora };
    onLectura(valor);
  };

  useEffect(() => { if (!camara && !compacto) entrada.current?.focus(); }, [camara, deshabilitado, compacto]);

  useEffect(() => {
    if (!camara) return undefined;
    let activo = true;
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (!activo) return;
      const e = new Html5Qrcode(idCamara.current);
      escaner.current = e;
      e.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, (t) => emitir(t), () => {})
        .catch((err) => {
          setError(window.isSecureContext
            ? `No se pudo abrir la cámara: ${err?.message || err}`
            : 'La cámara solo funciona con HTTPS. Usa la pistola lectora o abre el sistema con https://');
          setCamara(false);
        });
    });
    return () => {
      activo = false;
      const e = escaner.current;
      if (e) e.stop().catch(() => {}).finally(() => e.clear());
      escaner.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camara]);

  const leerFoto = async (f) => {
    if (!f) return;
    setError('');
    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const e = new Html5Qrcode(`${idCamara.current}-foto`);
      const r = await e.scanFile(f, false);
      e.clear();
      emitir(r);
    } catch {
      setError('No se encontró un código QR en la foto');
    } finally {
      if (archivo.current) archivo.current.value = '';
    }
  };

  const campo = (
    <form onSubmit={(e) => { e.preventDefault(); emitir(texto); setTexto(''); }} className="flex gap-2">
      <div className="relative flex-1">
        <Keyboard size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input ref={entrada} className="entrada pl-11 font-mono" placeholder="Escribe el código (SC-PC-0001) y Enter"
          value={texto} onChange={(e) => setTexto(e.target.value)} disabled={deshabilitado} autoComplete="off" />
      </div>
      {compacto
        ? <button type="button" className="btn-secundario px-3" onClick={() => { setError(''); setCamara(!camara); }} disabled={deshabilitado} title="Cámara">{camara ? <CameraOff size={17} /> : <Camera size={17} />}</button>
        : <button type="button" className="btn-secundario" onClick={() => archivo.current?.click()} disabled={deshabilitado}><ImageUp size={17} />Foto</button>}
      <input ref={archivo} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => leerFoto(e.target.files?.[0])} />
    </form>
  );

  if (compacto) {
    return (
      <div className="space-y-2">
        {campo}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {camara && <div id={idCamara.current} className="mx-auto w-full max-w-sm overflow-hidden rounded-xl" />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative aspect-[16/11] overflow-hidden rounded-2xl bg-[#05070f]">
        <div className="cuadricula absolute inset-0" />
        <span className="absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
          <Zap size={13} className="text-cyan-300" />{deshabilitado ? 'Elige el ambiente' : 'Pistola lista'}
        </span>
        {camara ? (
          <>
            <div id={idCamara.current} className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
            <button className="btn absolute bottom-4 left-1/2 z-10 -translate-x-1/2 bg-black/60 text-white hover:bg-black/80" onClick={() => setCamara(false)}><CameraOff size={17} />Apagar cámara</button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            {['left-[22%] top-[14%] border-l-4 border-t-4 rounded-tl-2xl', 'right-[22%] top-[14%] border-r-4 border-t-4 rounded-tr-2xl',
              'left-[22%] bottom-[14%] border-b-4 border-l-4 rounded-bl-2xl', 'right-[22%] bottom-[14%] border-b-4 border-r-4 rounded-br-2xl'].map((c) => (
              <span key={c} className={`absolute h-14 w-14 border-cyan-400 ${c}`} />
            ))}
            <div className="text-2xl font-bold text-white">Apunta al código QR del equipo</div>
            <div className="mt-1 max-w-sm text-slate-400">o dispara la pistola lectora: el sistema la detecta sola.</div>
            <button className="btn-primario mt-6" onClick={() => { setError(''); setCamara(true); }} disabled={deshabilitado}><Camera size={18} />Activar cámara</button>
          </div>
        )}
      </div>
      {campo}
      <div id={`${idCamara.current}-foto`} className="hidden" />
      {(error || aviso) && <div className={`text-sm ${error ? 'text-red-600' : ''}`}>{error || aviso}</div>}
    </div>
  );
}
