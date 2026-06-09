# Credenciales de Acceso del Sistema SCHA

Este documento contiene las credenciales de las cuentas iniciales y de emergencia del sistema de Control de Horas Administrativas.

> [!WARNING]
> Guarde este documento en un lugar seguro. La cuenta de superusuario es de emergencia y posee privilegios totales, incluyendo el acceso al registro de auditoría general.

---

## 1. Administrador Inicial (Usuario Init)
Esta es la cuenta de administrador temporal creada automáticamente al iniciar o restablecer el sistema de fábrica.

*   **Nombre en el sistema:** Admin Temporal
*   **Correo electrónico:** `admin@sistema.local`
*   **Contraseña por defecto:** `admin123`
*   **Rol:** `administrador`
*   **Función:** Gestión general de colaboradores, horarios, SMTP, ajustes y configuración del sistema.

*Nota:* Al crear un administrador real en la plataforma, el sistema sugerirá completar la configuración inicial eliminando o desactivando esta cuenta temporal para mayor seguridad.

---

## 2. Superusuario de Emergencia (Oculto)
Esta cuenta de emergencia se genera de forma invisible en la base de datos y no se muestra en el directorio de colaboradores para ningún usuario (incluyendo a otros administradores).

*   **Nombre en el sistema:** Superusuario Sistema
*   **Correo electrónico:** `super@sistema.local`
*   **Contraseña por defecto:** `super123`
*   **Rol:** `superusuario`
*   **Función:** Cuenta de recuperación y auditoría de emergencia. Posee acceso exclusivo al módulo de **Auditoría General** de solicitudes.
