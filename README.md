# Netflow - Gestor de Turno de Tarde Semanal

Monorepo con backend Django + DRF + JWT y frontend React + TypeScript + Tailwind para gestionar turnos de tarde, intercambios entre companeros, bolsa de dias y sincronizacion con Google Calendar.

## Estructura

- `backend`: API REST (Django + DRF + PostgreSQL)
- `frontend`: SPA (React + TypeScript + Tailwind)

## Funcionalidad implementada

- Autenticacion JWT (`/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`)
- Gestion de semanas y asignaciones de tarde
- Solicitudes de intercambio (dia/semana)
- Aceptar/rechazar/cancelar solicitudes
- Bolsa de dias con saldos por parejas e historico de movimientos
- Compensaciones desde bolsa
- Base de integracion Google Calendar (connect URL, callback, sync semanal y global, disconnect)
- Auditoria de eventos clave

## Backend - Setup local

### 1. Instalar dependencias

```bash
cd backend
python -m pip install -r requirements.txt
```

### 2. Configurar variables de entorno

Ya tienes creado `backend/.env` con Supabase.

Si necesitas recrearlo:

```bash
cp .env.example .env
```

### 3. Migraciones

```bash
python manage.py makemigrations
python manage.py migrate
```

### 4. Crear superusuario (opcional)

```bash
python manage.py createsuperuser
```

### 5. Ejecutar API

```bash
python manage.py runserver
```

API base local: `http://localhost:8000/api`

## Frontend - Setup local

### 1. Instalar dependencias

```bash
cd frontend
npm install
```

### 2. Configurar variables

```bash
cp .env.example .env
```

Valor por defecto:

```env
VITE_API_URL=http://localhost:8000/api
```

### 3. Ejecutar SPA

```bash
npm run dev
```

Frontend local: `http://localhost:5173`

## Despliegue en Render + Supabase

### Backend (Render Web Service)

- Root directory: `backend`
- Build command: `pip install -r requirements.txt`
- Start command:

```bash
python manage.py migrate && gunicorn config.wsgi:application --bind 0.0.0.0:$PORT
```

Variables de entorno minimas en Render:

- `SECRET_KEY`
- `DEBUG=False`
- `ALLOWED_HOSTS=<tu-backend>.onrender.com`
- `CORS_ALLOWED_ORIGINS=https://<tu-frontend>.onrender.com`
- `CSRF_TRUSTED_ORIGINS=https://<tu-frontend>.onrender.com`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `DB_HOST`
- `DB_PORT=6543`
- `DB_SSLMODE=require`
- `TIME_ZONE=Europe/Madrid`

### Frontend (Render Static Site)

- Root directory: `frontend`
- Build command: `npm ci && npm run build`
- Publish directory: `dist`

Variable en Render:

- `VITE_API_URL=https://<tu-backend>.onrender.com/api`

## Google Calendar (OAuth)

Configura estas variables en backend:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `GOOGLE_CALENDAR_SCOPES` (por defecto: `https://www.googleapis.com/auth/calendar`)

Flujo:

1. Llamar a `GET /api/calendar/google/connect-url`
2. Autorizar en Google
3. Enviar `code` a `POST /api/calendar/google/callback`
4. Sincronizar con `POST /api/calendar/google/sync/me` o `POST /api/calendar/google/sync/semana/{id}`

## Endpoints principales

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `GET|POST /api/semanas`
- `GET /api/semanas/{id}`
- `POST /api/semanas/{id}/publicar`
- `POST /api/asignaciones-tarde`
- `PATCH /api/asignaciones-tarde/{id}`
- `GET /api/asignaciones-tarde/mias`
- `POST /api/intercambios`
- `GET /api/intercambios/mias`
- `POST /api/intercambios/{id}/aceptar`
- `POST /api/intercambios/{id}/rechazar`
- `POST /api/intercambios/{id}/cancelar`
- `GET /api/bolsa/saldos`
- `GET /api/bolsa/saldos/{usuarioId}`
- `GET /api/bolsa/movimientos`
- `POST /api/bolsa/compensar`
- `GET /api/calendar/google/connect-url`
- `POST /api/calendar/google/callback`
- `POST /api/calendar/google/sync/semana/{id}`
- `POST /api/calendar/google/sync/me`
- `DELETE /api/calendar/google/disconnect`
