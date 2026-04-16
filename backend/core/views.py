import re

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from .google_calendar import (
	build_google_connect_url,
	disconnect_google,
	exchange_code_for_tokens,
	sync_all_for_user,
	sync_assignments_for_user_week,
)
from .models import (
	AsignacionTarde,
	BolsaDiasMovimiento,
	BolsaDiasSaldo,
	CalendarioSemanal,
	EstadoSolicitud,
	EstadoSemana,
	RolSolicitanteCompensacion,
	SolicitudIntercambio,
	TipoEventoAuditoria,
	Usuario,
)
from .planning import CONFLICT_REPLACE, generate_month_schedule, generate_year_schedule
from .serializers import (
	AsignacionTardeSerializer,
	BolsaCompensarSerializer,
	BolsaMovimientoSerializer,
	CalendarioSemanalSerializer,
	GenerarCalendarioAnioSerializer,
	GenerarCalendarioMesSerializer,
	GoogleCallbackSerializer,
	IntercambiosMiasSerializer,
	RegistroSerializer,
	SolicitudIntercambioCreateSerializer,
	SolicitudIntercambioSerializer,
	UsuarioAdminSerializer,
	UsuarioSerializer,
)
from .services import aceptar_intercambio, registrar_auditoria


GROUP_TOKEN_REGEX = re.compile(r"^\[#GRUPO:([^\]]+)\]\s*")


def _require_roles(user, roles):
	if user.rol not in roles:
		raise PermissionDenied("No tienes permisos para esta accion.")


def _extract_group_token(motivo):
	if not motivo:
		return None
	match = GROUP_TOKEN_REGEX.match(motivo)
	if not match:
		return None
	token = match.group(1).strip()
	return token or None


def _solicitudes_pendientes_relacionadas(solicitud):
	token = _extract_group_token(solicitud.motivo)
	if not token:
		return SolicitudIntercambio.objects.filter(
			id=solicitud.id,
			estado=EstadoSolicitud.PENDIENTE,
		)

	prefijo = f"[#GRUPO:{token}]"
	return SolicitudIntercambio.objects.filter(
		estado=EstadoSolicitud.PENDIENTE,
		solicitante_id=solicitud.solicitante_id,
		receptor_id=solicitud.receptor_id,
		motivo__startswith=prefijo,
	)


def _cancelar_pendientes_desactualizadas():
	pendientes = SolicitudIntercambio.objects.filter(
		estado=EstadoSolicitud.PENDIENTE,
	).select_related("asignacion_origen", "asignacion_destino")

	stale_ids = []
	for solicitud in pendientes:
		esperado_origen = solicitud.solicitante_id
		if (
			solicitud.es_compensacion
			and solicitud.rol_solicitante_compensacion == RolSolicitanteCompensacion.DEUDOR
		):
			esperado_origen = solicitud.receptor_id

		if solicitud.asignacion_origen.usuario_id != esperado_origen:
			stale_ids.append(solicitud.id)
			continue

		if solicitud.asignacion_destino_id and solicitud.asignacion_destino:
			esperado_destino = (
				solicitud.receptor_id
				if esperado_origen == solicitud.solicitante_id
				else solicitud.solicitante_id
			)
			if solicitud.asignacion_destino.usuario_id != esperado_destino:
				stale_ids.append(solicitud.id)

	if not stale_ids:
		return 0

	SolicitudIntercambio.objects.filter(id__in=stale_ids).update(
		estado=EstadoSolicitud.CANCELADA,
		fecha_respuesta=timezone.now(),
	)
	return len(stale_ids)


class RegisterView(generics.CreateAPIView):
	permission_classes = [permissions.AllowAny]
	serializer_class = RegistroSerializer


class MeView(APIView):
	def get(self, request):
		return Response(UsuarioSerializer(request.user).data)


class UsuariosView(APIView):
	def get(self, request):
		_require_roles(request.user, {"admin", "supervisor"})
		usuarios = Usuario.objects.all().order_by("nombre", "email")
		return Response(UsuarioSerializer(usuarios, many=True).data)

	def post(self, request):
		_require_roles(request.user, {"admin", "supervisor"})
		serializer = UsuarioAdminSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		usuario = serializer.save()
		return Response(UsuarioSerializer(usuario).data, status=status.HTTP_201_CREATED)


