import uuid
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from rest_framework import serializers
from rest_framework.validators import UniqueTogetherValidator

from .models import (
    AsignacionTarde,
    BolsaDiasMovimiento,
    CalendarioSemanal,
    EstadoSolicitud,
    EstadoSemana,
    ModoCompensacion,
    RolUsuario,
    RolSolicitanteCompensacion,
    SolicitudIntercambio,
    TipoIntercambio,
    Usuario,
)
from .services import obtener_deuda


class UsuarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = Usuario
        fields = ("id", "nombre", "email", "rol", "activo")


class UsuarioAdminSerializer(UsuarioSerializer):
    password = serializers.CharField(write_only=True, min_length=8, required=False, trim_whitespace=False)

    class Meta(UsuarioSerializer.Meta):
        fields = UsuarioSerializer.Meta.fields + ("password",)

    def validate_email(self, value):
        normalized_email = value.strip().lower()
        query = Usuario.objects.filter(email__iexact=normalized_email)
        if self.instance:
            query = query.exclude(id=self.instance.id)
        if query.exists():
            raise serializers.ValidationError("Ya existe un usuario con este email.")
        return normalized_email

    def validate(self, attrs):
        if not self.instance and not attrs.get("password"):
            raise serializers.ValidationError({"password": "Este campo es obligatorio."})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password")
        email = validated_data["email"]

        user = Usuario(**validated_data)
        user.email = email
        user.username = email
        user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        email = validated_data.get("email")

        for field, value in validated_data.items():
            setattr(instance, field, value)

        if email is not None:
            instance.username = email

        if password:
            instance.set_password(password)

        instance.save()
        return instance


class RegistroSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = Usuario
        fields = ("id", "nombre", "email", "password")
        read_only_fields = ("id",)

    def validate_email(self, value):
        normalized_email = value.strip().lower()
        if Usuario.objects.filter(email__iexact=normalized_email).exists():
            raise serializers.ValidationError("Ya existe un usuario con este email.")
        return normalized_email

    def create(self, validated_data):
        password = validated_data.pop("password")
        email = validated_data["email"]
        user = Usuario(**validated_data)
        user.email = email
        user.username = email
        user.rol = "empleado"
        user.activo = True
        user.set_password(password)
        user.save()
        return user


class CalendarioSemanalSerializer(serializers.ModelSerializer):
    class Meta:
        model = CalendarioSemanal
        fields = (
            "id",
            "anio",
            "numero_semana",
            "fecha_inicio_semana",
            "fecha_fin_semana",
            "estado",
        )
        validators = [
            UniqueTogetherValidator(
                queryset=CalendarioSemanal.objects.all(),
                fields=("anio", "numero_semana"),
                message="Ya existe una semana registrada para ese anio y numero de semana.",
            )
        ]

    def validate(self, attrs):
        fecha_inicio = attrs["fecha_inicio_semana"]
        fecha_fin = attrs["fecha_fin_semana"]
        anio = attrs["anio"]
        numero_semana = attrs["numero_semana"]

        if fecha_inicio > fecha_fin:
            raise serializers.ValidationError("La fecha de inicio no puede ser mayor que la fecha fin.")

        if fecha_inicio.weekday() != 0:
            raise serializers.ValidationError(
                {"fecha_inicio_semana": "La semana debe empezar en lunes."}
            )

        fin_esperado = fecha_inicio + timedelta(days=4)
        if fecha_fin != fin_esperado:
            raise serializers.ValidationError(
                {
                    "fecha_fin_semana": (
                        "La semana laboral debe terminar en viernes y abarcar 5 dias "
                        f"(fin esperado: {fin_esperado})."
                    )
                }
            )

        iso_info = fecha_inicio.isocalendar()
        if anio != iso_info.year or numero_semana != iso_info.week:
            raise serializers.ValidationError(
                {
                    "anio": f"El anio debe coincidir con ISO: {iso_info.year}.",
                    "numero_semana": (
                        "El numero de semana debe coincidir con la fecha de inicio "
                        f"(ISO: {iso_info.week})."
                    ),
                }
            )

        return attrs


