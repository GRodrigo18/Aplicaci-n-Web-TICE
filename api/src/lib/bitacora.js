// RF-05: un registro por cada operación, dentro de la misma transacción que la operación.
// El hash y la secuencia los calcula el trigger de la base de datos.
// fecha solo la usan los datos de demostración para fechar su historial; el sistema siempre usa now()
async function registrar(client, usuario, { entidad, entidadId = null, accion, detalle = {}, sedeId, fecha = null }) {
  await client.query(
    `INSERT INTO logs_auditoria (usuario_id, usuario_correo, sede_id, entidad, entidad_id, accion, detalle, fecha)
     VALUES ($1, $2, $3, $4, $5, $6, $7, coalesce($8::timestamptz, now()))`,
    [
      usuario?.id ?? null,
      usuario?.correo ?? null,
      sedeId ?? usuario?.sede_id ?? null,
      entidad,
      entidadId,
      accion,
      JSON.stringify(detalle),
      fecha,
    ],
  );
}

// Campos que cambiaron entre dos versiones de un registro
function diferencias(antes, despues, campos) {
  const cambios = {};
  for (const c of campos) {
    const a = antes[c] instanceof Date ? antes[c].toISOString() : antes[c];
    const d = despues[c] instanceof Date ? despues[c].toISOString() : despues[c];
    if (String(a ?? '') !== String(d ?? '')) cambios[c] = { antes: a ?? null, despues: d ?? null };
  }
  return cambios;
}

module.exports = { registrar, diferencias };
