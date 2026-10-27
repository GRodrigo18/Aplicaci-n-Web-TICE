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

  // en la PC el campo queda listo para la pistola; en el celular no se enfoca solo para no abrir el teclado encima de la cámara
  useEffect(() => {
    const punteroFino = window.matchMedia?.('(pointer: fine)').matches;
    if (!camara && !compacto && punteroFino) entrada.current?.focus();
  }, [camara, deshabilitado, compacto]);

  useEffect(() => {
    if (!camara) return undefined;
    let activo = true;
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (!activo) return;
      const e = new Html5Qrcode(idCamara.current);
      escaner.current = e;
      // recuadro de lectura proporcional a la pantalla (en el celular ocupa casi todo el ancho)
      const qrbox = (w, h) => { const lado = Math.max(160, Math.floor(Math.min(w, h) * 0.7)); return { width: lado, height: lado }; };
      e.start({ facingMode: 'environment' }, { fps: 10, qrbox, aspectRatio: window.innerWidth < 640 ? 1 : 16 / 11 }, (t) => emitir(t), () => {})
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
        <input ref={entrada} className="entrada pl-11 font-mono" placeholder="Código del equipo y Enter"
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
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#05070f] sm:aspect-[16/11]">
        <div className="cuadricula absolute inset-0" />
        <span className="absolute left-4 top-4 z-10 flex items-center gap-1.5 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-semibold text-white">
          <Zap size={13} className="text-cyan-300" />{deshabilitado ? 'Primero escribe el ambiente' : 'Lector listo'}
        </span>
        {camara ? (
          <>
            <div id={idCamara.current} className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
            <button className="btn absolute bottom-4 left-1/2 z-10 -translate-x-1/2 bg-black/60 text-white hover:bg-black/80" onClick={() => setCamara(false)}><CameraOff size={17} />Apagar cámara</button>
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            {['left-[8%] top-[8%] border-l-4 border-t-4 rounded-tl-2xl sm:left-[22%] sm:top-[14%]', 'right-[8%] top-[8%] border-r-4 border-t-4 rounded-tr-2xl sm:right-[22%] sm:top-[14%]',
              'left-[8%] bottom-[8%] border-b-4 border-l-4 rounded-bl-2xl sm:left-[22%] sm:bottom-[14%]', 'right-[8%] bottom-[8%] border-b-4 border-r-4 rounded-br-2xl sm:right-[22%] sm:bottom-[14%]'].map((c) => (
              <span key={c} className={`pointer-events-none absolute h-10 w-10 border-cyan-400 sm:h-14 sm:w-14 ${c}`} />
            ))}
            <div className="max-w-[70%] text-lg font-bold leading-snug text-white sm:max-w-none sm:text-2xl">Apunta al código QR del equipo</div>
            <div className="mt-1 max-w-[70%] text-sm text-slate-400 sm:max-w-sm sm:text-base">o usa la pistola lectora: el sistema la detecta sola.</div>
            <button className="btn-primario mt-5 sm:mt-6" onClick={() => { setError(''); setCamara(true); }} disabled={deshabilitado}><Camera size={18} />Activar cámara</button>
          </div>
        )}
      </div>
      {campo}
      <div id={`${idCamara.current}-foto`} className="hidden" />
      {(error || aviso) && <div className={`text-sm ${error ? 'text-red-600' : ''}`}>{error || aviso}</div>}
    </div>
  );
}
