# Pruebas rápidas de Netflow (10-30 min)

## Objetivo
Comprobar las funcionalidades principales de la app sin incluir Google Calendar.

## Preparación
1. Levantar backend local:
   - `cd backend`
   - `python manage.py runserver`
2. Levantar frontend local:
   - `cd frontend`
   - `npm run dev`
3. Asegurarse de que las URLs son:
   - Backend: `http://localhost:8000/api`
   - Frontend: `http://localhost:5173`
4. Usar una base de datos local limpia o un estado controlado.

## 1. Autenticación
- Registrar un usuario nuevo desde el frontend.
- Iniciar sesión con ese usuario.
- Verificar redirección a `/vistas`.
- Verificar que la sesión muestra nombre y rol del usuario.
- Cerrar sesión y comprobar que vuelve a `/login`.

## 2. Roles y acceso
- Si existe un admin, iniciar sesión como admin.
- Verificar que el admin ve la pestaña `Admin`.
- Si existe supervisor, iniciar sesión como supervisor.
- Verificar que supervisor también ve la pestaña `Admin` (según tu configuración) o solo lectura.
- Iniciar sesión como empleado y comprobar que no ve `Admin`.

## 3. Gestión de usuarios (Admin)
- Abrir la pestaña `Admin`.
- Crear un usuario nuevo con rol `empleado`.
- Verificar que aparece en la lista.
- Editar ese usuario: cambiar nombre y estado.
- Verificar que los cambios se aplican.
- Eliminar/desactivar el usuario y comprobar que desaparece o cambia estado.
- Si el supervisor solo tiene GET, comprobar que no puede crear/editar/eliminar.

## 4. Navegación y rutas básicas
- Navegar a `Vistas`, `Admin`, `Intercambios`, `Bolsa de dias`, `Google Calendar`.
- Comprobar que los enlaces funcionan.
- Comprobar que la app no muestra errores en la consola al cambiar entre pantallas.

## 5. Semanas y calendario
- En `Vistas`, revisar el listado de semanas.
- Seleccionar una semana y comprobar que carga sus asignaciones.
- Verificar que las asignaciones se muestran en la tabla correspondiente.
- Comprobar que el selector de semana cambia el contenido.

## 6. Generación de rotación
- En `Admin`, seleccionar modo `mes` y un año válido.
- Seleccionar empleados activos.
- Ejecutar generación mensual.
- Verificar notificación de éxito y refresco de semanas.
- Opcional: ejecutar generación anual si hay empleados suficientes.

## 7. Asignaciones de tarde
- Crear una asignación de tarde nueva desde el frontend.
- Verificar que la asignación aparece en la semana correspondiente.
- Editar la asignación (cambiar hora o usuario si es posible).
- Comprobar validación al intentar duplicar asignaciones en un mismo día.

## 8. Intercambios
- Crear una solicitud de intercambio.
- Verificar que aparece en `Mis intercambios`.
- Aceptar o rechazar la solicitud si hay otro usuario disponible.
- Comprobar el estado actualizado en la lista.
- Si no hay dos usuarios, al menos verificar que la solicitud se crea.

## 9. Bolsa de días y compensaciones
- Abrir `Bolsa de dias`.
- Verificar que aparecen saldos y movimientos.
- Ejecutar una compensación entre usuarios.
- Verificar que el movimiento se registra y el saldo se actualiza.

## 10. Errores y validaciones
- Intentar registrar sin email o contraseña.
- Intentar iniciar sesión con credenciales inválidas.
- Intentar generar sin seleccionar empleados suficientes.
- Verificar que los errores se muestran de forma clara.

## Checklist final
- [ ] Registro/login OK
- [ ] Roles y navegación OK
- [ ] CRUD de usuarios OK
- [ ] Selección de semanas OK
- [ ] Generación de rotación OK
- [ ] Asignaciones OK
- [ ] Intercambios OK
- [ ] Bolsa/compensaciones OK
- [ ] Mensajes de error OK
- [ ] Logout OK

## Nota
- Ignorar Google Calendar en estas pruebas.
- Si se detecta un fallo, registrar paso exacto, pantalla y mensaje de error.