class AsignacionTardeSerializer(serializers.ModelSerializer):
    usuario_detalle = UsuarioSerializer(source="usuario", read_only=True)

    class Meta:
        model = AsignacionTarde
        fields = (
            "id",
            "semana",
            "usuario",
            "usuario_detalle",
            "dia",
            "hora_inicio",
            "hora_fin",
            "estado",
            "google_event_id",
        )
        read_only_fields = ("google_event_id",)

    def validate(self, attrs):
        semana = attrs.get("semana", getattr(self.instance, "semana", None))
        usuario = attrs.get("usuario", getattr(self.instance, "usuario", None))
        dia = attrs.get("dia", getattr(self.instance, "dia", None))

        if semana and usuario and dia:
            duplicates = AsignacionTarde.objects.filter(semana=semana, usuario=usuario, dia=dia)
            if self.instance:
                duplicates = duplicates.exclude(id=self.instance.id)
            if duplicates.exists():
                raise serializers.ValidationError(
                    "El usuario ya tiene una asignacion en ese dia de la semana."
                )

        hora_inicio = attrs.get("hora_inicio", getattr(self.instance, "hora_inicio", None))
        hora_fin = attrs.get("hora_fin", getattr(self.instance, "hora_fin", None))
        if hora_inicio and hora_fin and hora_inicio >= hora_fin:
            raise serializers.ValidationError("La hora de inicio debe ser menor que la hora fin.")

        return attrs


class _GeneracionCalendarioBaseSerializer(serializers.Serializer):
    ESTRATEGIA_CHOICES = (
        ("skip", "skip"),
        ("replace", "replace"),
    )

    anio = serializers.IntegerField(min_value=2020, max_value=2100)
    empleado_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
    estado = serializers.ChoiceField(choices=EstadoSemana.choices, default=EstadoSemana.BORRADOR)
    estrategia_conflicto = serializers.ChoiceField(choices=ESTRATEGIA_CHOICES, default="replace")

    def validate_empleado_ids(self, value):
        normalized_ids = [str(item) for item in value]
        if len(normalized_ids) != len(set(normalized_ids)):
            raise serializers.ValidationError("No se permiten empleados repetidos.")
        return value

    def validate(self, attrs):
        empleado_ids = [str(item) for item in attrs["empleado_ids"]]
        empleados = Usuario.objects.filter(
            id__in=empleado_ids,
            activo=True,
            rol=RolUsuario.EMPLEADO,
        )
        empleados_by_id = {str(item.id): item for item in empleados}

        missing_ids = [employee_id for employee_id in empleado_ids if employee_id not in empleados_by_id]
        if missing_ids:
            raise serializers.ValidationError(
                {
                    "empleado_ids": (
                        "Uno o mas usuarios no existen, no estan activos o no tienen rol empleado."
                    )
                }
            )

        attrs["empleados"] = [empleados_by_id[employee_id] for employee_id in empleado_ids]
        return attrs


class GenerarCalendarioMesSerializer(_GeneracionCalendarioBaseSerializer):
    mes = serializers.IntegerField(min_value=1, max_value=12)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if len(attrs["empleados"]) > 4:
            raise serializers.ValidationError(
                {
                    "empleado_ids": "Para generacion mensual puedes seleccionar como maximo 4 empleados."
                }
            )
        return attrs


class GenerarCalendarioAnioSerializer(_GeneracionCalendarioBaseSerializer):
    pass


