import { EtiquetaEquipo } from '../components/Etiqueta.jsx';

// Hoja A4 de etiquetas QR (3 columnas). Se abre en otra pestaña desde el inventario.
export default function Etiquetas() {
  let equipos = [];
  try { equipos = JSON.parse(sessionStorage.getItem('tice_etiquetas') || '[]'); } catch { /* */ }
  return (
    <div className="mx-auto bg-white p-4" style={{ maxWidth: '210mm' }}>
      <div className="no-imprimir mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Etiquetas QR ({equipos.length})</h1>
          <p className="text-sm text-slate-500">Imprima en A4 y pegue cada etiqueta en su equipo.</p>
        </div>
        <button className="btn-primario" onClick={() => window.print()}>🖨️ Imprimir</button>
      </div>
      {!equipos.length && <p className="text-sm text-slate-500">No hay equipos seleccionados. Vuelva al inventario y elija los equipos.</p>}
      <div className="grid grid-cols-3 gap-2">
        {equipos.map((e) => <EtiquetaEquipo key={e.id} equipo={e} tamano={84} />)}
      </div>
    </div>
  );
}
