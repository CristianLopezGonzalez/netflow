import uuid

from django.contrib.auth.models import AbstractUser
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class RolUsuario(models.TextChoices):
	ADMIN = "admin", "Admin"
	SUPERVISOR = "supervisor", "Supervisor"
	EMPLEADO = "empleado", "Empleado"


class EstadoSemana(models.TextChoices):
	BORRADOR = "borrador", "Borrador"
	PUBLICADO = "publicado", "Publicado"


class DiaSemana(models.TextChoices):
	LUNES = "lunes", "Lunes"
	MARTES = "martes", "Martes"
	MIERCOLES = "miercoles", "Miercoles"
	JUEVES = "jueves", "Jueves"
	VIERNES = "viernes", "Viernes"


class EstadoAsignacion(models.TextChoices):
	ASIGNADO = "asignado", "Asignado"
	INTERCAMBIADO = "intercambiado", "Intercambiado"


class TipoIntercambio(models.TextChoices):
	DIA = "dia", "Dia"
	SEMANA = "semana", "Semana"


class ModoCompensacion(models.TextChoices):
	INMEDIATA = "inmediata", "Inmediata"
	BOLSA = "bolsa", "Bolsa"


class EstadoSolicitud(models.TextChoices):
	PENDIENTE = "pendiente", "Pendiente"
	ACEPTADA = "aceptada", "Aceptada"
	RECHAZADA = "rechazada", "Rechazada"
	CANCELADA = "cancelada", "Cancelada"


class TipoMovimientoBolsa(models.TextChoices):
	GENERA_DEUDA = "genera_deuda", "Genera deuda"
	COMPENSA_DEUDA = "compensa_deuda", "Compensa deuda"


class RolSolicitanteCompensacion(models.TextChoices):
	ACREEDOR = "acreedor", "Acreedor"
	DEUDOR = "deudor", "Deudor"


class TipoEventoAuditoria(models.TextChoices):
	CREAR_INTERCAMBIO = "crear_intercambio", "Crear intercambio"
	ACEPTAR_INTERCAMBIO = "aceptar_intercambio", "Aceptar intercambio"
	ACTUALIZAR_BOLSA = "actualizar_bolsa", "Actualizar bolsa"
	SYNC_CALENDAR = "sync_calendar", "Sync calendar"
	PUBLICAR_SEMANA = "publicar_semana", "Publicar semana"


class Usuario(AbstractUser):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	nombre = models.CharField(max_length=150)
	email = models.EmailField(unique=True)
	rol = models.CharField(max_length=20, choices=RolUsuario.choices, default=RolUsuario.EMPLEADO)
	activo = models.BooleanField(default=True)

	USERNAME_FIELD = "email"
	REQUIRED_FIELDS = ["username", "nombre"]

	def save(self, *args, **kwargs):
		if not self.username:
			self.username = self.email
		self.is_active = self.activo
		super().save(*args, **kwargs)

	def __str__(self):
		return f"{self.nombre} ({self.email})"


