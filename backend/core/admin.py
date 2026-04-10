from django.contrib import admin

from .models import (
	AsignacionTarde,
	AuditoriaEvento,
	BolsaDiasMovimiento,
	BolsaDiasSaldo,
	CalendarioSemanal,
	IntegracionGoogleCalendar,
	SolicitudIntercambio,
	Usuario,
)


@admin.register(Usuario)
class UsuarioAdmin(admin.ModelAdmin):
	list_display = ("email", "nombre", "rol", "activo")
	list_filter = ("rol", "activo")
	search_fields = ("email", "nombre")


@admin.register(CalendarioSemanal)
class CalendarioSemanalAdmin(admin.ModelAdmin):
	list_display = ("anio", "numero_semana", "estado", "fecha_inicio_semana", "fecha_fin_semana")
	list_filter = ("anio", "estado")


@admin.register(AsignacionTarde)
class AsignacionTardeAdmin(admin.ModelAdmin):
	list_display = ("semana", "usuario", "dia", "hora_inicio", "hora_fin", "estado")
	list_filter = ("dia", "estado")
	search_fields = ("usuario__nombre", "usuario__email")


@admin.register(SolicitudIntercambio)
class SolicitudIntercambioAdmin(admin.ModelAdmin):
	list_display = ("solicitante", "receptor", "tipo", "modo_compensacion", "estado", "fecha_creacion")
	list_filter = ("tipo", "modo_compensacion", "estado", "es_compensacion")


@admin.register(BolsaDiasSaldo)
class BolsaDiasSaldoAdmin(admin.ModelAdmin):
	list_display = (
		"usuario_a",
		"usuario_b",
		"saldo_dias_a_favor_de_a",
		"saldo_dias_a_favor_de_b",
		"ultima_actualizacion",
	)


@admin.register(BolsaDiasMovimiento)
class BolsaDiasMovimientoAdmin(admin.ModelAdmin):
	list_display = ("origen_usuario", "destino_usuario", "dias", "tipo", "fecha")
	list_filter = ("tipo",)


@admin.register(IntegracionGoogleCalendar)
class IntegracionGoogleCalendarAdmin(admin.ModelAdmin):
	list_display = ("usuario", "google_calendar_id", "sincronizacion_activa", "ultima_sync")


@admin.register(AuditoriaEvento)
class AuditoriaEventoAdmin(admin.ModelAdmin):
	list_display = ("tipo_evento", "usuario", "entidad", "id_entidad", "fecha")
	list_filter = ("tipo_evento", "entidad")

# Register your models here.
