# SCHAP - Frontend (React SPA)

Este directorio contiene la aplicación cliente (Single Page Application) del sistema de **Control de Horas Administrativas (SCHAP)**. Está construida utilizando **React 18** y **Vite**, y está configurada para compilarse y servirse en producción con **Nginx**.

---

## 🛠️ Tecnologías Principales

* **Framework**: React 18 (SPA con JavaScript moderno).
* **Herramienta de Compilación**: Vite 5.
* **Enrutamiento**: React Router DOM 6 (con enrutamiento HashRouter para compatibilidad directa y prevención de fallos de rutas 404 en Nginx).
* **Estilos**: Vanilla CSS personalizado y responsivo ([styles.css](file:///c:/Users/Antonio/Desktop/VSCode/SCHAP%202/datos/Control%20de%20Horas%20Administrativas/frontend/src/styles.css)) con soporte nativo de variables CSS y modo oscuro/claro automático.
* **Tipografías**: *Outfit* (títulos), *Inter* (cuerpo) y *JetBrains Mono* (monocromo).

---

## 📦 Desarrollo y Comandos Locales

Para ejecutar el frontend de manera nativa en tu entorno de desarrollo, asegúrate de tener instalado el gestor de paquetes **pnpm** (recomendado) o **npm**.

1. **Instalar Dependencias**:
   ```bash
   pnpm install
   ```

2. **Ejecutar en Entorno de Desarrollo**:
   ```bash
   pnpm run dev
   ```
   La aplicación se abrirá en [http://localhost:5173](http://localhost:5173).

3. **Compilar para Producción**:
   ```bash
   pnpm run build
   ```
   Esto compilará la aplicación y creará los archivos estáticos listos para producción en el directorio `/dist`.

---

## 📂 Estructura de Vistas (Pages)

El código fuente de las pantallas principales del sistema se ubica en [src/pages/](file:///c:/Users/Antonio/Desktop/VSCode/SCHAP%202/datos/Control%20de%20Horas%20Administrativas/frontend/src/pages):

* **[Login.jsx](file:///c:/Users/Antonio/Desktop/VSCode/SCHAP%202/datos/Control%20de%20Horas%20Administrativas/frontend/src/pages/Login.jsx)**: Control de accesos JWT. Obliga a reestablecer la contraseña si el usuario inicia sesión por primera vez con su clave por defecto.
* **[Inicio.jsx](file:///c:/Users/Antonio/Desktop/VSCode/SCHAP%202/datos/Control%20de%20Horas%20Administrativas/frontend/src/pages/Inicio.jsx)**: Dashboard principal del colaborador. Muestra KPIs de balance de horas (Bolsa, Consumidas y Disponibles), gráfico de tendencias, y un banner/contador de aprobaciones pendientes exclusivo para jefaturas.
* **[Calendario.jsx](file:///c:/Users/Antonio/Desktop/VSCode/SCHAP%202/datos/Control%20de%20Horas%20Administrativas/frontend/src/pages/Calendario.jsx)**: Calendario responsivo del equipo. Ajusta de forma dinámica el número de filas en base a las semanas del mes (`1fr`) para caber completo en el alto de pantalla (`calc(100vh - 340px)`) sin scroll de página, permitiendo scroll interno de eventos en cada celda del día.
* **[Solicitar.jsx](file:///c:/Users/Antonio/Desktop/VSCode/SCHAP%202/datos/Control%20de%20Horas%20Administrativas/frontend/src/pages/Solicitar.jsx)**: Formulario interactivo para registrar solicitudes de Permisos o Notificaciones. Valida los bloques de horarios ingresados contra la jornada laboral del día.
* **[Solicitudes.jsx](file:///c:/Users/Antonio/Desktop/VSCode/SCHAP%202/datos/Control%20de%20Horas%20Administrativas/frontend/src/pages/Solicitudes.jsx)**: Listado general y filtros de las solicitudes realizadas.
* **[DetalleSolicitud.jsx](file:///c:/Users/Antonio/Desktop/VSCode/SCHAP%202/datos/Control%20de%20Horas%20Administrativas/frontend/src/pages/DetalleSolicitud.jsx)**: Línea de tiempo de estados (Creada, Jefe, Admin, Finalizada). Restringe los botones de Aprobar/Rechazar en el cliente basándose en el rol y la jerarquía de subordinados.
* **[Rendicion.jsx](file:///c:/Users/Antonio/Desktop/VSCode/SCHAP%202/datos/Control%20de%20Horas%20Administrativas/frontend/src/pages/Rendicion.jsx)**: Interfaz para rendir horas extras por proyecto especificando hitos de viaje, terreno y alojamiento.
* **[Reportes.jsx](file:///c:/Users/Antonio/Desktop/VSCode/SCHAP%202/datos/Control%20de%20Horas%20Administrativas/frontend/src/pages/Reportes.jsx)**: Búsqueda y filtrado avanzado de balances de horas de colaboradores y exportación a PDFs de auditoría mensual.
* **[Admin.jsx](file:///c:/Users/Antonio/Desktop/VSCode/SCHAP%202/datos/Control%20de%20Horas%20Administrativas/frontend/src/pages/Admin.jsx)**: Panel para configurar el SMTP, ajustar los factores matemáticos de cálculo y definir los horarios y días libres semanales.
* **[Auditoria.jsx](file:///c:/Users/Antonio/Desktop/VSCode/SCHAP%202/datos/Control%20de%20Horas%20Administrativas/frontend/src/pages/Auditoria.jsx)**: Log histórico de acciones críticas (exclusivo para superusuarios).

---

## 🐋 Despliegue en Docker

El frontend se construye de manera automatizada usando una compilación multi-etapa (*multi-stage build*) especificada en el [Dockerfile](file:///c:/Users/Antonio/Desktop/VSCode/SCHAP%202/datos/Control%20de%20Horas%20Administrativas/frontend/Dockerfile):

1. **Etapa 1**: Usa `node:22-alpine` para instalar dependencias mediante `pnpm` y compilar el proyecto (`dist/`).
2. **Etapa 2**: Copia los estáticos compilados en un contenedor ligero de `nginx:alpine` y los sirve en el puerto estándar `80` (expuesto como `8282` hacia la máquina host mediante Docker Compose).
3. **Nginx Config**: Utiliza el archivo [nginx.conf](file:///c:/Users/Antonio/Desktop/VSCode/SCHAP%202/datos/Control%20de%20Horas%20Administrativas/frontend/nginx.conf) para resolver el enrutamiento interno de la Single Page Application.
