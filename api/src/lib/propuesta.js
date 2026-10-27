// Propone un ticket a partir de un correo: categoría, impacto, urgencia y equipos mencionados.
// Es solo una sugerencia; el TICE la revisa y decide antes de convertir el correo.
const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const CATEGORIAS = [
  ['Proyector y multimedia', ['proyector', 'ecran', 'parlante', 'sonido', 'audio', 'hdmi', 'televisor', 'tv ', 'pizarra']],
  ['Impresora', ['impresora', 'imprime', 'imprimir', 'toner', 'tinta', 'atasco', 'atora papel', 'fotocop']],
  ['Red e internet', ['internet', 'wifi', 'wi-fi', 'red ', 'conexion', 'conectar', 'router', 'switch', 'access point', 'sin senal']],
  ['Cuentas y accesos', ['contrasena', 'clave', 'usuario', 'cuenta', 'correo no', 'acceso', 'siagie', 'classroom']],
  ['Software', ['programa', 'office', 'word', 'excel', 'windows', 'actualiza', 'virus', 'instalar', 'licencia', 'aplicacion']],
  ['Hardware', ['no enciende', 'no prende', 'pantalla', 'monitor', 'teclado', 'mouse', 'lenta', 'se apaga', 'cpu', 'laptop', 'computadora', 'pc ']],
];

function proponerTicket(correo, equiposSede) {
  const texto = normalizar(`${correo.asunto} ${correo.cuerpo}`) + ' ';

  const categoria = (CATEGORIAS.find(([, claves]) => claves.some((k) => texto.includes(k))) || ['Otro'])[0];

  // Impacto: alto si afecta a toda la sede, un laboratorio o una evaluación; medio si es un aula u oficina
  let impacto = 'BAJO';
  if (/(toda la sede|todo el colegio|todos los|laboratorio|examen|evaluacion|simulacro|sin internet en)/.test(texto)) impacto = 'ALTO';
  else if (/(aula|salon|oficina|secretaria|direccion|coordinacion|biblioteca|sala de)/.test(texto)) impacto = 'MEDIO';

  // Urgencia: alta si hay una clase o evaluación en curso; media si es antes de la siguiente clase
  let urgencia = 'BAJA';
  if (/(urgente|ahora|en este momento|en curso|en plena clase|estoy en clase|ya empez|inmediat)/.test(texto)) urgencia = 'ALTA';
  else if (/(proxima clase|siguiente clase|hoy|manana|antes de)/.test(texto)) urgencia = 'MEDIA';

  // Equipos cuyo código aparece en el correo
  const equipos = equiposSede
    .filter((e) => {
      const cod = normalizar(e.codigo);
      return cod.length >= 3 && texto.includes(cod);
    })
    .map((e) => ({ id: e.id, codigo: e.codigo, ubicacion: e.ubicacion }));

  return {
    solicitante_correo: correo.remitente,
    solicitante_nombre: correo.remitente_nombre,
    asunto: correo.asunto,
    descripcion: correo.cuerpo,
    categoria,
    impacto,
    urgencia,
    equipos,
  };
}

module.exports = { proponerTicket };
