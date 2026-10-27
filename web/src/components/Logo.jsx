// Logo del sistema: cuadro con degradado y un código QR estilizado
export function Logo({ tamano = 'h-12 w-12' }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-cyan-400 shadow-lg shadow-blue-500/30 ${tamano}`}>
      <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="white" aria-hidden>
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="3" height="3" rx=".6" />
        <rect x="18" y="18" width="3" height="3" rx=".6" /><rect x="14" y="19" width="2" height="2" rx=".5" /><rect x="19" y="14" width="2" height="2" rx=".5" />
      </svg>
    </span>
  );
}
