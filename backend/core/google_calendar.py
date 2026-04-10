from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from django.conf import settings
from django.utils import timezone
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import Flow

from .models import (
    AsignacionTarde,
    AuditoriaEvento,
    IntegracionGoogleCalendar,
    TipoEventoAuditoria,
)

DIA_OFFSET = {
    "lunes": 0,
    "martes": 1,
    "miercoles": 2,
    "jueves": 3,
    "viernes": 4,
}


def _build_client_config():
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise ValueError("Falta configurar GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET.")

    return {
        "web": {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.GOOGLE_REDIRECT_URI],
        }
    }


def _registrar_auditoria(usuario, entidad, id_entidad, metadata):
    AuditoriaEvento.objects.create(
        tipo_evento=TipoEventoAuditoria.SYNC_CALENDAR,
        usuario=usuario,
        entidad=entidad,
        id_entidad=str(id_entidad),
        metadata=metadata,
    )


def get_or_create_integration(usuario):
    integration, _ = IntegracionGoogleCalendar.objects.get_or_create(usuario=usuario)
    return integration


def build_google_connect_url(usuario):
    integration = get_or_create_integration(usuario)
    flow = Flow.from_client_config(
        _build_client_config(),
        scopes=settings.GOOGLE_CALENDAR_SCOPES,
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
    )
    state = str(uuid4())
    url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )

    integration.state_token = state
    integration.save(update_fields=["state_token"])
    return url


def exchange_code_for_tokens(usuario, code, state=""):
    integration = get_or_create_integration(usuario)
    if integration.state_token and state and integration.state_token != state:
        raise ValueError("State de OAuth invalido.")

    flow = Flow.from_client_config(
        _build_client_config(),
        scopes=settings.GOOGLE_CALENDAR_SCOPES,
        redirect_uri=settings.GOOGLE_REDIRECT_URI,
    )
    flow.fetch_token(code=code)
    credentials = flow.credentials

    integration.access_token = credentials.token or ""
    if credentials.refresh_token:
        integration.refresh_token = credentials.refresh_token
    integration.token_expiry = credentials.expiry
    integration.sincronizacion_activa = True
    integration.save(
        update_fields=[
            "access_token",
            "refresh_token",
            "token_expiry",
            "sincronizacion_activa",
        ]
    )

    _registrar_auditoria(
        usuario=usuario,
        entidad="calendar",
        id_entidad=integration.id,
        metadata={"accion": "oauth_callback"},
    )


def _build_credentials(integration):
    if not integration.access_token and not integration.refresh_token:
        raise ValueError("No hay credenciales de Google Calendar asociadas.")

    credentials = Credentials(
        token=integration.access_token,
        refresh_token=integration.refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=settings.GOOGLE_CALENDAR_SCOPES,
    )

    if credentials.expired and credentials.refresh_token:
        credentials.refresh(Request())
        integration.access_token = credentials.token or integration.access_token
        integration.token_expiry = credentials.expiry
        integration.save(update_fields=["access_token", "token_expiry"])

    return credentials


def _build_event_payload(asignacion):
    day_offset = DIA_OFFSET[asignacion.dia]
    turno_date = asignacion.semana.fecha_inicio_semana + timedelta(days=day_offset)

    tz = ZoneInfo(settings.TIME_ZONE)
    start_dt = datetime.combine(turno_date, asignacion.hora_inicio, tzinfo=tz)
    end_dt = datetime.combine(turno_date, asignacion.hora_fin, tzinfo=tz)

    return {
        "summary": f"Turno de tarde - {asignacion.dia.capitalize()}",
        "description": "Turno sincronizado desde Netflow",
        "start": {
            "dateTime": start_dt.isoformat(),
            "timeZone": settings.TIME_ZONE,
        },
        "end": {
            "dateTime": end_dt.isoformat(),
            "timeZone": settings.TIME_ZONE,
        },
    }


def sync_assignments_for_user_week(usuario, semana):
    integration = get_or_create_integration(usuario)
    if not integration.sincronizacion_activa:
        return {
            "synced": 0,
            "message": "Sincronizacion no activa para el usuario.",
        }

    credentials = _build_credentials(integration)
    service = build("calendar", "v3", credentials=credentials, cache_discovery=False)

    assignments = AsignacionTarde.objects.filter(usuario=usuario, semana=semana).order_by("dia")
    synced = 0

    for assignment in assignments:
        event_body = _build_event_payload(assignment)
        if assignment.google_event_id:
            service.events().update(
                calendarId=integration.google_calendar_id,
                eventId=assignment.google_event_id,
                body=event_body,
            ).execute()
        else:
            event = service.events().insert(
                calendarId=integration.google_calendar_id,
                body=event_body,
            ).execute()
            assignment.google_event_id = event.get("id", "")
            assignment.save(update_fields=["google_event_id"])
        synced += 1

    integration.ultima_sync = timezone.now()
    integration.save(update_fields=["ultima_sync"])

    _registrar_auditoria(
        usuario=usuario,
        entidad="calendar",
        id_entidad=integration.id,
        metadata={
            "accion": "sync_week",
            "semana_id": str(semana.id),
            "items": synced,
        },
    )

    return {"synced": synced, "message": "Sincronizacion completada."}


def sync_all_for_user(usuario):
    integration = get_or_create_integration(usuario)
    if not integration.sincronizacion_activa:
        return {"synced": 0, "message": "Sincronizacion no activa para el usuario."}

    semanas = (
        AsignacionTarde.objects.filter(usuario=usuario)
        .select_related("semana")
        .values_list("semana_id", flat=True)
        .distinct()
    )

    total = 0
    for semana_id in semanas:
        semana = AsignacionTarde.objects.select_related("semana").filter(semana_id=semana_id).first().semana
        result = sync_assignments_for_user_week(usuario, semana)
        total += result.get("synced", 0)

    return {"synced": total, "message": "Sincronizacion global completada."}


def disconnect_google(usuario):
    integration = IntegracionGoogleCalendar.objects.filter(usuario=usuario).first()
    if not integration:
        return

    integration.sincronizacion_activa = False
    integration.access_token = ""
    integration.refresh_token = ""
    integration.token_expiry = None
    integration.save(
        update_fields=[
            "sincronizacion_activa",
            "access_token",
            "refresh_token",
            "token_expiry",
        ]
    )

    _registrar_auditoria(
        usuario=usuario,
        entidad="calendar",
        id_entidad=integration.id,
        metadata={"accion": "disconnect"},
    )
