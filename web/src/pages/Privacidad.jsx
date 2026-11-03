import { Logo } from '../components/Logo.jsx';

// Política de privacidad pública (la pide Google para publicar el ingreso con Google).
// Explica qué datos usa el sistema, para qué y quién los ve.
export default function Privacidad() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <article className="mx-auto max-w-2xl rounded-2xl bg-white p-6 text-[15px] leading-relaxed text-slate-700 shadow-sm sm:p-10">
        <div className="mb-6 flex items-center gap-3">
          <Logo tamano="h-10 w-10" />
          <div>
            <div className="font-bold text-slate-900">TICE · Avantgard</div>
            <div className="text-sm text-slate-500">Inventario y mesa de ayuda del área TICE</div>
          </div>
        </div>
        <h1 className="mb-4 text-2xl font-bold text-slate-900">Política de privacidad</h1>
        <p>Este sistema lo usa el área TICE del colegio para llevar el inventario de equipos y atender los reportes de fallas.</p>
        <h2 className="mb-2 mt-6 font-semibold text-slate-900">Qué datos usamos</h2>
        <p>Cuando ingresas con Google solo recibimos tu <b>nombre</b> y tu <b>correo electrónico</b>. No accedemos a tu Gmail, Drive, contactos ni a ningún otro dato de tu cuenta.</p>
        <h2 className="mb-2 mt-6 font-semibold text-slate-900">Para qué los usamos</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Al personal TICE y al Jefe de TI, para identificarlos al ingresar al sistema.</li>
          <li>A quien reporta una falla escaneando el QR de un equipo, para registrar quién hizo el reporte y enviarle por correo el número de ticket y los avisos de atención.</li>
        </ul>
        <h2 className="mb-2 mt-6 font-semibold text-slate-900">Quién los ve y cuánto tiempo se guardan</h2>
        <p>Solo el personal del área TICE y el Jefe de TI. No se venden ni se comparten con terceros. Los reportes quedan en el historial del equipo como respaldo del mantenimiento, según las normas del colegio y la Ley N.° 29733 de Protección de Datos Personales.</p>
        <h2 className="mb-2 mt-6 font-semibold text-slate-900">Contacto</h2>
        <p>Para consultar o pedir la corrección de tus datos, escribe al buzón TICE de tu sede o al Jefe de TI del colegio.</p>
        <p className="mt-8"><a className="font-semibold text-marca-600 hover:underline" href="/">Volver al sistema</a></p>
      </article>
    </div>
  );
}
