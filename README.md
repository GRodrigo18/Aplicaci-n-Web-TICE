# Sistema web TICE

Sistema web de inventario de equipos tecnológicos y gestión de incidencias del área TICE.
Proyecto de Práctica Preprofesional II — Rodrigo Javier Grados Alvarez.

**En línea:** https://sistema-tice.onrender.com

| Capa | Tecnología |
| --- | --- |
| Presentación | React 18 + Vite + Tailwind, servida por Nginx |
| Lógica de negocio | API REST en Node.js 22 + Express, JWT y bcrypt |
| Datos | PostgreSQL 16 con bitácora inmutable (cadena SHA-256) |
| Despliegue | Docker Compose o Render + Supabase |

## Módulos

- Inicio de sesión con Google y roles (Jefe de TI y TICE de sede)
- Inventario de equipos propios y alquilados, importación desde Excel y exportación CSV
- Etiquetas QR, pistoleo, traslados y auditorías físicas
- Mesa de ayuda con prioridad y SLA ITIL 4, Kanban y escalamiento por niveles
- Reporte de fallas por QR o por correo del buzón TICE
- Dashboard de indicadores: TRI, TAI, ICI, PIR y DT
- Bitácora inmutable, historial de mantenimiento y respaldos

## Instalación rápida

```bash
cp .env.example .env
docker compose up -d --build
```

El sistema queda en `http://<servidor>:8080`. Las pruebas se ejecutan con `cd api && npm test`.

## Documentación

- [Guía técnica](docs/guia-tecnica.md): instalación completa, configuración, correo, roles, indicadores y base de datos.
- [Servidor y datos](docs/servidor-y-datos.md): comparación entre Render + Supabase y un servidor propio.
- [Script de Gmail](integraciones/gmail/README.md): conexión del buzón de la sede.
