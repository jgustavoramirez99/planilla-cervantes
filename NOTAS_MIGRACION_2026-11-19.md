# Sistema de planillas - Notas de la migración (19 nov 2026)

> Este archivo NO contiene contraseñas. Las credenciales están solo en Render (variables de entorno) y en TablePlus.

## Qué pasó
- El MySQL gratuito de Aiven (`mysql-2a17c5f0`) se apagó por inactividad y no se podía encender: la versión 8.0.45 estaba vencida (EOL 31-oct-2026) y Aiven retira el plan gratuito de MySQL el 21-dic-2026.
- El login mostraba "contraseña incorrecta" por culpa de la base apagada, no por la contraseña.
- Se abrió el ticket #110755 en Aiven Support; Simon Luhur encendió el servicio y se actualizó a MySQL 8.4.
- Se hicieron respaldos completos con TablePlus (mysqldump) y se migró todo a **TiDB Cloud Starter** (gratis, compatible con MySQL).

## Estado actual
- Base de datos: TiDB Cloud Starter, instancia `planilla-cervantes`, región São Paulo (sa-east-1), base `test`, TiDB v8.5.3.
- El sistema en Render ya usa TiDB (login, lectura, escritura, borrado y Excel probados OK).
- Código: sin cambios. Solo se cambiaron variables de entorno en Render: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.
- Aiven sigue existiendo como respaldo temporal (prueba de 30 días con US$50 de crédito, vence ~19-dic-2026). Ya no se usa; los datos nuevos solo están en TiDB.

## Respaldos en esta carpeta
- `respaldo_aiven_2026-11-19_b.sql`: mysqldump completo de Aiven.
- `respaldo_para_tidb.sql`: el mismo, limpio para importar en TiDB.
- `respaldo_aiven_2026-11-19.sql`: exportación de TablePlus (también completa).
- Los `*.sql` están en `.gitignore` (tienen datos personales).

## Totales de filas verificados en TiDB
usuarios 38, docentes 42, docentes_mes 229, planillas 283, registros_deuda 264, confirmacion_deudas 100, tipos_deuda 22, boletas 203.

## Pendientes
- Cancelar/dejar vencer Aiven y responder "gracias" al ticket #110755.
- Hacer respaldo mensual desde TablePlus (Menu > File > Backup...) sobre la conexión "TiDB planilla".
- 2FA con app autenticadora (TOTP) para el rol `admin`, opcional para superadmin:
  - Flujo: usuario+contraseña -> (si no tiene correo, pedirlo) -> QR de configuración -> código de 6 dígitos.
  - Superadmin puede "Reiniciar 2FA" de un admin que pierda el celular.
  - Si el superadmin pierde su celular: limpiar el secreto 2FA directamente en la base con TablePlus.
  - Probar primero con la cuenta del superadmin.

## Cómo volver atrás (si TiDB fallara)
Poner en Render las variables de Aiven (anotadas por Gustavo antes de cambiarlas) y redeploy. Solo es posible mientras Aiven siga activo.