class SolicitudIntercambioSerializer(serializers.ModelSerializer):
    solicitante = UsuarioSerializer(read_only=True)
    receptor = UsuarioSerializer(read_only=True)
    asignacion_origen = AsignacionTardeSerializer(read_only=True)
    asignacion_destino = AsignacionTardeSerializer(read_only=True)

    class Meta:
        model = SolicitudIntercambio
        fields = (
            "id",
            "solicitante",
            "receptor",
            "tipo",
            "asignacion_origen",
            "asignacion_destino",
            "motivo",
            "modo_compensacion",
            "estado",
            "es_compensacion",
            "rol_solicitante_compensacion",
            "dias_estimados",
            "fecha_creacion",
            "fecha_respuesta",
        )


class SolicitudIntercambioCreateSerializer(serializers.Serializer):
    receptor_id = serializers.UUIDField()
    tipo = serializers.ChoiceField(choices=TipoIntercambio.choices)
    asignacion_origen_id = serializers.UUIDField(required=False)
    asignacion_origen_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=False,
    )
    asignacion_destino_id = serializers.UUIDField(required=False, allow_null=True)
    asignacion_destino_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=False,
    )
    motivo = serializers.CharField(required=False, allow_blank=True)
    modo_compensacion = serializers.ChoiceField(choices=ModoCompensacion.choices)

    def validate(self, attrs):
        request = self.context["request"]
        solicitante = request.user

        def _normalize_ids(single_value, many_values, field_name):
            has_single = single_value is not None
            has_many = bool(many_values)

            if has_single and has_many:
                raise serializers.ValidationError(
                    f"Usa {field_name}_id o {field_name}_ids, pero no ambos en la misma solicitud."
                )

            if has_many:
                values = [str(item) for item in many_values]
            elif has_single:
                values = [str(single_value)]
            else:
                values = []

            if len(values) != len(set(values)):
                raise serializers.ValidationError(
                    f"No se permiten {field_name}s repetidos en la misma solicitud."
                )

            return values

        receptor = Usuario.objects.filter(id=attrs["receptor_id"], activo=True).first()
        if not receptor:
            raise serializers.ValidationError("El receptor no existe o no esta activo.")
        if receptor.id == solicitante.id:
            raise serializers.ValidationError("No puedes enviarte una solicitud a ti mismo.")

        origen_ids = _normalize_ids(
            attrs.get("asignacion_origen_id"),
            attrs.get("asignacion_origen_ids", []),
            "asignacion_origen",
        )
        if not origen_ids:
            raise serializers.ValidationError("Debes indicar al menos una asignacion origen.")

        if attrs["tipo"] == TipoIntercambio.SEMANA and len(origen_ids) > 1:
            raise serializers.ValidationError(
                "Para intercambio semanal envia solo una referencia de origen."
            )

        origen_queryset = AsignacionTarde.objects.select_related("semana", "usuario").filter(id__in=origen_ids)
        origen_by_id = {str(item.id): item for item in origen_queryset}
        missing_origen_ids = [item_id for item_id in origen_ids if item_id not in origen_by_id]
        if missing_origen_ids:
            raise serializers.ValidationError("Una o mas asignaciones origen no existen.")

        origenes = [origen_by_id[item_id] for item_id in origen_ids]
        if any(item.usuario_id != solicitante.id for item in origenes):
            raise serializers.ValidationError("Solo puedes solicitar sobre tus propias asignaciones.")

        destino_ids = _normalize_ids(
            attrs.get("asignacion_destino_id"),
            attrs.get("asignacion_destino_ids", []),
            "asignacion_destino",
        )

        destinos = []
        if destino_ids:
            destino_queryset = AsignacionTarde.objects.select_related("semana", "usuario").filter(id__in=destino_ids)
            destino_by_id = {str(item.id): item for item in destino_queryset}
            missing_destino_ids = [item_id for item_id in destino_ids if item_id not in destino_by_id]
            if missing_destino_ids:
                raise serializers.ValidationError("Una o mas asignaciones destino no existen.")

            destinos = [destino_by_id[item_id] for item_id in destino_ids]
            if any(item.usuario_id != receptor.id for item in destinos):
                raise serializers.ValidationError("La asignacion destino debe pertenecer al receptor.")

        if attrs["modo_compensacion"] == ModoCompensacion.BOLSA and destinos:
            raise serializers.ValidationError(
                "En modo bolsa no se permite indicar una asignacion destino."
            )

        if attrs["modo_compensacion"] == ModoCompensacion.INMEDIATA:
            if attrs["tipo"] == TipoIntercambio.SEMANA and len(destinos) != 1:
                raise serializers.ValidationError(
                    "Para intercambio semanal inmediata debes indicar una referencia de destino."
                )

            if attrs["tipo"] == TipoIntercambio.DIA:
                if not destinos:
                    raise serializers.ValidationError(
                        "Para compensacion inmediata debes indicar asignaciones destino."
                    )
                if len(destinos) != len(origenes):
                    raise serializers.ValidationError(
                        "En modo inmediata debes enviar la misma cantidad de origenes y destinos."
                    )

        origen_referencia = origenes[0]
        destino_referencia = destinos[0] if destinos else None

        origenes_pendientes = SolicitudIntercambio.objects.filter(
            estado=EstadoSolicitud.PENDIENTE,
            solicitante=solicitante,
            asignacion_origen_id__in=[item.id for item in origenes],
        ).values_list("asignacion_origen_id", flat=True)
        if origenes_pendientes:
            raise serializers.ValidationError("Ya existe una solicitud pendiente para alguna asignacion origen.")

        if destinos:
            destinos_reservados = SolicitudIntercambio.objects.filter(
                estado=EstadoSolicitud.PENDIENTE,
                receptor=receptor,
                asignacion_destino_id__in=[item.id for item in destinos],
            ).values_list("asignacion_destino_id", flat=True)
            if destinos_reservados:
                raise serializers.ValidationError(
                    "Alguna asignacion destino ya esta comprometida en otra solicitud pendiente."
                )

        dias_estimados = 1
        if attrs["tipo"] == TipoIntercambio.SEMANA:
            dias_estimados = AsignacionTarde.objects.filter(
                semana=origen_referencia.semana,
                usuario=solicitante,
            ).count()
            if dias_estimados == 0:
                raise serializers.ValidationError("No hay asignaciones semanales para intercambiar.")

        attrs["solicitante"] = solicitante
        attrs["receptor"] = receptor
        attrs["asignaciones_origen"] = origenes
        attrs["asignaciones_destino"] = destinos
        attrs["asignacion_origen"] = origen_referencia
        attrs["asignacion_destino"] = destino_referencia
        attrs["dias_estimados"] = dias_estimados
        return attrs

    def create(self, validated_data):
        validated_data.pop("receptor_id")
        validated_data.pop("asignacion_origen_id", None)
        validated_data.pop("asignacion_destino_id", None)
        validated_data.pop("asignacion_origen_ids", None)
        validated_data.pop("asignacion_destino_ids", None)

        asignaciones_origen = validated_data.pop("asignaciones_origen", [])
        asignaciones_destino = validated_data.pop("asignaciones_destino", [])

        if validated_data["tipo"] == TipoIntercambio.DIA and len(asignaciones_origen) > 1:
            group_token = uuid.uuid4().hex[:10].upper()
            reason = validated_data.get("motivo", "").strip()
            prefixed_reason = f"[#GRUPO:{group_token}] {reason}".strip()

            solicitudes = []
            with transaction.atomic():
                for index, asignacion_origen in enumerate(asignaciones_origen):
                    asignacion_destino = asignaciones_destino[index] if asignaciones_destino else None
                    solicitudes.append(
                        SolicitudIntercambio.objects.create(
                            solicitante=validated_data["solicitante"],
                            receptor=validated_data["receptor"],
                            tipo=validated_data["tipo"],
                            asignacion_origen=asignacion_origen,
                            asignacion_destino=asignacion_destino,
                            motivo=prefixed_reason,
                            modo_compensacion=validated_data["modo_compensacion"],
                            dias_estimados=1,
                        )
                    )

            return solicitudes

        return SolicitudIntercambio.objects.create(**validated_data)


