import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// Contenido de la etiqueta: lo lee la cámara o la pistola lectora (que escribe como teclado)
export const contenidoQr = (token) => `TICE:${token}`;

export function ImagenQr({ token, tamano = 160 }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(contenidoQr(token), { margin: 1, width: tamano * 2, errorCorrectionLevel: 'M' }).then(setSrc);
  }, [token, tamano]);
  return src ? <img src={src} width={tamano} height={tamano} alt="Código QR del equipo" /> : <div style={{ width: tamano, height: tamano }} />;
}

export function EtiquetaEquipo({ equipo, tamano = 96 }) {
  return (
    <div className="flex items-center gap-2 rounded border border-slate-300 bg-white p-2" style={{ breakInside: 'avoid' }}>
      <ImagenQr token={equipo.qr_token} tamano={tamano} />
      <div className="min-w-0 text-[11px] leading-tight text-slate-800">
        <div className="text-sm font-bold">{equipo.codigo}</div>
        <div>{equipo.tipo}</div>
        <div>{equipo.marca} {equipo.modelo || ''}</div>
        <div className="text-slate-500">{equipo.sede_nombre}</div>
        <div className="mt-1 text-[9px] uppercase tracking-wide text-slate-400">Área TICE</div>
      </div>
    </div>
  );
}
