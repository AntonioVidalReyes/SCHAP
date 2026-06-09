import React, { useState, useEffect } from 'react'
import api from '../api'

export default function Login({ onLoginSuccess }) {
  const [view, setView] = useState('login') // 'login', 'register', 'recovery', 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('')
  
  // State logs and statuses
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [systemSetup, setSystemSetup] = useState({
    setup_complete: true,
    default_user_exists: false
  })
  const [publicRegEnabled, setPublicRegEnabled] = useState(true)

  // Validate setup state on mount
  useEffect(() => {
    async function checkSetup() {
      try {
        const res = await api.get('/api/check-setup')
        if (res.ok) {
          const data = await res.json()
          setSystemSetup(data)
          
          if (data.setup_complete) {
            // Check public registration status
            const regRes = await api.get('/api/config/public-registration')
            if (regRes.ok) {
              const regData = await regRes.json()
              setPublicRegEnabled(regData.enabled)
            }
          }
        }
      } catch (e) {
        console.error("Setup check error:", e)
      }
    }
    checkSetup()
  }, [view])

  const handleLogin = async (e) => {
    if (e) e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    if (!email.trim() || !password) {
      setErrorMsg("Email y contraseña requeridos.")
      return
    }

    try {
      const res = await api.post('/api/login', { 
        email: email.trim().toLowerCase(), 
        password 
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || "Credenciales inválidas.")
        return
      }

      localStorage.setItem("authToken", data.token)
      if (data.is_default_user) {
        localStorage.setItem("isDefaultUser", "true")
      } else {
        localStorage.removeItem("isDefaultUser")
      }

      onLoginSuccess()
    } catch (err) {
      setErrorMsg("Error de red: " + err.message)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    if (!name.trim() || !regEmail.trim() || !regPassword) {
      setErrorMsg("Todos los campos son obligatorios.")
      return
    }

    try {
      const res = await api.post('/api/register', {
        name: name.trim(),
        email: regEmail.trim().toLowerCase(),
        password: regPassword
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || "No se pudo crear el usuario.")
        return
      }

      setSuccessMsg("Usuario creado. Ahora puedes iniciar sesión.")
      setTimeout(() => {
        setSuccessMsg('')
        setName('')
        setRegEmail('')
        setRegPassword('')
        setView('login')
      }, 2000)
    } catch (err) {
      setErrorMsg("Error de red: " + err.message)
    }
  }

  const handleRequestRecovery = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    if (!recoveryEmail.trim()) {
      setErrorMsg("Ingrese su correo electrónico.")
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(recoveryEmail.trim())) {
      setErrorMsg("Ingrese un correo electrónico válido.")
      return
    }

    try {
      const res = await api.post('/api/password-recovery/request', {
        email: recoveryEmail.trim().toLowerCase()
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || "No se pudo enviar el código.")
        return
      }

      setSuccessMsg("Código de recuperación enviado. Revise su correo.")
      setTimeout(() => {
        setSuccessMsg('')
        setView('reset')
      }, 1500)
    } catch (err) {
      setErrorMsg("Error de red: " + err.message)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    if (!resetCode.trim()) {
      setErrorMsg("Ingrese el código de verificación.")
      return
    }

    if (resetCode.trim().length !== 6) {
      setErrorMsg("El código debe tener 6 dígitos.")
      return
    }

    if (!resetPassword || resetPassword.length < 4) {
      setErrorMsg("La contraseña debe tener al menos 4 caracteres.")
      return
    }

    if (resetPassword !== resetPasswordConfirm) {
      setErrorMsg("Las contraseñas no coinciden.")
      return
    }

    try {
      const res = await api.post('/api/password-recovery/reset', {
        email: recoveryEmail.trim().toLowerCase(),
        code: resetCode.trim(),
        new_password: resetPassword
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || "No se pudo cambiar la contraseña.")
        return
      }

      setSuccessMsg("¡Contraseña actualizada! Ya puede iniciar sesión.")
      setTimeout(() => {
        setSuccessMsg('')
        setResetCode('')
        setResetPassword('')
        setResetPasswordConfirm('')
        setView('login')
      }, 2000)
    } catch (err) {
      setErrorMsg("Error de red: " + err.message)
    }
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--text)',
      padding: '20px'
    }}>
      <div className="login-box" style={{
        width: '100%',
        maxWidth: '420px',
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius)',
        padding: '40px',
        boxShadow: 'var(--shadow-lg)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '30px' }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: '800', margin: '0 0 10px 0', letterSpacing: '0.05em', color: 'var(--text)' }}>
            SCHAP
          </h2>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: '0.9rem' }}>
            Control de Horas Administrativas
          </p>
        </div>

        {errorMsg && (
          <div style={{
            background: 'rgba(220, 38, 38, 0.1)',
            borderLeft: '4px solid var(--danger)',
            color: 'var(--danger)',
            padding: '12px',
            borderRadius: '0 8px 8px 0',
            fontSize: '0.88rem',
            marginBottom: '20px'
          }}>
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{
            background: 'rgba(22, 163, 74, 0.1)',
            borderLeft: '4px solid var(--success)',
            color: 'var(--success)',
            padding: '12px',
            borderRadius: '0 8px 8px 0',
            fontSize: '0.88rem',
            marginBottom: '20px'
          }}>
            {successMsg}
          </div>
        )}

        {/* ==================== LOGIN VIEW ==================== */}
        {view === 'login' && (
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px', fontSize: '0.88rem' }}>
                Correo Electrónico
              </label>
              <input
                type="email"
                placeholder="ejemplo@schap.cl"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', boxSizing: 'border-box' }}
                required
              />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px', fontSize: '0.88rem' }}>
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', boxSizing: 'border-box' }}
                required
              />
            </div>

            <button type="submit" style={{
              width: '100%',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              padding: '12px',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '20px'
            }}>
              Iniciar sesión
            </button>

            {!systemSetup.setup_complete && (
              <div id="default-credentials" style={{
                background: 'rgba(37, 99, 235, 0.08)',
                border: '1px solid rgba(37, 99, 235, 0.2)',
                borderRadius: '8px',
                padding: '14px',
                marginBottom: '20px',
                fontSize: '0.82rem'
              }}>
                <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: 'var(--accent)' }}>
                  <i className="fa fa-info-circle"></i> Configuración Inicial Pendiente
                </p>
                <p style={{ margin: '0 0 6px 0' }}>Utilice las credenciales por defecto:</p>
                <p style={{ margin: '0 0 4px 0' }}><strong>Usuario:</strong> admin@sistema.local</p>
                <p style={{ margin: 0 }}><strong>Contraseña:</strong> admin123</p>
              </div>
            )}

            <div style={{ textAlign: 'center', fontSize: '0.88rem' }}>
              {systemSetup.setup_complete && publicRegEnabled && (
                <p style={{ margin: '0 0 10px 0' }}>
                  ¿No tienes una cuenta?{' '}
                  <a href="#register" onClick={(e) => { e.preventDefault(); setView('register'); setErrorMsg(''); }} style={{ color: 'var(--accent)', fontWeight: '600', textDecoration: 'none' }}>
                    Regístrate
                  </a>
                </p>
              )}
              {systemSetup.setup_complete && (
                <p style={{ margin: 0 }}>
                  <a href="#recovery" onClick={(e) => { e.preventDefault(); setView('recovery'); setErrorMsg(''); }} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                    ¿Olvidaste tu contraseña?
                  </a>
                </p>
              )}
            </div>
          </form>
        )}

        {/* ==================== REGISTER VIEW ==================== */}
        {view === 'register' && (
          <form onSubmit={handleRegister}>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px', fontSize: '0.88rem' }}>
                Nombre Completo
              </label>
              <input
                type="text"
                placeholder="Juan Pérez"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', boxSizing: 'border-box' }}
                required
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px', fontSize: '0.88rem' }}>
                Correo Electrónico
              </label>
              <input
                type="email"
                placeholder="juan.perez@schap.cl"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', boxSizing: 'border-box' }}
                required
              />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px', fontSize: '0.88rem' }}>
                Contraseña
              </label>
              <input
                type="password"
                placeholder="Min. 4 caracteres"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', boxSizing: 'border-box' }}
                required
              />
            </div>

            <button type="submit" style={{
              width: '100%',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              padding: '12px',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '20px'
            }}>
              Registrarse
            </button>

            <div style={{ textAlign: 'center', fontSize: '0.88rem' }}>
              <p style={{ margin: 0 }}>
                ¿Ya tienes una cuenta?{' '}
                <a href="#login" onClick={(e) => { e.preventDefault(); setView('login'); setErrorMsg(''); }} style={{ color: 'var(--accent)', fontWeight: '600', textDecoration: 'none' }}>
                  Inicia Sesión
                </a>
              </p>
            </div>
          </form>
        )}

        {/* ==================== RECOVERY REQUEST VIEW ==================== */}
        {view === 'recovery' && (
          <form onSubmit={handleRequestRecovery}>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.4' }}>
              Ingrese su dirección de correo electrónico registrado. Le enviaremos un código de 6 dígitos para validar su identidad y restablecer su clave.
            </p>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px', fontSize: '0.88rem' }}>
                Correo Electrónico
              </label>
              <input
                type="email"
                placeholder="ejemplo@schap.cl"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', boxSizing: 'border-box' }}
                required
              />
            </div>

            <button type="submit" style={{
              width: '100%',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              padding: '12px',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '20px'
            }}>
              Enviar Código
            </button>

            <div style={{ textAlign: 'center', fontSize: '0.88rem' }}>
              <p style={{ margin: 0 }}>
                <a href="#login" onClick={(e) => { e.preventDefault(); setView('login'); setErrorMsg(''); }} style={{ color: 'var(--accent)', fontWeight: '600', textDecoration: 'none' }}>
                  Volver al Login
                </a>
              </p>
            </div>
          </form>
        )}

        {/* ==================== RESET PASSWORD VIEW ==================== */}
        {view === 'reset' && (
          <form onSubmit={handleResetPassword}>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.4' }}>
              Ingrese el código de verificación enviado a <strong>{recoveryEmail}</strong> y configure su nueva contraseña.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px', fontSize: '0.88rem' }}>
                Código de 6 dígitos
              </label>
              <input
                type="text"
                placeholder="123456"
                maxLength={6}
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', boxSizing: 'border-box', letterSpacing: '0.2em', textAlign: 'center', fontWeight: 'bold' }}
                required
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px', fontSize: '0.88rem' }}>
                Nueva Contraseña
              </label>
              <input
                type="password"
                placeholder="Min. 4 caracteres"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', boxSizing: 'border-box' }}
                required
              />
            </div>

            <div style={{ marginBottom: '25px' }}>
              <label style={{ display: 'block', fontWeight: '500', marginBottom: '8px', fontSize: '0.88rem' }}>
                Confirmar Contraseña
              </label>
              <input
                type="password"
                placeholder="Repita la nueva contraseña"
                value={resetPasswordConfirm}
                onChange={(e) => setResetPasswordConfirm(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', boxSizing: 'border-box' }}
                required
              />
            </div>

            <button type="submit" style={{
              width: '100%',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              padding: '12px',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '20px'
            }}>
              Restablecer Clave
            </button>

            <div style={{ textAlign: 'center', fontSize: '0.88rem' }}>
              <p style={{ margin: 0 }}>
                ¿Desea solicitar un nuevo código?{' '}
                <a href="#recovery" onClick={(e) => { e.preventDefault(); setView('recovery'); setErrorMsg(''); }} style={{ color: 'var(--accent)', fontWeight: '600', textDecoration: 'none' }}>
                  Reenviar
                </a>
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