class CalendarioSemanal(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	anio = models.PositiveSmallIntegerField()
	numero_semana = models.PositiveSmallIntegerField(
		validators=[MinValueValidator(1), MaxValueValidator(53)]
	)
	fecha_inicio_semana = models.DateField()
	fecha_fin_semana = models.DateField()
	estado = models.CharField(max_length=20, choices=EstadoSemana.choices, default=EstadoSemana.BORRADOR)

	class Meta:
		unique_together = ("anio", "numero_semana")
		ordering = ["-anio", "-numero_semana"]

	def __str__(self):
		return f"Semana {self.numero_semana}/{self.anio}"


class AsignacionTarde(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	semana = models.ForeignKey(CalendarioSemanal, on_delete=models.CASCADE, related_name="asignaciones")
	usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE, related_name="asignaciones_tarde")
	dia = models.CharField(max_length=20, choices=DiaSemana.choices)
	hora_inicio = models.TimeField(default="14:00")
	hora_fin = models.TimeField(default="22:00")
	estado = models.CharField(max_length=20, choices=EstadoAsignacion.choices, default=EstadoAsignacion.ASIGNADO)
	google_event_id = models.CharField(max_length=255, blank=True)

	class Meta:
		unique_together = ("semana", "usuario", "dia")
		ordering = ["semana__anio", "semana__numero_semana", "dia"]

	def __str__(self):
		return f"{self.usuario.nombre} - {self.dia} ({self.semana})"


class SolicitudIntercambio(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	solicitante = models.ForeignKey(
		Usuario,
		on_delete=models.CASCADE,
		related_name="solicitudes_enviadas",
	)
	receptor = models.ForeignKey(
		Usuario,
		on_delete=models.CASCADE,
		related_name="solicitudes_recibidas",
	)
	tipo = models.CharField(max_length=20, choices=TipoIntercambio.choices)
	asignacion_origen = models.ForeignKey(
		AsignacionTarde,
		on_delete=models.CASCADE,
		related_name="solicitudes_origen",
	)
	asignacion_destino = models.ForeignKey(
		AsignacionTarde,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="solicitudes_destino",
	)
	motivo = models.TextField(blank=True)
	modo_compensacion = models.CharField(max_length=20, choices=ModoCompensacion.choices)
	estado = models.CharField(max_length=20, choices=EstadoSolicitud.choices, default=EstadoSolicitud.PENDIENTE)
	es_compensacion = models.BooleanField(default=False)
	rol_solicitante_compensacion = models.CharField(
		max_length=20,
		choices=RolSolicitanteCompensacion.choices,
		default=RolSolicitanteCompensacion.ACREEDOR,
	)
	dias_estimados = models.PositiveIntegerField(default=1)
	fecha_creacion = models.DateTimeField(auto_now_add=True)
	fecha_respuesta = models.DateTimeField(null=True, blank=True)

	class Meta:
		ordering = ["-fecha_creacion"]

	def __str__(self):
		return f"{self.solicitante.nombre} -> {self.receptor.nombre} ({self.estado})"


class BolsaDiasSaldo(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	usuario_a = models.ForeignKey(Usuario, on_delete=models.CASCADE, related_name="saldos_a")
	usuario_b = models.ForeignKey(Usuario, on_delete=models.CASCADE, related_name="saldos_b")
	saldo_dias_a_favor_de_a = models.PositiveIntegerField(default=0)
	saldo_dias_a_favor_de_b = models.PositiveIntegerField(default=0)
	ultima_actualizacion = models.DateTimeField(auto_now=True)

	class Meta:
		unique_together = ("usuario_a", "usuario_b")

	def __str__(self):
		return f"Saldo {self.usuario_a.nombre} <-> {self.usuario_b.nombre}"


class BolsaDiasMovimiento(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	saldo = models.ForeignKey(BolsaDiasSaldo, on_delete=models.CASCADE, related_name="movimientos")
	origen_usuario = models.ForeignKey(
		Usuario,
		on_delete=models.CASCADE,
		related_name="movimientos_generados",
	)
	destino_usuario = models.ForeignKey(
		Usuario,
		on_delete=models.CASCADE,
		related_name="movimientos_recibidos",
	)
	dias = models.PositiveIntegerField()
	tipo = models.CharField(max_length=20, choices=TipoMovimientoBolsa.choices)
	solicitud_intercambio = models.ForeignKey(
		SolicitudIntercambio,
		on_delete=models.SET_NULL,
		null=True,
		blank=True,
		related_name="movimientos_bolsa",
	)
	fecha = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-fecha"]


class IntegracionGoogleCalendar(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	usuario = models.OneToOneField(Usuario, on_delete=models.CASCADE, related_name="google_calendar")
	google_calendar_id = models.CharField(max_length=200, default="primary")
	sincronizacion_activa = models.BooleanField(default=False)
	access_token = models.TextField(blank=True)
	refresh_token = models.TextField(blank=True)
	token_expiry = models.DateTimeField(null=True, blank=True)
	state_token = models.CharField(max_length=255, blank=True)
	ultima_sync = models.DateTimeField(null=True, blank=True)


class AuditoriaEvento(models.Model):
	id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
	tipo_evento = models.CharField(max_length=40, choices=TipoEventoAuditoria.choices)
	usuario = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, blank=True)
	entidad = models.CharField(max_length=50)
	id_entidad = models.CharField(max_length=100)
	metadata = models.JSONField(default=dict, blank=True)
	fecha = models.DateTimeField(auto_now_add=True)

	class Meta:
		ordering = ["-fecha"]
