import { useEffect, useRef, useState } from 'react';

// Lector de QR: la pistola USB/Bluetooth escribe en el campo y envía Enter;
// la cámara del celular o de la PC usa html5-qrcode (requiere HTTPS o localhost).
export default function Lector({ onLectura, deshabilitado }) {
  const [texto, setTexto] = useState('');
  const [camara, setCamara] = useState(false);
  const [errorCamara, setErrorCamara] = useState('');
  const entrada = useRef(null);
  const escaner = useRef(null);
  const ultima = useRef({ v: '', t: 0 });

  const emitir = (v) => {
    const valor = v.trim();
    if (!valor) return;
    // evita lecturas repetidas de la cámara sobre la misma etiqueta
    const ahora = Date.now();
    if (ultima.current.v === valor && ahora - ultima.current.t < 2500) return;
    ultima.current = { v: valor, t: ahora };
    onLectura(valor);
  };

  useEffect(() => { if (!camara) entrada.current?.focus(); }, [camara, deshabilitado]);

  useEffect(() => {
    if (!camara) return undefined;
    let activo = true;
    import('html5-qrcode').then(({ Html5Qrcode }) => {
      if (!activo) return;
      const e = new Html5Qrcode('lector-camara');
      escaner.current = e;
      e.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, (t) => emitir(t), () => {})
        .catch((err) => {
          setErrorCamara(window.isSecureContext
            ? `No se pudo abrir la cámara: ${err?.message || err}`
            : 'La cámara solo funciona con HTTPS. Use la pistola lectora o abra el sistema con https://');
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

  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); emitir(texto); setTexto(''); }} className="flex gap-2">
        <input ref={entrada} className="entrada font-mono" placeholder="Lea la etiqueta con la pistola o escriba su contenido y presione Enter"
          value={texto} onChange={(e) => setTexto(e.target.value)} disabled={deshabilitado} autoComplete="off" />
        <button className="btn-secundario" type="submit" disabled={deshabilitado}>Leer</button>
      </form>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-secundario" onClick={() => { setErrorCamara(''); setCamara(!camara); }} disabled={deshabilitado}>
          {camara ? 'Apagar cámara' : '📷 Usar cámara'}
        </button>
        {errorCamara && <span className="text-xs text-red-600">{errorCamara}</span>}
      </div>
      {camara && <div id="lector-camara" className="mx-auto w-full max-w-sm overflow-hidden rounded-lg border border-slate-300" />}
    </div>
  );
}