class BolsaMovimientoSerializer(serializers.ModelSerializer):
    origen_usuario = UsuarioSerializer(read_only=True)
    destino_usuario = UsuarioSerializer(read_only=True)

    class Meta:
        model = BolsaDiasMovimiento
        fields = (
            "id",
            "origen_usuario",
            "destino_usuario",
            "dias",
            "tipo",
            "solicitud_intercambio",
            "fecha",
        )


class BolsaCompensarSerializer(serializers.Serializer):
    DIRECCION_COBRAR = "cobrar"
    DIRECCION_DEVOLVER = "devolver"
    DIRECCION_CHOICES = (
        (DIRECCION_COBRAR, "Cobrar"),
        (DIRECCION_DEVOLVER, "Devolver"),
    )

    usuario_id = serializers.UUIDField()
    direccion = serializers.ChoiceField(choices=DIRECCION_CHOICES, required=False, default=DIRECCION_COBRAR)
    tipo = serializers.ChoiceField(choices=TipoIntercambio.choices)
    asignacion_origen_id = serializers.UUIDField(required=False)
    asignacion_origen_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        allow_empty=False,
    )
    motivo = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        request = self.context["request"]
        actor = request.user

        def _normalize_origin_ids():
            single_origin_id = attrs.get("asignacion_origen_id")
            many_origin_ids = attrs.get("asignacion_origen_ids", [])

            has_single = single_origin_id is not None
            has_many = bool(many_origin_ids)

            if has_single and has_many:
                raise serializers.ValidationError(
                    "Usa asignacion_origen_id o asignacion_origen_ids, pero no ambos."
                )

            if has_many:
                normalized_ids = [str(item) for item in many_origin_ids]
            elif has_single:
                normalized_ids = [str(single_origin_id)]
            else:
                normalized_ids = []

            if not normalized_ids:
                raise serializers.ValidationError("Debes indicar al menos una asignacion origen.")

            if len(normalized_ids) != len(set(normalized_ids)):
                raise serializers.ValidationError(
                    "No se permiten asignaciones origen repetidas en la misma solicitud."
                )

            return normalized_ids

        companero = Usuario.objects.filter(id=attrs["usuario_id"], activo=True).first()
        if not companero:
            raise serializers.ValidationError("El usuario indicado no existe o no esta activo.")
        if companero.id == actor.id:
            raise serializers.ValidationError("Debes seleccionar a otro companero.")

        direccion = attrs["direccion"]
        if direccion == self.DIRECCION_COBRAR:
            acreedor = actor
            deudor = companero
            rol_solicitante = RolSolicitanteCompensacion.ACREEDOR
        else:
            acreedor = companero
            deudor = actor
            rol_solicitante = RolSolicitanteCompensacion.DEUDOR

        origen_ids = _normalize_origin_ids()
        if attrs["tipo"] == TipoIntercambio.SEMANA and len(origen_ids) > 1:
            raise serializers.ValidationError(
                "Para compensacion semanal envia solo una referencia de origen."
            )

        origen_queryset = AsignacionTarde.objects.select_related("semana", "usuario").filter(
            id__in=origen_ids,
            usuario=acreedor,
        )
        origen_by_id = {str(item.id): item for item in origen_queryset}
        missing_origin_ids = [item_id for item_id in origen_ids if item_id not in origen_by_id]
        if missing_origin_ids:
            raise serializers.ValidationError(
                "La asignacion origen debe existir y pertenecer al acreedor de la deuda."
            )

        origenes = [origen_by_id[item_id] for item_id in origen_ids]
        origen_referencia = origenes[0]

        origenes_reservados = SolicitudIntercambio.objects.filter(
            estado=EstadoSolicitud.PENDIENTE,
            asignacion_origen_id__in=[item.id for item in origenes],
        ).exists()
        if origenes_reservados:
            raise serializers.ValidationError(
                "Alguna asignacion origen ya esta comprometida en otra solicitud pendiente."
            )

        dias_estimados = len(origenes)
        if attrs["tipo"] == TipoIntercambio.SEMANA:
            dias_estimados = AsignacionTarde.objects.filter(
                semana=origen_referencia.semana,
                usuario=acreedor,
            ).count()
            if dias_estimados == 0:
                raise serializers.ValidationError("No hay asignaciones suficientes para compensar por semana.")

        deuda_actual = obtener_deuda(deudor=deudor, acreedor=acreedor)
        if deuda_actual < dias_estimados:
            raise serializers.ValidationError(
                f"No se puede compensar {dias_estimados} dias. Deuda disponible: {deuda_actual}."
            )

        attrs["solicitante"] = actor
        attrs["receptor"] = companero
        attrs["deudor"] = deudor
        attrs["acreedor"] = acreedor
        attrs["rol_solicitante_compensacion"] = rol_solicitante
        attrs["asignaciones_origen"] = origenes
        attrs["asignacion_origen"] = origen_referencia
        attrs["dias_estimados"] = dias_estimados
        return attrs

    def create(self, validated_data):
        validated_data.pop("usuario_id")
        validated_data.pop("direccion", None)
        validated_data.pop("asignacion_origen_id", None)
        validated_data.pop("asignacion_origen_ids", None)
        validated_data.pop("deudor")
        validated_data.pop("acreedor")

        asignaciones_origen = validated_data.pop("asignaciones_origen", [])
        asignacion_origen = validated_data.pop("asignacion_origen", None)
        if asignacion_origen is None and asignaciones_origen:
            asignacion_origen = asignaciones_origen[0]

        if validated_data["tipo"] == TipoIntercambio.DIA and len(asignaciones_origen) > 1:
            group_token = uuid.uuid4().hex[:10].upper()
            reason = validated_data.get("motivo", "").strip()
            prefixed_reason = f"[#GRUPO:{group_token}] {reason}".strip()

            solicitudes = []
            with transaction.atomic():
                for asignacion_origen_item in asignaciones_origen:
                    solicitudes.append(
                        SolicitudIntercambio.objects.create(
                            solicitante=validated_data["solicitante"],
                            receptor=validated_data["receptor"],
                            tipo=validated_data["tipo"],
                            asignacion_origen=asignacion_origen_item,
                            motivo=prefixed_reason,
                            modo_compensacion=ModoCompensacion.INMEDIATA,
                            estado=EstadoSolicitud.PENDIENTE,
                            es_compensacion=True,
                            rol_solicitante_compensacion=validated_data["rol_solicitante_compensacion"],
                            dias_estimados=1,
                        )
                    )

            return solicitudes

        solicitud = SolicitudIntercambio.objects.create(
            solicitante=validated_data["solicitante"],
            receptor=validated_data["receptor"],
            tipo=validated_data["tipo"],
            asignacion_origen=asignacion_origen,
            motivo=validated_data.get("motivo", ""),
            modo_compensacion=ModoCompensacion.INMEDIATA,
            estado=EstadoSolicitud.PENDIENTE,
            es_compensacion=True,
            rol_solicitante_compensacion=validated_data["rol_solicitante_compensacion"],
            dias_estimados=validated_data["dias_estimados"],
        )
        return solicitud


class IntercambiosMiasSerializer(serializers.Serializer):
    enviadas = SolicitudIntercambioSerializer(many=True)
    recibidas = SolicitudIntercambioSerializer(many=True)


class BolsaSaldoResumenSerializer(serializers.Serializer):
    usuario = UsuarioSerializer()
    me_deben = serializers.IntegerField()
    debo = serializers.IntegerField()


class GoogleCallbackSerializer(serializers.Serializer):
    code = serializers.CharField()
    state = serializers.CharField(required=False, allow_blank=True)