class UsuarioDetailView(APIView):
	def get(self, request, usuario_id):
		_require_roles(request.user, {"admin", "supervisor"})
		usuario = Usuario.objects.filter(id=usuario_id).first()
		if not usuario:
			return Response({"detail": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)
		return Response(UsuarioSerializer(usuario).data)

	def patch(self, request, usuario_id):
		_require_roles(request.user, {"admin", "supervisor"})
		usuario = Usuario.objects.filter(id=usuario_id).first()
		if not usuario:
			return Response({"detail": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)

		serializer = UsuarioAdminSerializer(usuario, data=request.data, partial=True)
		serializer.is_valid(raise_exception=True)
		usuario = serializer.save()
		return Response(UsuarioSerializer(usuario).data)

	def delete(self, request, usuario_id):
		_require_roles(request.user, {"admin", "supervisor"})
		usuario = Usuario.objects.filter(id=usuario_id).first()
		if not usuario:
			return Response({"detail": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)

		if usuario.id == request.user.id:
			return Response(
				{"detail": "No puedes desactivar ni eliminar tu propio usuario."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		modo = request.query_params.get("modo", "").strip().lower()
		if modo == "eliminar":
			_require_roles(request.user, {"admin"})
			usuario.delete()
			return Response(status=status.HTTP_204_NO_CONTENT)

		usuario.activo = False
		usuario.is_active = False
		usuario.save(update_fields=["activo", "is_active"])
		return Response(status=status.HTTP_204_NO_CONTENT)


class SemanaListCreateView(APIView):
	def get(self, request):
		semanas = CalendarioSemanal.objects.all().order_by("-anio", "-numero_semana")
		return Response(CalendarioSemanalSerializer(semanas, many=True).data)

	def post(self, request):
		_require_roles(request.user, {"admin", "supervisor"})
		serializer = CalendarioSemanalSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		semana = serializer.save()
		return Response(CalendarioSemanalSerializer(semana).data, status=status.HTTP_201_CREATED)


class SemanaGenerarMesView(APIView):
	def post(self, request):
		_require_roles(request.user, {"admin", "supervisor"})
		serializer = GenerarCalendarioMesSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		estrategia_conflicto = CONFLICT_REPLACE

		resumen = generate_month_schedule(
			anio=serializer.validated_data["anio"],
			mes=serializer.validated_data["mes"],
			empleados=serializer.validated_data["empleados"],
			estado=serializer.validated_data["estado"],
			estrategia_conflicto=estrategia_conflicto,
		)

		registrar_auditoria(
			tipo_evento=TipoEventoAuditoria.PUBLICAR_SEMANA,
			usuario=request.user,
			entidad="calendario_generacion",
			id_entidad=f"mes-{serializer.validated_data['anio']}-{serializer.validated_data['mes']}",
			metadata={
				"tipo": "mes",
				"anio": serializer.validated_data["anio"],
				"mes": serializer.validated_data["mes"],
				"empleados": [str(item.id) for item in serializer.validated_data["empleados"]],
				"estrategia_conflicto": estrategia_conflicto,
				"resumen": {
					"semanas_objetivo": resumen["semanas_objetivo"],
					"semanas_creadas": resumen["semanas_creadas"],
					"semanas_actualizadas": resumen["semanas_actualizadas"],
				},
			},
		)

		return Response(resumen, status=status.HTTP_200_OK)


class SemanaGenerarAnioView(APIView):
	def post(self, request):
		_require_roles(request.user, {"admin", "supervisor"})
		serializer = GenerarCalendarioAnioSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)

		resumen = generate_year_schedule(
			anio=serializer.validated_data["anio"],
			empleados=serializer.validated_data["empleados"],
			estado=serializer.validated_data["estado"],
			estrategia_conflicto=serializer.validated_data["estrategia_conflicto"],
		)

		registrar_auditoria(
			tipo_evento=TipoEventoAuditoria.PUBLICAR_SEMANA,
			usuario=request.user,
			entidad="calendario_generacion",
			id_entidad=f"anio-{serializer.validated_data['anio']}",
			metadata={
				"tipo": "anio",
				"anio": serializer.validated_data["anio"],
				"empleados": [str(item.id) for item in serializer.validated_data["empleados"]],
				"estrategia_conflicto": serializer.validated_data["estrategia_conflicto"],
				"resumen": {
					"semanas_objetivo": resumen["semanas_objetivo"],
					"semanas_creadas": resumen["semanas_creadas"],
					"semanas_actualizadas": resumen["semanas_actualizadas"],
				},
			},
		)

		return Response(resumen, status=status.HTTP_200_OK)


class SemanaDetailView(APIView):
	def get(self, request, semana_id):
		semana = CalendarioSemanal.objects.filter(id=semana_id).first()
		if not semana:
			return Response({"detail": "Semana no encontrada."}, status=status.HTTP_404_NOT_FOUND)

		data = CalendarioSemanalSerializer(semana).data
		data["asignaciones"] = AsignacionTardeSerializer(
			AsignacionTarde.objects.filter(semana=semana).select_related("usuario"),
			many=True,
		).data
		return Response(data)


class SemanaRotacionView(APIView):
	def get(self, request):
		semanas = list(CalendarioSemanal.objects.all().order_by("anio", "numero_semana"))
		dias_laborales = ["lunes", "martes", "miercoles", "jueves", "viernes"]

		conteo_por_semana = {}
		for row in (
			AsignacionTarde.objects.values("semana_id", "usuario_id", "usuario__nombre")
			.annotate(total_dias=Count("id"))
			.order_by("semana_id", "-total_dias", "usuario__nombre")
		):
			semana_id = str(row["semana_id"])
			conteo_por_semana.setdefault(semana_id, []).append(
				{
					"usuario_id": str(row["usuario_id"]),
					"usuario_nombre": row["usuario__nombre"],
					"total_dias": row["total_dias"],
				}
			)

		detalle_dias_por_semana = {}
		for row in (
			AsignacionTarde.objects.values("semana_id", "dia", "usuario_id", "usuario__nombre")
			.annotate(total_turnos=Count("id"))
			.order_by("semana_id", "dia", "-total_turnos", "usuario__nombre")
		):
			semana_id = str(row["semana_id"])
			dia = row["dia"]
			detalle_dias_por_semana.setdefault(semana_id, {})
			detalle_dias_por_semana[semana_id].setdefault(dia, []).append(
				{
					"usuario_id": str(row["usuario_id"]),
					"usuario_nombre": row["usuario__nombre"],
					"total_turnos": row["total_turnos"],
				}
			)

		resumen = []
		for semana in semanas:
			empleados = conteo_por_semana.get(str(semana.id), [])
			principal = empleados[0] if empleados else None
			dias_semana = detalle_dias_por_semana.get(str(semana.id), {})
			detalle_dias = []
			for dia in dias_laborales:
				usuarios_dia = dias_semana.get(dia, [])
				principal_dia = usuarios_dia[0] if usuarios_dia else None
				detalle_dias.append(
					{
						"dia": dia,
						"usuario_id": principal_dia["usuario_id"] if principal_dia else None,
						"usuario_nombre": principal_dia["usuario_nombre"] if principal_dia else None,
						"usuarios": usuarios_dia,
					}
				)
			resumen.append(
				{
					"semana_id": str(semana.id),
					"anio": semana.anio,
					"numero_semana": semana.numero_semana,
					"fecha_inicio_semana": semana.fecha_inicio_semana,
					"fecha_fin_semana": semana.fecha_fin_semana,
					"principal_usuario_id": principal["usuario_id"] if principal else None,
					"principal_usuario_nombre": principal["usuario_nombre"] if principal else None,
					"principal_total_dias": principal["total_dias"] if principal else 0,
					"empleados": empleados,
					"dias": detalle_dias,
				}
			)

		return Response(resumen)


class SemanaPublicarView(APIView):
	def post(self, request, semana_id):
		_require_roles(request.user, {"admin", "supervisor"})
		semana = CalendarioSemanal.objects.filter(id=semana_id).first()
		if not semana:
			return Response({"detail": "Semana no encontrada."}, status=status.HTTP_404_NOT_FOUND)

		semana.estado = EstadoSemana.PUBLICADO
		semana.save(update_fields=["estado"])

		registrar_auditoria(
			tipo_evento=TipoEventoAuditoria.PUBLICAR_SEMANA,
			usuario=request.user,
			entidad="semana",
			id_entidad=semana.id,
			metadata={"accion": "publicar"},
		)

		return Response({"detail": "Semana publicada."})


class AsignacionCreateView(APIView):
	def post(self, request):
		_require_roles(request.user, {"admin", "supervisor"})
		serializer = AsignacionTardeSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		asignacion = serializer.save()
		return Response(AsignacionTardeSerializer(asignacion).data, status=status.HTTP_201_CREATED)


class AsignacionUpdateView(APIView):
	def patch(self, request, asignacion_id):
		_require_roles(request.user, {"admin", "supervisor"})
		asignacion = AsignacionTarde.objects.filter(id=asignacion_id).first()
		if not asignacion:
			return Response({"detail": "Asignacion no encontrada."}, status=status.HTTP_404_NOT_FOUND)

		serializer = AsignacionTardeSerializer(asignacion, data=request.data, partial=True)
		serializer.is_valid(raise_exception=True)
		asignacion = serializer.save()
		return Response(AsignacionTardeSerializer(asignacion).data)

	def delete(self, request, asignacion_id):
		_require_roles(request.user, {"admin", "supervisor"})
		asignacion = AsignacionTarde.objects.filter(id=asignacion_id).first()
		if not asignacion:
			return Response({"detail": "Asignacion no encontrada."}, status=status.HTTP_404_NOT_FOUND)

		asignacion.delete()
		return Response(status=status.HTTP_204_NO_CONTENT)


class MisAsignacionesView(APIView):
	def get(self, request):
		semana_id = request.query_params.get("semana_id")
		queryset = AsignacionTarde.objects.filter(usuario=request.user).select_related("semana", "usuario")
		if semana_id:
			queryset = queryset.filter(semana_id=semana_id)
		queryset = queryset.order_by("-semana__anio", "-semana__numero_semana", "dia")
		return Response(AsignacionTardeSerializer(queryset, many=True).data)


class IntercambioCreateView(APIView):
	def post(self, request):
		serializer = SolicitudIntercambioCreateSerializer(data=request.data, context={"request": request})
		serializer.is_valid(raise_exception=True)
		save_result = serializer.save()
		solicitudes = save_result if isinstance(save_result, list) else [save_result]

		for solicitud in solicitudes:
			registrar_auditoria(
				tipo_evento=TipoEventoAuditoria.CREAR_INTERCAMBIO,
				usuario=request.user,
				entidad="solicitud",
				id_entidad=solicitud.id,
				metadata={
					"tipo": solicitud.tipo,
					"modo_compensacion": solicitud.modo_compensacion,
					"receptor_id": str(solicitud.receptor_id),
				},
			)

		principal = solicitudes[0]
		response_data = SolicitudIntercambioSerializer(principal).data
		if len(solicitudes) > 1:
			response_data["solicitudes_creadas"] = len(solicitudes)
			response_data["solicitudes_ids"] = [str(item.id) for item in solicitudes]

		return Response(response_data, status=status.HTTP_201_CREATED)


class IntercambiosMiasView(APIView):
	def get(self, request):
		_cancelar_pendientes_desactualizadas()
		enviadas = SolicitudIntercambio.objects.filter(solicitante=request.user)
		recibidas = SolicitudIntercambio.objects.filter(receptor=request.user)
		serializer = IntercambiosMiasSerializer({"enviadas": enviadas, "recibidas": recibidas})
		return Response(serializer.data)


class IntercambioAceptarView(APIView):
	def post(self, request, intercambio_id):
		_cancelar_pendientes_desactualizadas()
		solicitud = SolicitudIntercambio.objects.filter(id=intercambio_id).select_related(
			"asignacion_origen__semana",
			"asignacion_destino__semana",
			"solicitante",
			"receptor",
		).first()
		if not solicitud:
			return Response({"detail": "Solicitud no encontrada."}, status=status.HTTP_404_NOT_FOUND)
		if solicitud.estado != EstadoSolicitud.PENDIENTE:
			return Response(
				{"detail": "Solo se pueden aceptar solicitudes pendientes."},
				status=status.HTTP_400_BAD_REQUEST,
			)
		if solicitud.receptor_id != request.user.id:
			raise PermissionDenied("Solo el receptor puede aceptar la solicitud.")

		solicitudes = list(
			_solicitudes_pendientes_relacionadas(solicitud)
			.select_related(
				"asignacion_origen__semana",
				"asignacion_destino__semana",
				"solicitante",
				"receptor",
			)
			.order_by("fecha_creacion")
		)
		if not solicitudes:
			return Response(
				{"detail": "No hay solicitudes pendientes para procesar."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		dias_transferidos = 0
		detalles = []
		sync_targets = {}

		with transaction.atomic():
			for solicitud_item in solicitudes:
				dias_item = aceptar_intercambio(solicitud_item, request.user)
				dias_transferidos += dias_item
				detalles.append(
					{
						"id": str(solicitud_item.id),
						"dias_transferidos": dias_item,
					}
				)

				semana_item = solicitud_item.asignacion_origen.semana
				sync_targets[(solicitud_item.solicitante_id, semana_item.id)] = (
					solicitud_item.solicitante,
					semana_item,
				)
				sync_targets[(solicitud_item.receptor_id, semana_item.id)] = (
					solicitud_item.receptor,
					semana_item,
				)

				if solicitud_item.asignacion_destino_id and solicitud_item.asignacion_destino:
					semana_destino = solicitud_item.asignacion_destino.semana
					sync_targets[(solicitud_item.solicitante_id, semana_destino.id)] = (
						solicitud_item.solicitante,
						semana_destino,
					)
					sync_targets[(solicitud_item.receptor_id, semana_destino.id)] = (
						solicitud_item.receptor,
						semana_destino,
					)

		calendar_results = []
		for usuario, semana in sync_targets.values():
			try:
				result = sync_assignments_for_user_week(usuario, semana)
				calendar_results.append({"usuario": str(usuario.id), **result})
			except Exception:
				calendar_results.append(
					{
						"usuario": str(usuario.id),
						"synced": 0,
						"message": "No se pudo sincronizar Google Calendar para este usuario.",
					}
				)

		return Response(
			{
				"detail": "Grupo aceptado." if len(solicitudes) > 1 else "Solicitud aceptada.",
				"solicitudes_procesadas": len(solicitudes),
				"dias_transferidos": dias_transferidos,
				"detalles": detalles,
				"calendar": calendar_results,
			}
		)


class IntercambioRechazarView(APIView):
	def post(self, request, intercambio_id):
		solicitud = SolicitudIntercambio.objects.filter(id=intercambio_id).first()
		if not solicitud:
			return Response({"detail": "Solicitud no encontrada."}, status=status.HTTP_404_NOT_FOUND)
		if solicitud.estado != EstadoSolicitud.PENDIENTE:
			return Response(
				{"detail": "Solo se pueden rechazar solicitudes pendientes."},
				status=status.HTTP_400_BAD_REQUEST,
			)
		if solicitud.receptor_id != request.user.id:
			raise PermissionDenied("Solo el receptor puede rechazar la solicitud.")

		solicitudes = list(
			_solicitudes_pendientes_relacionadas(solicitud)
			.filter(receptor_id=request.user.id)
			.order_by("fecha_creacion")
		)
		if not solicitudes:
			return Response(
				{"detail": "No hay solicitudes pendientes para rechazar."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		now = timezone.now()
		with transaction.atomic():
			SolicitudIntercambio.objects.filter(id__in=[item.id for item in solicitudes]).update(
				estado=EstadoSolicitud.RECHAZADA,
				fecha_respuesta=now,
			)

		return Response(
			{
				"detail": "Grupo rechazado." if len(solicitudes) > 1 else "Solicitud rechazada.",
				"solicitudes_procesadas": len(solicitudes),
			}
		)


class IntercambioCancelarView(APIView):
	def post(self, request, intercambio_id):
		solicitud = SolicitudIntercambio.objects.filter(id=intercambio_id).first()
		if not solicitud:
			return Response({"detail": "Solicitud no encontrada."}, status=status.HTTP_404_NOT_FOUND)
		if solicitud.estado != EstadoSolicitud.PENDIENTE:
			return Response(
				{"detail": "Solo se pueden cancelar solicitudes pendientes."},
				status=status.HTTP_400_BAD_REQUEST,
			)
		if solicitud.solicitante_id != request.user.id:
			raise PermissionDenied("Solo el solicitante puede cancelar la solicitud.")

		solicitudes = list(
			_solicitudes_pendientes_relacionadas(solicitud)
			.filter(solicitante_id=request.user.id)
			.order_by("fecha_creacion")
		)
		if not solicitudes:
			return Response(
				{"detail": "No hay solicitudes pendientes para cancelar."},
				status=status.HTTP_400_BAD_REQUEST,
			)

		now = timezone.now()
		with transaction.atomic():
			SolicitudIntercambio.objects.filter(id__in=[item.id for item in solicitudes]).update(
				estado=EstadoSolicitud.CANCELADA,
				fecha_respuesta=now,
			)

		return Response(
			{
				"detail": "Grupo cancelado." if len(solicitudes) > 1 else "Solicitud cancelada.",
				"solicitudes_procesadas": len(solicitudes),
			}
		)


def _balance_for_user(saldo, user):
	if user.id == saldo.usuario_a_id:
		return saldo.saldo_dias_a_favor_de_a, saldo.saldo_dias_a_favor_de_b, saldo.usuario_b
	return saldo.saldo_dias_a_favor_de_b, saldo.saldo_dias_a_favor_de_a, saldo.usuario_a


class BolsaSaldosView(APIView):
	def get(self, request):
		saldos = BolsaDiasSaldo.objects.filter(
			Q(usuario_a=request.user) | Q(usuario_b=request.user)
		).select_related("usuario_a", "usuario_b")

		detalles = []
		me_deben = []
		debo = []

		for saldo in saldos:
			fav, deuda, otro = _balance_for_user(saldo, request.user)
			item = {
				"usuario": UsuarioSerializer(otro).data,
				"me_deben": fav,
				"debo": deuda,
			}
			detalles.append(item)
			if fav > 0:
				me_deben.append(item)
			if deuda > 0:
				debo.append(item)

		return Response({"me_deben": me_deben, "debo": debo, "detalles": detalles})


class BolsaSaldoUsuarioView(APIView):
	def get(self, request, usuario_id):
		saldo = BolsaDiasSaldo.objects.filter(
			Q(usuario_a=request.user, usuario_b_id=usuario_id)
			| Q(usuario_b=request.user, usuario_a_id=usuario_id)
		).select_related("usuario_a", "usuario_b").first()

		if not saldo:
			return Response(
				{
					"usuario_id": str(usuario_id),
					"me_deben": 0,
					"debo": 0,
				}
			)

		fav, deuda, otro = _balance_for_user(saldo, request.user)
		return Response(
			{
				"usuario": UsuarioSerializer(otro).data,
				"me_deben": fav,
				"debo": deuda,
			}
		)


class BolsaMovimientosView(APIView):
	def get(self, request):
		movimientos = BolsaDiasMovimiento.objects.filter(
			Q(origen_usuario=request.user) | Q(destino_usuario=request.user)
		).select_related("origen_usuario", "destino_usuario", "solicitud_intercambio")
		return Response(BolsaMovimientoSerializer(movimientos, many=True).data)


class BolsaCompensarView(APIView):
	def post(self, request):
		serializer = BolsaCompensarSerializer(data=request.data, context={"request": request})
		serializer.is_valid(raise_exception=True)
		save_result = serializer.save()
		solicitudes = save_result if isinstance(save_result, list) else [save_result]

		for solicitud in solicitudes:
			registrar_auditoria(
				tipo_evento=TipoEventoAuditoria.CREAR_INTERCAMBIO,
				usuario=request.user,
				entidad="solicitud",
				id_entidad=solicitud.id,
				metadata={
					"es_compensacion": True,
					"receptor_id": str(solicitud.receptor_id),
					"dias_estimados": solicitud.dias_estimados,
				},
			)

		principal = solicitudes[0]
		response_data = SolicitudIntercambioSerializer(principal).data
		if len(solicitudes) > 1:
			response_data["solicitudes_creadas"] = len(solicitudes)
			response_data["solicitudes_ids"] = [str(item.id) for item in solicitudes]

		return Response(response_data, status=status.HTTP_201_CREATED)


class GoogleConnectUrlView(APIView):
	def get(self, request):
		try:
			url = build_google_connect_url(request.user)
		except ValueError as error:
			return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)
		return Response({"url": url})


class GoogleCallbackView(APIView):
	def post(self, request):
		serializer = GoogleCallbackSerializer(data=request.data)
		serializer.is_valid(raise_exception=True)
		try:
			exchange_code_for_tokens(
				usuario=request.user,
				code=serializer.validated_data["code"],
				state=serializer.validated_data.get("state", ""),
			)
		except ValueError as error:
			return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)
		return Response({"detail": "Google Calendar conectado correctamente."})


class GoogleSyncSemanaView(APIView):
	def post(self, request, semana_id):
		semana = CalendarioSemanal.objects.filter(id=semana_id).first()
		if not semana:
			return Response({"detail": "Semana no encontrada."}, status=status.HTTP_404_NOT_FOUND)
		try:
			result = sync_assignments_for_user_week(request.user, semana)
		except ValueError as error:
			return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)
		return Response(result)


class GoogleSyncMeView(APIView):
	def post(self, request):
		try:
			result = sync_all_for_user(request.user)
		except ValueError as error:
			return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)
		return Response(result)


class GoogleDisconnectView(APIView):
	def delete(self, request):
		disconnect_google(request.user)
		return Response({"detail": "Integracion con Google Calendar desconectada."})
