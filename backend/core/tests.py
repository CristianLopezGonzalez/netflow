from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from .models import AsignacionTarde, BolsaDiasMovimiento, CalendarioSemanal, EstadoSolicitud, SolicitudIntercambio
from .services import obtener_deuda


class CoreApiRegressionTests(APITestCase):
	host_headers = {"HTTP_HOST": "localhost"}

	def setUp(self):
		user_model = get_user_model()

		self.admin = user_model.objects.create_user(
			username="admin@netflow.local",
			email="admin@netflow.local",
			password="trebujena123",
			nombre="Admin",
			rol="admin",
			activo=True,
		)
		self.emp1 = user_model.objects.create_user(
			username="empleado1@test.local",
			email="empleado1@test.local",
			password="trebujena123",
			nombre="Empleado 1",
			rol="empleado",
			activo=True,
		)
		self.emp2 = user_model.objects.create_user(
			username="empleado2@test.local",
			email="empleado2@test.local",
			password="trebujena123",
			nombre="Empleado 2",
			rol="empleado",
			activo=True,
		)

		monday = date.today() - timedelta(days=date.today().weekday())
		friday = monday + timedelta(days=4)
		iso = monday.isocalendar()
		self.week = CalendarioSemanal.objects.create(
			anio=iso.year,
			numero_semana=iso.week,
			fecha_inicio_semana=monday,
			fecha_fin_semana=friday,
			estado="publicado",
		)

		self.emp1_assignment = AsignacionTarde.objects.create(
			semana=self.week,
			usuario=self.emp1,
			dia="miercoles",
			hora_inicio=time(14, 0),
			hora_fin=time(22, 0),
		)
		self.emp2_assignment = AsignacionTarde.objects.create(
			semana=self.week,
			usuario=self.emp2,
			dia="jueves",
			hora_inicio=time(14, 0),
			hora_fin=time(22, 0),
		)

	def test_intercambios_mias_returns_200_for_sender_and_receiver(self):
		self.client.force_authenticate(user=self.emp1)
		create_response = self.client.post(
			"/api/intercambios",
			{
				"receptor_id": str(self.emp2.id),
				"tipo": "dia",
				"asignacion_origen_id": str(self.emp1_assignment.id),
				"motivo": "Necesito cambiar el turno",
				"modo_compensacion": "bolsa",
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

		sender_list_response = self.client.get("/api/intercambios/mias", **self.host_headers)
		self.assertEqual(sender_list_response.status_code, status.HTTP_200_OK)
		self.assertEqual(len(sender_list_response.data["enviadas"]), 1)
		self.assertEqual(len(sender_list_response.data["recibidas"]), 0)

		self.client.force_authenticate(user=self.emp2)
		receiver_list_response = self.client.get("/api/intercambios/mias", **self.host_headers)
		self.assertEqual(receiver_list_response.status_code, status.HTTP_200_OK)
		self.assertEqual(len(receiver_list_response.data["recibidas"]), 1)

	def test_intercambios_mias_auto_cancels_stale_pending_requests(self):
		self.client.force_authenticate(user=self.emp1)
		create_response = self.client.post(
			"/api/intercambios",
			{
				"receptor_id": str(self.emp2.id),
				"tipo": "dia",
				"asignacion_origen_id": str(self.emp1_assignment.id),
				"motivo": "Solicitud que quedara obsoleta",
				"modo_compensacion": "bolsa",
			},
			format="json",
			**self.host_headers,
		)
		self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

		# Simula estado obsoleto: la asignacion origen ya no pertenece al solicitante.
		self.emp1_assignment.usuario = self.emp2
		self.emp1_assignment.save(update_fields=["usuario"])

		self.client.force_authenticate(user=self.emp2)
		response = self.client.get("/api/intercambios/mias", **self.host_headers)
		self.assertEqual(response.status_code, status.HTTP_200_OK)

		solicitud = SolicitudIntercambio.objects.get(id=create_response.data["id"])
		self.assertEqual(solicitud.estado, "cancelada")

	def test_admin_can_delete_assignment(self):
		self.client.force_authenticate(user=self.admin)

		delete_response = self.client.delete(
			f"/api/asignaciones-tarde/{self.emp1_assignment.id}",
			**self.host_headers,
		)

		self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
		self.assertFalse(AsignacionTarde.objects.filter(id=self.emp1_assignment.id).exists())

	def test_employee_cannot_delete_assignment(self):
		self.client.force_authenticate(user=self.emp1)

		delete_response = self.client.delete(
			f"/api/asignaciones-tarde/{self.emp2_assignment.id}",
			**self.host_headers,
		)

		self.assertEqual(delete_response.status_code, status.HTTP_403_FORBIDDEN)
		self.assertTrue(AsignacionTarde.objects.filter(id=self.emp2_assignment.id).exists())

	def test_admin_cannot_create_duplicate_week(self):
		self.client.force_authenticate(user=self.admin)

		response = self.client.post(
			"/api/semanas",
			{
				"anio": self.week.anio,
				"numero_semana": self.week.numero_semana,
				"fecha_inicio_semana": str(self.week.fecha_inicio_semana),
				"fecha_fin_semana": str(self.week.fecha_fin_semana),
				"estado": "publicado",
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("Ya existe una semana registrada", str(response.data))


class UsuariosCrudApiTests(APITestCase):
	host_headers = {"HTTP_HOST": "localhost"}

	def setUp(self):
		user_model = get_user_model()

		self.admin = user_model.objects.create_user(
			username="admin.users@test.local",
			email="admin.users@test.local",
			password="trebujena123",
			nombre="Admin Users",
			rol="admin",
			activo=True,
		)
		self.supervisor = user_model.objects.create_user(
			username="supervisor.users@test.local",
			email="supervisor.users@test.local",
			password="trebujena123",
			nombre="Supervisor Users",
			rol="supervisor",
			activo=True,
		)
		self.employee = user_model.objects.create_user(
			username="empleado.users@test.local",
			email="empleado.users@test.local",
			password="trebujena123",
			nombre="Empleado Users",
			rol="empleado",
			activo=True,
		)
		self.target_user = user_model.objects.create_user(
			username="target.user@test.local",
			email="target.user@test.local",
			password="trebujena123",
			nombre="Target User",
			rol="empleado",
			activo=True,
		)

	def test_admin_can_list_users(self):
		self.client.force_authenticate(user=self.admin)
		response = self.client.get("/api/usuarios", **self.host_headers)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		emails = {item["email"] for item in response.data}
		self.assertIn(self.admin.email, emails)
		self.assertIn(self.target_user.email, emails)

	def test_employee_cannot_access_users_crud(self):
		self.client.force_authenticate(user=self.employee)
		response = self.client.get("/api/usuarios", **self.host_headers)

		self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

	def test_supervisor_can_create_user_with_role_and_status(self):
		self.client.force_authenticate(user=self.supervisor)
		response = self.client.post(
			"/api/usuarios",
			{
				"nombre": "Nuevo Empleado",
				"email": "nuevo.empleado@test.local",
				"password": "claveSegura123",
				"rol": "empleado",
				"activo": False,
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
		user_model = get_user_model()
		created_user = user_model.objects.get(email="nuevo.empleado@test.local")
		self.assertEqual(created_user.username, "nuevo.empleado@test.local")
		self.assertEqual(created_user.rol, "empleado")
		self.assertFalse(created_user.activo)
		self.assertFalse(created_user.is_active)
		self.assertTrue(created_user.check_password("claveSegura123"))

	def test_create_user_rejects_duplicate_email_case_insensitive(self):
		self.client.force_authenticate(user=self.admin)
		response = self.client.post(
			"/api/usuarios",
			{
				"nombre": "Duplicado",
				"email": "EMPLEADO.USERS@TEST.LOCAL",
				"password": "claveSegura123",
				"rol": "empleado",
				"activo": True,
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("email", response.data)

	def test_admin_can_get_patch_and_soft_delete_user(self):
		self.client.force_authenticate(user=self.admin)

		detail_response = self.client.get(
			f"/api/usuarios/{self.target_user.id}",
			**self.host_headers,
		)
		self.assertEqual(detail_response.status_code, status.HTTP_200_OK)
		self.assertEqual(detail_response.data["email"], self.target_user.email)

		patch_response = self.client.patch(
			f"/api/usuarios/{self.target_user.id}",
			{
				"nombre": "Target Editado",
				"email": "TARGET.EDITADO@TEST.LOCAL",
				"rol": "supervisor",
				"activo": True,
				"password": "nuevaClave123",
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(patch_response.status_code, status.HTTP_200_OK, patch_response.data)
		self.target_user.refresh_from_db()
		self.assertEqual(self.target_user.nombre, "Target Editado")
		self.assertEqual(self.target_user.email, "target.editado@test.local")
		self.assertEqual(self.target_user.username, "target.editado@test.local")
		self.assertEqual(self.target_user.rol, "supervisor")
		self.assertTrue(self.target_user.check_password("nuevaClave123"))

		delete_response = self.client.delete(
			f"/api/usuarios/{self.target_user.id}",
			**self.host_headers,
		)
		self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
		self.target_user.refresh_from_db()
		self.assertFalse(self.target_user.activo)
		self.assertFalse(self.target_user.is_active)

	def test_admin_cannot_delete_own_user(self):
		self.client.force_authenticate(user=self.admin)
		response = self.client.delete(f"/api/usuarios/{self.admin.id}", **self.host_headers)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class IntercambiosBolsaWorkflowTests(APITestCase):
	host_headers = {"HTTP_HOST": "localhost"}

	def setUp(self):
		user_model = get_user_model()

		self.emp1 = user_model.objects.create_user(
			username="empleadoa@test.local",
			email="empleadoa@test.local",
			password="trebujena123",
			nombre="Empleado A",
			rol="empleado",
			activo=True,
		)
		self.emp2 = user_model.objects.create_user(
			username="empleadob@test.local",
			email="empleadob@test.local",
			password="trebujena123",
			nombre="Empleado B",
			rol="empleado",
			activo=True,
		)

		monday = date.today() - timedelta(days=date.today().weekday())
		friday = monday + timedelta(days=4)
		iso = monday.isocalendar()
		self.week = CalendarioSemanal.objects.create(
			anio=iso.year,
			numero_semana=iso.week,
			fecha_inicio_semana=monday,
			fecha_fin_semana=friday,
			estado="publicado",
		)

		self.emp1_lunes = self._crear_asignacion(self.emp1, "lunes")
		self.emp1_miercoles = self._crear_asignacion(self.emp1, "miercoles")

		self.emp2_martes = self._crear_asignacion(self.emp2, "martes")
		self.emp2_jueves = self._crear_asignacion(self.emp2, "jueves")
		self.emp2_viernes = self._crear_asignacion(self.emp2, "viernes")

	def _crear_asignacion(self, usuario, dia):
		return AsignacionTarde.objects.create(
			semana=self.week,
			usuario=usuario,
			dia=dia,
			hora_inicio=time(14, 0),
			hora_fin=time(22, 0),
		)

	def _crear_semana_publicada(self):
		monday = date.today() - timedelta(days=date.today().weekday())
		inicio = monday + timedelta(days=7)
		fin = inicio + timedelta(days=4)
		iso = inicio.isocalendar()
		return CalendarioSemanal.objects.create(
			anio=iso.year,
			numero_semana=iso.week,
			fecha_inicio_semana=inicio,
			fecha_fin_semana=fin,
			estado="publicado",
		)

	def _crear_intercambio(
		self,
		*,
		solicitante,
		receptor,
		asignacion_origen_id,
		tipo="dia",
		modo_compensacion="bolsa",
		motivo="",
		asignacion_destino_id=None,
	):
		self.client.force_authenticate(user=solicitante)
		payload = {
			"receptor_id": str(receptor.id),
			"tipo": tipo,
			"asignacion_origen_id": str(asignacion_origen_id),
			"modo_compensacion": modo_compensacion,
			"motivo": motivo,
		}
		if asignacion_destino_id is not None:
			payload["asignacion_destino_id"] = str(asignacion_destino_id)

		response = self.client.post(
			"/api/intercambios",
			payload,
			format="json",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
		return response.data

	def test_group_accept_processes_all_pending_requests(self):
		motivo_grupo = "[#GRUPO:GACEPTAR01] Cobertura de dos dias"
		solicitud_1 = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_lunes.id,
			modo_compensacion="bolsa",
			motivo=motivo_grupo,
		)
		solicitud_2 = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_miercoles.id,
			modo_compensacion="bolsa",
			motivo=motivo_grupo,
		)

		self.client.force_authenticate(user=self.emp2)
		response = self.client.post(
			f"/api/intercambios/{solicitud_1['id']}/aceptar",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["solicitudes_procesadas"], 2)
		self.assertEqual(response.data["dias_transferidos"], 2)

		sol_1 = SolicitudIntercambio.objects.get(id=solicitud_1["id"])
		sol_2 = SolicitudIntercambio.objects.get(id=solicitud_2["id"])
		self.assertEqual(sol_1.estado, "aceptada")
		self.assertEqual(sol_2.estado, "aceptada")

		self.emp1_lunes.refresh_from_db()
		self.emp1_miercoles.refresh_from_db()
		self.assertEqual(self.emp1_lunes.usuario_id, self.emp2.id)
		self.assertEqual(self.emp1_miercoles.usuario_id, self.emp2.id)

		self.assertEqual(obtener_deuda(deudor=self.emp1, acreedor=self.emp2), 2)

	def test_single_day_accept_updates_assignment_and_debt(self):
		solicitud = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_lunes.id,
			modo_compensacion="bolsa",
			motivo="Cobertura puntual de un dia",
		)

		self.client.force_authenticate(user=self.emp2)
		response = self.client.post(
			f"/api/intercambios/{solicitud['id']}/aceptar",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["solicitudes_procesadas"], 1)
		self.assertEqual(response.data["dias_transferidos"], 1)

		sol = SolicitudIntercambio.objects.get(id=solicitud["id"])
		self.assertEqual(sol.estado, "aceptada")

		self.emp1_lunes.refresh_from_db()
		self.assertEqual(self.emp1_lunes.usuario_id, self.emp2.id)
		self.assertEqual(obtener_deuda(deudor=self.emp1, acreedor=self.emp2), 1)

	def test_single_day_immediate_same_slot_swap_succeeds_without_500(self):
		emp2_lunes = self._crear_asignacion(self.emp2, "lunes")
		solicitud = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_lunes.id,
			asignacion_destino_id=emp2_lunes.id,
			modo_compensacion="inmediata",
			motivo="Swap inmediata mismo dia",
		)

		self.client.force_authenticate(user=self.emp2)
		response = self.client.post(
			f"/api/intercambios/{solicitud['id']}/aceptar",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["solicitudes_procesadas"], 1)
		self.assertEqual(response.data["dias_transferidos"], 1)

		self.emp1_lunes.refresh_from_db()
		emp2_lunes.refresh_from_db()
		self.assertEqual(self.emp1_lunes.usuario_id, self.emp2.id)
		self.assertEqual(emp2_lunes.usuario_id, self.emp1.id)

	def test_single_day_bolsa_rejects_destination_assignment(self):
		emp2_lunes = self._crear_asignacion(self.emp2, "lunes")

		self.client.force_authenticate(user=self.emp1)
		response = self.client.post(
			"/api/intercambios",
			{
				"receptor_id": str(self.emp2.id),
				"tipo": "dia",
				"asignacion_origen_id": str(self.emp1_lunes.id),
				"asignacion_destino_id": str(emp2_lunes.id),
				"modo_compensacion": "bolsa",
				"motivo": "Bolsa sin destino",
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("modo bolsa", str(response.data).lower())

	def test_single_post_multi_day_immediate_creates_grouped_requests(self):
		emp1_martes = self._crear_asignacion(self.emp1, "martes")

		self.client.force_authenticate(user=self.emp1)
		response = self.client.post(
			"/api/intercambios",
			{
				"receptor_id": str(self.emp2.id),
				"tipo": "dia",
				"asignacion_origen_ids": [
					str(self.emp1_lunes.id),
					str(emp1_martes.id),
					str(self.emp1_miercoles.id),
				],
				"asignacion_destino_ids": [
					str(self.emp2_martes.id),
					str(self.emp2_jueves.id),
					str(self.emp2_viernes.id),
				],
				"modo_compensacion": "inmediata",
				"motivo": "Solicitud unica para tres dias",
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
		self.assertEqual(response.data.get("solicitudes_creadas"), 3)

		solicitudes = SolicitudIntercambio.objects.filter(
			solicitante=self.emp1,
			receptor=self.emp2,
			estado=EstadoSolicitud.PENDIENTE,
			motivo__startswith="[#GRUPO:",
		).order_by("fecha_creacion")
		self.assertEqual(solicitudes.count(), 3)

		for solicitud in solicitudes:
			self.assertEqual(solicitud.tipo, "dia")
			self.assertEqual(solicitud.modo_compensacion, "inmediata")
			self.assertIsNotNone(solicitud.asignacion_destino_id)

	def test_single_day_immediate_rejects_when_destination_generates_overlap(self):
		semana_destino = self._crear_semana_publicada()
		emp1_martes_otro = AsignacionTarde.objects.create(
			semana=semana_destino,
			usuario=self.emp1,
			dia="martes",
			hora_inicio=time(14, 0),
			hora_fin=time(22, 0),
		)
		emp2_martes_otro = AsignacionTarde.objects.create(
			semana=semana_destino,
			usuario=self.emp2,
			dia="martes",
			hora_inicio=time(14, 0),
			hora_fin=time(22, 0),
		)

		solicitud = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_lunes.id,
			asignacion_destino_id=emp2_martes_otro.id,
			modo_compensacion="inmediata",
			motivo="Swap con solape destino",
		)

		self.client.force_authenticate(user=self.emp2)
		response = self.client.post(
			f"/api/intercambios/{solicitud['id']}/aceptar",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("dia destino", str(response.data))

		solicitud_model = SolicitudIntercambio.objects.get(id=solicitud["id"])
		self.assertEqual(solicitud_model.estado, "pendiente")

		self.emp1_lunes.refresh_from_db()
		emp1_martes_otro.refresh_from_db()
		emp2_martes_otro.refresh_from_db()
		self.assertEqual(self.emp1_lunes.usuario_id, self.emp1.id)
		self.assertEqual(emp1_martes_otro.usuario_id, self.emp1.id)
		self.assertEqual(emp2_martes_otro.usuario_id, self.emp2.id)

	def test_group_immediate_cross_week_accept_updates_rotation_and_syncs_both_weeks(self):
		monday = date.today() - timedelta(days=date.today().weekday())
		inicio_origen = monday + timedelta(days=14)
		inicio_destino = monday + timedelta(days=21)

		iso_origen = inicio_origen.isocalendar()
		iso_destino = inicio_destino.isocalendar()

		semana_origen = CalendarioSemanal.objects.create(
			anio=iso_origen.year,
			numero_semana=iso_origen.week,
			fecha_inicio_semana=inicio_origen,
			fecha_fin_semana=inicio_origen + timedelta(days=4),
			estado="publicado",
		)

		semana_destino = CalendarioSemanal.objects.create(
			anio=iso_destino.year,
			numero_semana=iso_destino.week,
			fecha_inicio_semana=inicio_destino,
			fecha_fin_semana=inicio_destino + timedelta(days=4),
			estado="publicado",
		)

		dias = ["lunes", "martes", "miercoles", "jueves", "viernes"]
		asignaciones_origen = {
			dia: AsignacionTarde.objects.create(
				semana=semana_origen,
				usuario=self.emp1,
				dia=dia,
				hora_inicio=time(14, 0),
				hora_fin=time(22, 0),
			)
			for dia in dias
		}

		asignaciones_destino = {
			dia: AsignacionTarde.objects.create(
				semana=semana_destino,
				usuario=self.emp2,
				dia=dia,
				hora_inicio=time(14, 0),
				hora_fin=time(22, 0),
			)
			for dia in dias
		}

		motivo_grupo = "[#GRUPO:GCROSSWEEK03] Swap cruzado de tres dias"
		solicitud_lunes = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=asignaciones_origen["lunes"].id,
			asignacion_destino_id=asignaciones_destino["lunes"].id,
			modo_compensacion="inmediata",
			motivo=motivo_grupo,
		)
		self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=asignaciones_origen["martes"].id,
			asignacion_destino_id=asignaciones_destino["martes"].id,
			modo_compensacion="inmediata",
			motivo=motivo_grupo,
		)
		self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=asignaciones_origen["miercoles"].id,
			asignacion_destino_id=asignaciones_destino["miercoles"].id,
			modo_compensacion="inmediata",
			motivo=motivo_grupo,
		)

		self.client.force_authenticate(user=self.emp2)
		response = self.client.post(
			f"/api/intercambios/{solicitud_lunes['id']}/aceptar",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
		self.assertEqual(response.data["solicitudes_procesadas"], 3)
		self.assertEqual(response.data["dias_transferidos"], 3)
		self.assertEqual(len(response.data.get("calendar", [])), 4)

		self.assertEqual(
			AsignacionTarde.objects.filter(semana=semana_origen, usuario=self.emp1).count(),
			2,
		)
		self.assertEqual(
			AsignacionTarde.objects.filter(semana=semana_origen, usuario=self.emp2).count(),
			3,
		)
		self.assertEqual(
			AsignacionTarde.objects.filter(semana=semana_destino, usuario=self.emp1).count(),
			3,
		)
		self.assertEqual(
			AsignacionTarde.objects.filter(semana=semana_destino, usuario=self.emp2).count(),
			2,
		)

		self.client.force_authenticate(user=self.emp1)
		rotacion_response = self.client.get("/api/semanas/rotacion", **self.host_headers)
		self.assertEqual(rotacion_response.status_code, status.HTTP_200_OK, rotacion_response.data)

		rotacion_por_semana = {item["semana_id"]: item for item in rotacion_response.data}
		resumen_origen = rotacion_por_semana[str(semana_origen.id)]
		resumen_destino = rotacion_por_semana[str(semana_destino.id)]

		conteo_origen = {item["usuario_id"]: item["total_dias"] for item in resumen_origen["empleados"]}
		conteo_destino = {item["usuario_id"]: item["total_dias"] for item in resumen_destino["empleados"]}

		self.assertEqual(conteo_origen[str(self.emp1.id)], 2)
		self.assertEqual(conteo_origen[str(self.emp2.id)], 3)
		self.assertEqual(conteo_destino[str(self.emp1.id)], 3)
		self.assertEqual(conteo_destino[str(self.emp2.id)], 2)

	def test_three_day_group_reject_keeps_assignments_unchanged(self):
		emp1_martes = self._crear_asignacion(self.emp1, "martes")
		motivo_grupo = "[#GRUPO:GRECHAZAR03] Solicitud de tres dias"

		solicitud_1 = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_lunes.id,
			modo_compensacion="bolsa",
			motivo=motivo_grupo,
		)
		solicitud_2 = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=emp1_martes.id,
			modo_compensacion="bolsa",
			motivo=motivo_grupo,
		)
		solicitud_3 = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_miercoles.id,
			modo_compensacion="bolsa",
			motivo=motivo_grupo,
		)

		self.client.force_authenticate(user=self.emp2)
		response = self.client.post(
			f"/api/intercambios/{solicitud_2['id']}/rechazar",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["solicitudes_procesadas"], 3)

		for solicitud_id in [solicitud_1["id"], solicitud_2["id"], solicitud_3["id"]]:
			sol = SolicitudIntercambio.objects.get(id=solicitud_id)
			self.assertEqual(sol.estado, "rechazada")

		self.emp1_lunes.refresh_from_db()
		emp1_martes.refresh_from_db()
		self.emp1_miercoles.refresh_from_db()
		self.assertEqual(self.emp1_lunes.usuario_id, self.emp1.id)
		self.assertEqual(emp1_martes.usuario_id, self.emp1.id)
		self.assertEqual(self.emp1_miercoles.usuario_id, self.emp1.id)
		self.assertEqual(obtener_deuda(deudor=self.emp1, acreedor=self.emp2), 0)

	def test_weekly_immediate_accept_swaps_full_week(self):
		semana_swap = self._crear_semana_publicada()
		dias = ["lunes", "martes", "miercoles", "jueves", "viernes"]
		emp1_semana = {
			dia: AsignacionTarde.objects.create(
				semana=semana_swap,
				usuario=self.emp1,
				dia=dia,
				hora_inicio=time(14, 0),
				hora_fin=time(22, 0),
			)
			for dia in dias
		}
		emp2_semana = {
			dia: AsignacionTarde.objects.create(
				semana=semana_swap,
				usuario=self.emp2,
				dia=dia,
				hora_inicio=time(14, 0),
				hora_fin=time(22, 0),
			)
			for dia in dias
		}

		solicitud = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			tipo="semana",
			asignacion_origen_id=emp1_semana["lunes"].id,
			asignacion_destino_id=emp2_semana["lunes"].id,
			modo_compensacion="inmediata",
			motivo="Intercambio semanal completo",
		)

		self.client.force_authenticate(user=self.emp2)
		response = self.client.post(
			f"/api/intercambios/{solicitud['id']}/aceptar",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["solicitudes_procesadas"], 1)
		self.assertEqual(response.data["dias_transferidos"], 5)

		for dia in dias:
			emp1_semana[dia].refresh_from_db()
			emp2_semana[dia].refresh_from_db()
			self.assertEqual(emp1_semana[dia].usuario_id, self.emp2.id)
			self.assertEqual(emp2_semana[dia].usuario_id, self.emp1.id)

		sol = SolicitudIntercambio.objects.get(id=solicitud["id"])
		self.assertEqual(sol.estado, "aceptada")
		self.assertEqual(obtener_deuda(deudor=self.emp1, acreedor=self.emp2), 0)

	def test_group_reject_rejects_all_pending_requests(self):
		motivo_grupo = "[#GRUPO:GRECHAZAR01] Solicitud agrupada"
		solicitud_1 = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_lunes.id,
			modo_compensacion="bolsa",
			motivo=motivo_grupo,
		)
		solicitud_2 = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_miercoles.id,
			modo_compensacion="bolsa",
			motivo=motivo_grupo,
		)

		self.client.force_authenticate(user=self.emp2)
		response = self.client.post(
			f"/api/intercambios/{solicitud_1['id']}/rechazar",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["solicitudes_procesadas"], 2)

		sol_1 = SolicitudIntercambio.objects.get(id=solicitud_1["id"])
		sol_2 = SolicitudIntercambio.objects.get(id=solicitud_2["id"])
		self.assertEqual(sol_1.estado, "rechazada")
		self.assertEqual(sol_2.estado, "rechazada")

	def test_group_cancel_cancels_all_pending_requests(self):
		motivo_grupo = "[#GRUPO:GCANCELAR01] Solicitud agrupada"
		solicitud_1 = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_lunes.id,
			modo_compensacion="bolsa",
			motivo=motivo_grupo,
		)
		solicitud_2 = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_miercoles.id,
			modo_compensacion="bolsa",
			motivo=motivo_grupo,
		)

		self.client.force_authenticate(user=self.emp1)
		response = self.client.post(
			f"/api/intercambios/{solicitud_2['id']}/cancelar",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK)
		self.assertEqual(response.data["solicitudes_procesadas"], 2)

		sol_1 = SolicitudIntercambio.objects.get(id=solicitud_1["id"])
		sol_2 = SolicitudIntercambio.objects.get(id=solicitud_2["id"])
		self.assertEqual(sol_1.estado, "cancelada")
		self.assertEqual(sol_2.estado, "cancelada")

	def test_bolsa_compensacion_invalida_por_deuda_insuficiente(self):
		solicitud = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_lunes.id,
			modo_compensacion="bolsa",
			motivo="Generar deuda inicial",
		)

		self.client.force_authenticate(user=self.emp2)
		accept_response = self.client.post(
			f"/api/intercambios/{solicitud['id']}/aceptar",
			**self.host_headers,
		)
		self.assertEqual(accept_response.status_code, status.HTTP_200_OK)
		self.assertEqual(obtener_deuda(deudor=self.emp1, acreedor=self.emp2), 1)

		compensar_response = self.client.post(
			"/api/bolsa/compensar",
			{
				"usuario_id": str(self.emp1.id),
				"tipo": "semana",
				"asignacion_origen_id": str(self.emp2_martes.id),
				"motivo": "Compensacion semanal",
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(compensar_response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("No se puede compensar", str(compensar_response.data))

	def test_bolsa_saldos_y_movimientos_consistentes_tras_compensar(self):
		motivo_grupo = "[#GRUPO:GDEUDA02] Cobertura agrupada"
		solicitud_1 = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_lunes.id,
			modo_compensacion="bolsa",
			motivo=motivo_grupo,
		)
		self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_miercoles.id,
			modo_compensacion="bolsa",
			motivo=motivo_grupo,
		)

		self.client.force_authenticate(user=self.emp2)
		accept_response = self.client.post(
			f"/api/intercambios/{solicitud_1['id']}/aceptar",
			**self.host_headers,
		)
		self.assertEqual(accept_response.status_code, status.HTTP_200_OK)
		self.assertEqual(obtener_deuda(deudor=self.emp1, acreedor=self.emp2), 2)

		compensar_response = self.client.post(
			"/api/bolsa/compensar",
			{
				"usuario_id": str(self.emp1.id),
				"tipo": "dia",
				"asignacion_origen_id": str(self.emp2_viernes.id),
				"motivo": "Compensar un dia",
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(compensar_response.status_code, status.HTTP_201_CREATED)
		compensacion_id = compensar_response.data["id"]

		self.client.force_authenticate(user=self.emp1)
		aceptar_compensacion_response = self.client.post(
			f"/api/intercambios/{compensacion_id}/aceptar",
			**self.host_headers,
		)
		self.assertEqual(aceptar_compensacion_response.status_code, status.HTTP_200_OK)

		self.assertEqual(obtener_deuda(deudor=self.emp1, acreedor=self.emp2), 1)

		self.client.force_authenticate(user=self.emp2)
		saldo_emp2_response = self.client.get(
			f"/api/bolsa/saldos/{self.emp1.id}",
			**self.host_headers,
		)
		self.assertEqual(saldo_emp2_response.status_code, status.HTTP_200_OK)
		self.assertEqual(saldo_emp2_response.data["me_deben"], 1)
		self.assertEqual(saldo_emp2_response.data["debo"], 0)

		self.client.force_authenticate(user=self.emp1)
		saldo_emp1_response = self.client.get(
			f"/api/bolsa/saldos/{self.emp2.id}",
			**self.host_headers,
		)
		self.assertEqual(saldo_emp1_response.status_code, status.HTTP_200_OK)
		self.assertEqual(saldo_emp1_response.data["me_deben"], 0)
		self.assertEqual(saldo_emp1_response.data["debo"], 1)

		self.assertEqual(
			BolsaDiasMovimiento.objects.filter(
				origen_usuario=self.emp1,
				destino_usuario=self.emp2,
				tipo="genera_deuda",
			).count(),
			2,
		)
		self.assertEqual(
			BolsaDiasMovimiento.objects.filter(
				origen_usuario=self.emp1,
				destino_usuario=self.emp2,
				tipo="compensa_deuda",
			).count(),
			1,
		)

		self.emp2_viernes.refresh_from_db()
		self.assertEqual(self.emp2_viernes.usuario_id, self.emp1.id)

	def test_bolsa_compensacion_multi_dia_en_una_sola_peticion(self):
		semana_extra = self._crear_semana_publicada()
		emp1_extra_lunes = AsignacionTarde.objects.create(
			semana=semana_extra,
			usuario=self.emp1,
			dia="lunes",
			hora_inicio=time(14, 0),
			hora_fin=time(22, 0),
		)

		motivo_grupo = "[#GRUPO:GDEUDA03] Cobertura agrupada tres dias"
		solicitud_1 = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_lunes.id,
			modo_compensacion="bolsa",
			motivo=motivo_grupo,
		)
		self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_miercoles.id,
			modo_compensacion="bolsa",
			motivo=motivo_grupo,
		)
		self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=emp1_extra_lunes.id,
			modo_compensacion="bolsa",
			motivo=motivo_grupo,
		)

		self.client.force_authenticate(user=self.emp2)
		accept_response = self.client.post(
			f"/api/intercambios/{solicitud_1['id']}/aceptar",
			**self.host_headers,
		)
		self.assertEqual(accept_response.status_code, status.HTTP_200_OK)
		self.assertEqual(obtener_deuda(deudor=self.emp1, acreedor=self.emp2), 3)

		compensar_response = self.client.post(
			"/api/bolsa/compensar",
			{
				"usuario_id": str(self.emp1.id),
				"tipo": "dia",
				"asignacion_origen_ids": [
					str(self.emp2_martes.id),
					str(self.emp2_jueves.id),
					str(self.emp2_viernes.id),
				],
				"motivo": "Compensar tres dias en una sola solicitud",
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(compensar_response.status_code, status.HTTP_201_CREATED, compensar_response.data)
		self.assertEqual(compensar_response.data.get("solicitudes_creadas"), 3)
		solicitudes_ids = compensar_response.data.get("solicitudes_ids", [])
		self.assertEqual(len(solicitudes_ids), 3)

		pendientes = SolicitudIntercambio.objects.filter(
			id__in=solicitudes_ids,
			estado=EstadoSolicitud.PENDIENTE,
		)
		self.assertEqual(pendientes.count(), 3)
		for solicitud in pendientes:
			self.assertTrue(solicitud.motivo.startswith("[#GRUPO:"))

		self.client.force_authenticate(user=self.emp1)
		aceptar_compensacion_response = self.client.post(
			f"/api/intercambios/{solicitudes_ids[0]}/aceptar",
			**self.host_headers,
		)
		self.assertEqual(aceptar_compensacion_response.status_code, status.HTTP_200_OK)
		self.assertEqual(aceptar_compensacion_response.data["solicitudes_procesadas"], 3)
		self.assertEqual(aceptar_compensacion_response.data["dias_transferidos"], 3)

		self.assertEqual(obtener_deuda(deudor=self.emp1, acreedor=self.emp2), 0)

		self.emp2_martes.refresh_from_db()
		self.emp2_jueves.refresh_from_db()
		self.emp2_viernes.refresh_from_db()
		self.assertEqual(self.emp2_martes.usuario_id, self.emp1.id)
		self.assertEqual(self.emp2_jueves.usuario_id, self.emp1.id)
		self.assertEqual(self.emp2_viernes.usuario_id, self.emp1.id)

	def test_bolsa_compensacion_deudor_inicia_desde_bolsa_y_no_se_autocancela(self):
		solicitud = self._crear_intercambio(
			solicitante=self.emp1,
			receptor=self.emp2,
			asignacion_origen_id=self.emp1_lunes.id,
			modo_compensacion="bolsa",
			motivo="Generar deuda inicial para devolucion",
		)

		self.client.force_authenticate(user=self.emp2)
		accept_response = self.client.post(
			f"/api/intercambios/{solicitud['id']}/aceptar",
			**self.host_headers,
		)
		self.assertEqual(accept_response.status_code, status.HTTP_200_OK)
		self.assertEqual(obtener_deuda(deudor=self.emp1, acreedor=self.emp2), 1)

		self.client.force_authenticate(user=self.emp1)
		compensar_response = self.client.post(
			"/api/bolsa/compensar",
			{
				"usuario_id": str(self.emp2.id),
				"direccion": "devolver",
				"tipo": "dia",
				"asignacion_origen_id": str(self.emp2_viernes.id),
				"motivo": "Quiero devolver un dia desde Bolsa",
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(compensar_response.status_code, status.HTTP_201_CREATED, compensar_response.data)
		compensacion_id = compensar_response.data["id"]

		# Verifica que la limpieza de pendientes no invalida solicitudes de compensacion
		# iniciadas por deudor cuando la asignacion origen pertenece al acreedor.
		mias_response = self.client.get("/api/intercambios/mias", **self.host_headers)
		self.assertEqual(mias_response.status_code, status.HTTP_200_OK)
		pendiente = SolicitudIntercambio.objects.get(id=compensacion_id)
		self.assertEqual(pendiente.estado, "pendiente")
		self.assertEqual(pendiente.solicitante_id, self.emp1.id)
		self.assertEqual(pendiente.receptor_id, self.emp2.id)
		self.assertEqual(pendiente.rol_solicitante_compensacion, "deudor")

		self.client.force_authenticate(user=self.emp2)
		aceptar_compensacion_response = self.client.post(
			f"/api/intercambios/{compensacion_id}/aceptar",
			**self.host_headers,
		)
		self.assertEqual(aceptar_compensacion_response.status_code, status.HTTP_200_OK)

		self.assertEqual(obtener_deuda(deudor=self.emp1, acreedor=self.emp2), 0)
		self.emp2_viernes.refresh_from_db()
		self.assertEqual(self.emp2_viernes.usuario_id, self.emp1.id)


class PlanificacionAutomaticaTests(APITestCase):
	host_headers = {"HTTP_HOST": "localhost"}
	weekdays = ["lunes", "martes", "miercoles", "jueves", "viernes"]

	def setUp(self):
		user_model = get_user_model()
		self.admin = user_model.objects.create_user(
			username="admin-plan@test.local",
			email="admin-plan@test.local",
			password="trebujena123",
			nombre="Admin Plan",
			rol="admin",
			activo=True,
		)

		self.empleados = [
			user_model.objects.create_user(
				username=f"empleado-plan-{index}@test.local",
				email=f"empleado-plan-{index}@test.local",
				password="trebujena123",
				nombre=f"Empleado Plan {index}",
				rol="empleado",
				activo=True,
			)
			for index in range(1, 6)
		]

	def test_generar_mes_rechaza_mas_de_cuatro_empleados(self):
		self.client.force_authenticate(user=self.admin)
		response = self.client.post(
			"/api/semanas/generar-mes",
			{
				"anio": 2026,
				"mes": 4,
				"empleado_ids": [str(item.id) for item in self.empleados],
				"estado": "publicado",
				"estrategia_conflicto": "replace",
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("maximo 4 empleados", str(response.data))

	def test_generar_mes_aplica_rotacion_semanal(self):
		self.client.force_authenticate(user=self.admin)
		empleado_ids = [str(item.id) for item in self.empleados[:4]]

		response = self.client.post(
			"/api/semanas/generar-mes",
			{
				"anio": 2026,
				"mes": 4,
				"empleado_ids": empleado_ids,
				"estado": "publicado",
				"estrategia_conflicto": "replace",
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
		self.assertGreater(response.data["semanas_objetivo"], 0)

		for index, week_detail in enumerate(response.data["semanas_detalle"]):
			expected_employee_id = empleado_ids[index % len(empleado_ids)]
			self.assertEqual(week_detail["empleado_id"], expected_employee_id)

			week = CalendarioSemanal.objects.get(id=week_detail["semana_id"])
			assignments = AsignacionTarde.objects.filter(
				semana=week,
				dia__in=self.weekdays,
			)
			self.assertEqual(assignments.count(), 5)
			self.assertEqual(
				set(str(item) for item in assignments.values_list("usuario_id", flat=True)),
				{expected_employee_id},
			)

	def test_generar_mes_ignora_skip_y_aplica_replace(self):
		self.client.force_authenticate(user=self.admin)

		primera_generacion = self.client.post(
			"/api/semanas/generar-mes",
			{
				"anio": 2026,
				"mes": 4,
				"empleado_ids": [str(self.empleados[0].id)],
				"estado": "publicado",
				"estrategia_conflicto": "replace",
			},
			format="json",
			**self.host_headers,
		)
		self.assertEqual(primera_generacion.status_code, status.HTTP_200_OK, primera_generacion.data)

		segunda_generacion = self.client.post(
			"/api/semanas/generar-mes",
			{
				"anio": 2026,
				"mes": 4,
				"empleado_ids": [str(self.empleados[1].id)],
				"estado": "publicado",
				"estrategia_conflicto": "skip",
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(segunda_generacion.status_code, status.HTTP_200_OK, segunda_generacion.data)
		self.assertEqual(segunda_generacion.data["asignaciones_omitidas"], 0)

		expected_user_id = str(self.empleados[1].id)
		for week_detail in segunda_generacion.data["semanas_detalle"]:
			week = CalendarioSemanal.objects.get(id=week_detail["semana_id"])
			assignments = AsignacionTarde.objects.filter(semana=week, dia__in=self.weekdays)
			self.assertEqual(assignments.count(), 5)
			self.assertEqual(
				set(str(item) for item in assignments.values_list("usuario_id", flat=True)),
				{expected_user_id},
			)

	def test_semanas_rotacion_devuelve_principal_por_semana(self):
		self.client.force_authenticate(user=self.admin)
		generacion_response = self.client.post(
			"/api/semanas/generar-mes",
			{
				"anio": 2026,
				"mes": 4,
				"empleado_ids": [str(self.empleados[0].id), str(self.empleados[1].id)],
				"estado": "publicado",
				"estrategia_conflicto": "replace",
			},
			format="json",
			**self.host_headers,
		)
		self.assertEqual(generacion_response.status_code, status.HTTP_200_OK, generacion_response.data)

		rotacion_response = self.client.get("/api/semanas/rotacion", **self.host_headers)
		self.assertEqual(rotacion_response.status_code, status.HTTP_200_OK, rotacion_response.data)

		rotacion_por_semana = {
			item["semana_id"]: item
			for item in rotacion_response.data
		}

		for week_detail in generacion_response.data["semanas_detalle"]:
			week_summary = rotacion_por_semana.get(week_detail["semana_id"])
			self.assertIsNotNone(week_summary)
			self.assertEqual(week_summary["principal_usuario_id"], week_detail["empleado_id"])
			self.assertEqual(week_summary["principal_total_dias"], 5)

	def test_generar_anio_crea_todas_las_semanas_iso(self):
		self.client.force_authenticate(user=self.admin)

		response = self.client.post(
			"/api/semanas/generar-anio",
			{
				"anio": 2026,
				"empleado_ids": [str(item.id) for item in self.empleados[:3]],
				"estado": "borrador",
				"estrategia_conflicto": "skip",
			},
			format="json",
			**self.host_headers,
		)

		total_iso_weeks = date(2026, 12, 28).isocalendar().week
		self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
		self.assertEqual(response.data["semanas_objetivo"], total_iso_weeks)
		self.assertEqual(CalendarioSemanal.objects.filter(anio=2026).count(), total_iso_weeks)
		self.assertEqual(
			AsignacionTarde.objects.filter(semana__anio=2026, dia__in=self.weekdays).count(),
			total_iso_weeks * 5,
		)

	def test_generar_anio_replace_recalcula_con_lista_editada(self):
		self.client.force_authenticate(user=self.admin)
		self.client.post(
			"/api/semanas/generar-anio",
			{
				"anio": 2026,
				"empleado_ids": [str(self.empleados[0].id), str(self.empleados[1].id)],
				"estado": "publicado",
				"estrategia_conflicto": "replace",
			},
			format="json",
			**self.host_headers,
		)

		response = self.client.post(
			"/api/semanas/generar-anio",
			{
				"anio": 2026,
				"empleado_ids": [str(self.empleados[2].id)],
				"estado": "publicado",
				"estrategia_conflicto": "replace",
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
		self.assertGreater(response.data["semanas_actualizadas"], 0)

		expected_user_id = str(self.empleados[2].id)
		for week in CalendarioSemanal.objects.filter(anio=2026):
			assignments = AsignacionTarde.objects.filter(semana=week, dia__in=self.weekdays)
			self.assertEqual(assignments.count(), 5)
			self.assertEqual(
				set(str(item) for item in assignments.values_list("usuario_id", flat=True)),
				{expected_user_id},
			)

	def test_generar_anio_rechaza_usuarios_que_no_son_empleados(self):
		self.client.force_authenticate(user=self.admin)

		response = self.client.post(
			"/api/semanas/generar-anio",
			{
				"anio": 2026,
				"empleado_ids": [str(self.admin.id), str(self.empleados[0].id)],
				"estado": "publicado",
				"estrategia_conflicto": "replace",
			},
			format="json",
			**self.host_headers,
		)

		self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
		self.assertIn("rol empleado", str(response.data))
