# SCHAP - Sistema de Control de Horas Administrativas y Permisos (SCHAP)

Sistema de gestión y control de horas administrativas, abonos de horas extras y solicitudes de permisos. El sistema permite a los trabajadores rendir horas extras por hitos de proyectos, solicitar permisos administrativos, y a las jefaturas y administradores aprobar/rechazar dichas solicitudes bajo una estructura jerárquica con cálculo automatizado de saldos.

---

## 🚀 Arquitectura y Tecnologías

El proyecto utiliza una arquitectura de tres capas y está completamente contenedorizado con Docker:

1. **Frontend (React)**:
   * Desarrollado en React 18 con **Vite**.
   * Estilo visual premium unificado (fuentes *Outfit*, *Inter* y *JetBrains Mono*) con modo claro y oscuro.
   * Calendario interactivo responsivo (vista mes, semana y día) adaptado al viewport y con desplazamiento interno.
   * Servido mediante un servidor web **Nginx**.

2. **Backend (API REST Flask)**:
   * API desarrollada en **Python 3.12** utilizando **Flask**.
   * Gestión de sesiones sin estado con tokens de seguridad JWT (`itsdangerous`).
   * Lógica robusta de jerarquía de aprobación: los jefes directos solo pueden actuar sobre solicitudes de sus subordinados directos.
   * Envío automático de notificaciones por email (SMTP).

3. **Base de Datos (PostgreSQL)**:
   * Motor relacional **PostgreSQL 15** para almacenamiento persistente y seguro.
   * Sincronización transaccional de balances (`sync_user_hours`) para evitar inconsistencias en el saldo neto.

---

## 🛠️ Requisitos Previos

Para ejecutar la aplicación es necesario tener instalado:
* **Docker** y **Docker Compose** (recomendado para producción y desarrollo unificado).
* O bien para desarrollo nativo: **Node.js 22+**, **pnpm** (frontend) y **Python 3.12+** (backend).

---

## 📦 Despliegue con Docker (Recomendado)

El despliegue con Docker levantará tres contenedores:
* `schap_postgres_db` (Base de Datos en puerto `5432`)
* `schap_backend_api` (API Flask en puerto `3000`)
* `schap_frontend_web` (Cliente Nginx en puerto `8282`)

### Pasos para levantar el servicio:

1. **Configurar Variables de Entorno**:
   El sistema utiliza variables de entorno para gestionar contraseñas y parámetros de configuración de forma segura. Crea el archivo `.env` en la raíz del proyecto copiando el archivo de ejemplo:
   ```bash
   cp .env.example .env
   # En Windows PowerShell: Copy-Item .env.example .env
   ```
   Luego, edita el archivo `.env` recién creado y ajusta los valores adecuados para tu entorno de despliegue (especialmente contraseñas, secretos de encriptación y datos del servidor SMTP).


2. **Construir y Levantar Contenedores**:
   ```bash
   docker compose up -d --build
   ```

3. **Acceder a la Aplicación**:
   * Frontend: [http://localhost:8282](http://localhost:8282)
   * API Backend: [http://localhost:3000/api](http://localhost:3000/api)

---

## 💻 Desarrollo Local (Sin Docker)

### 1. Levantar el Backend (Flask)
Navega a la carpeta `/backend`:
```bash
# Crear entorno virtual
python -m venv venv
source venv/bin/activate  # En Windows: .\venv\Scripts\activate

# Instalar dependencias
pip install -r requirements.txt

# Ejecutar servidor
python app.py
```

### 2. Levantar el Frontend (Vite)
Navega a la carpeta `/frontend`:
```bash
# Instalar pnpm (si no está instalado)
npm install -g pnpm

# Instalar dependencias del proyecto
pnpm install

# Iniciar servidor de desarrollo
pnpm run dev
```
El cliente estará disponible en [http://localhost:5173](http://localhost:5173).

---

## 📋 Reglas de Negocio y Factores de Multiplicación

El balance de horas de un colaborador se compone de **Horas Bolsa (Abonos)** menos **Horas Consumidas (Permisos)**:

### Factores de Rendición de Horas Extras:
Al registrar un hito de trabajo en terreno o viajes, el sistema aplica factores planos automáticos configurables en la base de datos (por defecto):
* **Alojamiento (Factor Plano)**: `4.5 horas` añadidas automáticamente por cada noche de alojamiento registrada.
* **Horas Extras (Lunes a Sábado)**: `150%` (1 hora extra trabajada = 1.5 horas acumuladas en la bolsa).
* **Feriados / Domingos**: `200%` (1 hora trabajada = 2.0 horas acumuladas en la bolsa).
* **Tiempo de Viaje**: `50%` (1 hora de viaje = 0.5 horas acumuladas en la bolsa).

### Solicitudes de Permisos:
* **Día Completo**: Descuenta la jornada laboral oficial configurada en la base de datos para ese día de la semana (Lunes a Jueves: **9.0h**, Viernes: **6.0h**). Si no hay horario establecido, por defecto descuenta **8.0h**.
* **Jornada Parcial**: Se calcula en base a la diferencia exacta entre las horas `desde` y `hasta` solicitadas por el colaborador. El sistema valida que el permiso se mantenga estrictamente dentro del horario laboral configurado del respectivo día.

---

## 🧹 Limpieza e Importación de Datos

* **Idempotencia en Importaciones**: El endpoint `/api/admin/import/requests` valida la preexistencia de cada registro (compara solicitante, fecha, tipo, comentario y horas) para evitar la duplicación de transacciones y prevenir balances alterados en importaciones masivas.
* **Sincronización de Balance**: El backend cuenta con una función trigger `sync_user_hours(user_id)` que recalcula de manera forense el estado de abonos y consumos consultando la base de datos en tiempo real cada vez que hay una modificación en el estado de las solicitudes.

---

## 📂 Estructura del Proyecto

```
/
├── docker-compose.yml       # Configuración de Docker Compose multi-contenedor
├── .env                     # Variables de entorno críticas (no subir a Git)
├── .env.example             # Plantilla de variables de entorno de ejemplo
├── backend/                 # API REST Flask
│   ├── app.py               # Servidor y registro de endpoints
│   ├── db.py                # Modelado de ORM (PostgreSQL) y lógica de sincronización
│   ├── audit/               # Endpoint de importaciones y registros
│   ├── auth/                # Endpoints de Login y JWT
│   ├── request/             # Gestión de Permisos y Notificaciones
│   ├── report/              # Rendiciones de Horas Extras e Hitos
│   └── Config/              # Ajustes globales de factores y horarios
└── frontend/                # Nginx & React (Vite SPA)
    ├── src/
    │   ├── pages/           # Vistas (Inicio, Calendario, DetalleSolicitud, etc.)
    │   ├── api.js           # Configuración del cliente fetch unificado
    │   └── styles.css       # Estilo visual responsivo unificado (Dark/Light mode)
    └── Dockerfile           # Compilación en etapa multi-stage con Nginx
```
