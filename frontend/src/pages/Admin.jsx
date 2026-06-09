import React, { useState, useEffect } from 'react'
import api from '../api'

export default function Admin({ currentUser }) {
  const [activeSubTab, setActiveSubTab] = useState('usuarios') // 'usuarios', 'abonos', 'horarios', 'smtp'
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [feedbackMsg, setFeedbackMsg] = useState({ type: '', text: '' })

  // Users Tab States
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null) // null for new
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('trabajador')
  const [bossId, setBossId] = useState('')
  const [mustChangePassword, setMustChangePassword] = useState(false)

  // Abonos Tab States
  const [selectedAbonoUserId, setSelectedAbonoUserId] = useState('')
  const [abonoHours, setAbonoHours] = useState('')
  const abonoType = 'Abono'
  const [abonoComment, setAbonoComment] = useState('')

  // Schedule Tab States
  const [schedule, setSchedule] = useState({
    monday: { start: '08:30', end: '18:30', off: false },
    tuesday: { start: '08:30', end: '18:30', off: false },
    wednesday: { start: '08:30', end: '18:30', off: false },
    thursday: { start: '08:30', end: '18:30', off: false },
    friday: { start: '08:30', end: '18:30', off: false },
    saturday: { start: '', end: '', off: true },
    sunday: { start: '', end: '', off: true }
  })

  // SMTP Settings States
  const [smtp, setSmtp] = useState({
    enabled: false,
    host: '',
    port: 587,
    user: '',
    password: '',
    from_email: '',
    use_tls: true
  })
  const [testEmail, setTestEmail] = useState('')
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [publicRegEnabled, setPublicRegEnabled] = useState(true)

  // Factores Tab States
  const [factores, setFactores] = useState({
    alojamiento: 4.5,
    feriado: 200,
    extras: 150,
    viaje: 50
  })

  // Timezone State
  const [systemTimezone, setSystemTimezone] = useState('America/Santiago')
  const [resetting, setResetting] = useState(false)

  // Setup completion indicator (delete default user)
  const [setupState, setSetupState] = useState({
    setup_complete: true,
    default_user_exists: false
  })

  const loadUsers = async () => {
    setLoadingUsers(true)
    try {
      const res = await api.get('/api/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingUsers(false)
    }
  }

  const loadConfigs = async () => {
    try {
      const [schedRes, smtpRes, setupRes, regRes, factoresRes, tzRes] = await Promise.all([
        api.get('/api/config/schedule'),
        api.get('/api/config/smtp'),
        api.get('/api/check-setup'),
        api.get('/api/config/public-registration'),
        api.get('/api/config/factores'),
        api.get('/api/config/system_timezone')
      ])

      if (schedRes.ok) {
        const data = await schedRes.json()
        if (data.schedule) setSchedule(data.schedule)
      }
      if (smtpRes.ok) {
        const data = await smtpRes.json()
        if (data.smtp) setSmtp(data.smtp)
      }
      if (setupRes.ok) {
        const data = await setupRes.json()
        setSetupState(data)
      }
      if (regRes.ok) {
        const data = await regRes.json()
        setPublicRegEnabled(data.enabled)
      }
      if (factoresRes.ok) {
        const data = await factoresRes.json()
        if (data.factores) setFactores(data.factores)
      }
      if (tzRes.ok) {
        const data = await tzRes.json()
        if (data.value) {
          const tz = typeof data.value === 'object' && data.value !== null ? (data.value.value || 'America/Santiago') : data.value
          setSystemTimezone(tz)
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (currentUser?.role === 'administrador' || currentUser?.role === 'superusuario') {
      loadUsers()
      loadConfigs()
    }
  }, [currentUser])

  const showFeedback = (type, text) => {
    setFeedbackMsg({ type, text })
    setTimeout(() => setFeedbackMsg({ type: '', text: '' }), 5000)
  }

  // Handle User Save (New / Edit)
  const handleSaveUser = async (e) => {
    e.preventDefault()
    
    if (!name.trim() || !email.trim()) {
      showFeedback('error', 'Nombre y Email son obligatorios.')
      return
    }

    const payload = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      boss_id: bossId ? parseInt(bossId) : null,
      must_change_password: mustChangePassword ? 1 : 0
    }

    if (!editingUser) {
      const finalPass = password || 'schap123'
      if (finalPass.length < 4) {
        showFeedback('error', 'La contraseña debe tener al menos 4 caracteres.')
        return
      }
      payload.password = finalPass
    }

    try {
      let res
      if (editingUser) {
        res = await api.patch(`/api/users/${editingUser.id}`, payload)
      } else {
        res = await api.post('/api/users_create', payload)
      }

      const data = await res.json()
      if (!res.ok) {
        showFeedback('error', data.error || 'Error al guardar usuario.')
        return
      }

      showFeedback('success', editingUser ? 'Usuario actualizado.' : 'Usuario creado con éxito.')
      setShowUserModal(false)
      loadUsers()
      loadConfigs() // Refresh setup status
    } catch (err) {
      showFeedback('error', 'Error de red.')
    }
  }

  // Toggle user active status
  const handleToggleActive = async (user) => {
    const nextActive = user.active === 1 ? 0 : 1
    try {
      const res = await api.patch(`/api/users/${user.id}`, { active: nextActive })
      if (res.ok) {
        showFeedback('success', nextActive === 1 ? 'Usuario activado.' : 'Usuario desactivado.')
        loadUsers()
      } else {
        const data = await res.json()
        showFeedback('error', data.error || 'Error al cambiar estado.')
      }
    } catch (err) {
      showFeedback('error', 'Error de red.')
    }
  }

  // Edit User Trigger
  const startEditUser = (user) => {
    setEditingUser(user)
    setName(user.name || '')
    setEmail(user.email || '')
    setRole(user.role || 'trabajador')
    setBossId(user.boss_id || '')
    setMustChangePassword(user.must_change_password === 1)
    setPassword('')
    setShowUserModal(true)
  }

  const startNewUser = () => {
    setEditingUser(null)
    setName('')
    setEmail('')
    setRole('trabajador')
    setBossId('')
    setMustChangePassword(false)
    setPassword('')
    setShowUserModal(true)
  }

  // Complete Setup Trigger (remove default admin)
  const handleCompleteSetup = async () => {
    try {
      const res = await api.post('/api/complete-setup')
      const data = await res.json()
      if (res.ok) {
        showFeedback('success', data.message)
        loadConfigs()
        loadUsers()
      } else {
        showFeedback('error', data.error)
      }
    } catch (err) {
      showFeedback('error', 'Error de red.')
    }
  }

  // Abonos Tab save
  const handleSaveAbono = async (e) => {
    e.preventDefault()

    if (!selectedAbonoUserId) {
      showFeedback('error', 'Debe seleccionar un colaborador.')
      return
    }

    const hours = parseFloat(abonoHours)
    if (isNaN(hours) || hours <= 0) {
      showFeedback('error', 'Las horas deben ser un número mayor a 0.')
      return
    }

    try {
      const res = await api.post(`/api/users/${selectedAbonoUserId}/abonar`, {
        hours,
        type: abonoType,
        comment: abonoComment
      })

      const data = await res.json()
      if (res.ok) {
        showFeedback('success', 'Abono registrado con éxito.')
        setAbonoHours('')
        setAbonoComment('')
        loadUsers()
      } else {
        showFeedback('error', data.error || 'Error al abonar.')
      }
    } catch (err) {
      showFeedback('error', 'Error de red.')
    }
  }

  // Schedule Tab Save
  const handleSaveSchedule = async (e) => {
    e.preventDefault()
    try {
      const res = await api.post('/api/config/schedule', { schedule })
      const data = await res.json()
      if (res.ok) {
        showFeedback('success', data.message)
      } else {
        showFeedback('error', data.error)
      }
    } catch (err) {
      showFeedback('error', 'Error de red.')
    }
  }

  const handleUpdateScheduleDay = (day, field, value) => {
    const updated = { ...schedule }
    updated[day][field] = value
    setSchedule(updated)
  }

  // Factores Tab Save
  const handleSaveFactores = async (e) => {
    e.preventDefault()
    try {
      const res = await api.post('/api/config/factores', { factores })
      const data = await res.json()
      if (res.ok) {
        showFeedback('success', data.message || 'Factores guardados correctamente.')
      } else {
        showFeedback('error', data.error || 'Error al guardar factores.')
      }
    } catch (err) {
      showFeedback('error', 'Error de red.')
    }
  }

  const handleUpdateFactor = (field, value) => {
    setFactores({
      ...factores,
      [field]: parseFloat(value) || 0
    })
  }

  // Timezone Save
  const handleSaveTimezone = async (e) => {
    e.preventDefault()
    try {
      const res = await api.post('/api/config/system_timezone', { value: systemTimezone })
      const data = await res.json()
      if (res.ok) {
        showFeedback('success', data.message || 'Zona horaria guardada.')
      } else {
        showFeedback('error', data.error || 'Error al guardar zona horaria.')
      }
    } catch (err) {
      showFeedback('error', 'Error de red.')
    }
  }

  const handleSystemReset = async () => {
    const confirm1 = window.confirm("¿Está seguro de que desea restablecer de fábrica el sistema y la base de datos?")
    if (!confirm1) return

    const confirm2 = window.confirm("¡ADVERTENCIA! Esta acción es irreversible. Se borrarán todos los datos (usuarios, solicitudes, rendiciones) y se reiniciará el sistema. ¿Confirmar restablecimiento definitivo?")
    if (!confirm2) return

    setResetting(true)
    try {
      const res = await api.post('/api/config/reset-system')
      const data = await res.json()
      if (res.ok) {
        showFeedback('success', data.message)
        localStorage.removeItem('authToken')
        localStorage.removeItem('isDefaultUser')
        setTimeout(() => {
          setResetting(false)
          window.location.href = '#/login'
          window.location.reload()
        }, 3000)
      } else {
        showFeedback('error', data.error || 'Error al restablecer el sistema.')
        setResetting(false)
      }
    } catch (err) {
      showFeedback('error', 'Error de red al restablecer el sistema.')
      setResetting(false)
    }
  }

  // SMTP Settings Save
  const handleSaveSmtp = async (e) => {
    e.preventDefault()
    try {
      const res = await api.post('/api/config/smtp', { smtp })
      const data = await res.json()
      if (res.ok) {
        showFeedback('success', data.message)
      } else {
        showFeedback('error', data.error)
      }
    } catch (err) {
      showFeedback('error', 'Error de red.')
    }
  }

  const handleTestSmtp = async (e) => {
    e.preventDefault()
    if (!testEmail.trim()) {
      showFeedback('error', 'Debe ingresar un email para enviar la prueba.')
      return
    }

    setTestingSmtp(true)
    try {
      const res = await api.post('/api/config/smtp/test', {
        email: testEmail.trim(),
        smtp
      })
      const data = await res.json()
      if (res.ok) {
        showFeedback('success', data.message)
        setTestEmail('')
      } else {
        showFeedback('error', data.error)
      }
    } catch (err) {
      showFeedback('error', 'Error de red.')
    } finally {
      setTestingSmtp(false)
    }
  }

  const handleTogglePublicRegistration = async (nextVal) => {
    try {
      const res = await api.post('/api/config/public-registration', { enabled: nextVal })
      const data = await res.json()
      if (res.ok) {
        setPublicRegEnabled(data.enabled)
        showFeedback('success', data.message)
      }
    } catch (err) {
      showFeedback('error', 'Error de red.')
    }
  }

  if (currentUser?.role !== 'administrador' && currentUser?.role !== 'superusuario') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--danger)' }}>
        <h2>Acceso Denegado</h2>
        <p>Solo los usuarios administradores pueden ingresar al panel de administración.</p>
      </div>
    )
  }

  return (
    <div className="page-container">
      
      {/* Title & Feedback banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: '1.8rem', fontWeight: '800' }}>Panel de Control Admin</h1>
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.88rem' }}>Gestione usuarios, horarios de trabajo, SMTP y configuraciones globales.</p>
        </div>
        {setupState.default_user_exists && (
          <button 
            onClick={handleCompleteSetup}
            className="btn" 
            style={{ padding: '10px 18px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
          >
            <i className="fa fa-triangle-exclamation"></i> Completar Configuración Inicial
          </button>
        )}
      </div>

      {feedbackMsg.text && (
        <div style={{
          background: feedbackMsg.type === 'success' ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)',
          borderLeft: `4px solid ${feedbackMsg.type === 'success' ? 'var(--success)' : 'var(--danger)'}`,
          color: feedbackMsg.type === 'success' ? 'var(--success)' : 'var(--danger)',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '0.88rem',
          marginBottom: '20px',
          fontWeight: '600'
        }}>
          {feedbackMsg.text}
        </div>
      )}

      {/* Sub-Tabs Navigation */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', borderBottom: '1px solid var(--card-border)', paddingBottom: '10px', overflowX: 'auto' }}>
        {[
          { key: 'usuarios', label: 'Colaboradores', icon: 'fa-users' },
          { key: 'abonos', label: 'Abono', icon: 'fa-gift' },
          { key: 'horarios', label: 'Horarios de Trabajo', icon: 'fa-calendar-days' },
          { key: 'smtp', label: 'Configuración SMTP / Sistema', icon: 'fa-gears' }
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            style={{
              background: activeSubTab === tab.key ? 'var(--accent)' : 'none',
              border: 'none',
              borderRadius: '6px',
              color: activeSubTab === tab.key ? '#fff' : 'var(--text-muted)',
              padding: '10px 18px',
              fontSize: '0.88rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              whiteSpace: 'nowrap'
            }}
          >
            <i className={`fa ${tab.icon}`}></i> {tab.label}
          </button>
        ))}
      </div>

      {/* ==================== SUBTAB: COLABORADORES ==================== */}
      {activeSubTab === 'usuarios' && (
        <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', padding: '24px', boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>Directorio de Colaboradores</h3>
            <button onClick={startNewUser} style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
              <i className="fa fa-user-plus"></i> Crear Colaborador
            </button>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 10px' }}>ID</th>
                <th style={{ padding: '12px 10px' }}>Nombre</th>
                <th style={{ padding: '12px 10px' }}>Email</th>
                <th style={{ padding: '12px 10px' }}>Rol</th>
                <th style={{ padding: '12px 10px' }}>Bolsa/Horas</th>
                <th style={{ padding: '12px 10px' }}>Estado</th>
                <th style={{ padding: '12px 10px', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const saldo = (u.bonus_hours || 0) - (u.used_hours || 0)
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--card-border)' }}>
                    <td style={{ padding: '12px 10px', fontWeight: '600' }}>#{u.id}</td>
                    <td style={{ padding: '12px 10px', fontWeight: '500' }}>{u.name}</td>
                    <td style={{ padding: '12px 10px' }}>{u.email}</td>
                    <td style={{ padding: '12px 10px', textTransform: 'capitalize' }}>
                      <span className={`role-badge role-${u.role}`} style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '700' }}>
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '12px 10px', fontWeight: 'bold', color: saldo < 0 ? 'var(--danger)' : 'var(--text)' }}>
                      {saldo.toFixed(1)} h
                    </td>
                    <td style={{ padding: '12px 10px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 'bold',
                        background: u.active === 1 ? 'rgba(16, 163, 74, 0.15)' : 'rgba(220, 38, 38, 0.15)',
                        color: u.active === 1 ? 'var(--success)' : 'var(--danger)'
                      }}>
                        {u.active === 1 ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button onClick={() => startEditUser(u)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '1rem' }} title="Editar">
                          <i className="fa fa-pen-to-square"></i>
                        </button>
                        <button onClick={() => handleToggleActive(u)} style={{ background: 'none', border: 'none', color: u.active === 1 ? 'var(--danger)' : 'var(--success)', cursor: 'pointer', fontSize: '1.1rem' }} title={u.active === 1 ? "Desactivar" : "Activar"}>
                          <i className={`fa ${u.active === 1 ? 'fa-toggle-on' : 'fa-toggle-off'}`}></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ==================== SUBTAB: ABONO ==================== */}
      {activeSubTab === 'abonos' && (
        <div style={{ maxWidth: '600px', margin: '0 auto', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', padding: '24px', boxShadow: 'var(--shadow)' }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: '700' }}>Abono de Horas</h3>
          <form onSubmit={handleSaveAbono}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.85rem' }}>Colaborador Afectado</label>
              <select
                value={selectedAbonoUserId}
                onChange={(e) => setSelectedAbonoUserId(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
                required
              >
                <option value="">Seleccione colaborador...</option>
                {users.filter(u => u.active === 1).map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.85rem' }}>Horas a Abonar</label>
              <input
                type="number"
                step="0.1"
                placeholder="Ej: 5.5"
                value={abonoHours}
                onChange={(e) => setAbonoHours(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                required
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', fontSize: '0.85rem' }}>Concepto / Comentario</label>
              <textarea
                placeholder="Motivo del abono..."
                value={abonoComment}
                onChange={(e) => setAbonoComment(e.target.value)}
                style={{ width: '100%', padding: '10px', minHeight: '80px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                required
              />
            </div>

            <button type="submit" style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
              Guardar Ajuste
            </button>
          </form>
        </div>
      )}

      {/* ==================== SUBTAB: HORARIOS ==================== */}
      {activeSubTab === 'horarios' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '30px', alignItems: 'start' }}>
          {/* Card 1: Horarios de Trabajo */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', padding: '24px', boxShadow: 'var(--shadow)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: '700' }}>Configuración de Jornada Laboral</h3>
            <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Los límites configurados restringen las horas que los usuarios pueden notificar o solicitar como permisos en el calendario.</p>

            <form onSubmit={handleSaveSchedule}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', marginBottom: '24px' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '10px' }}>Día</th>
                    <th style={{ padding: '10px' }}>Hora Entrada</th>
                    <th style={{ padding: '10px' }}>Hora Salida</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>No Laboral</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { key: 'monday', label: 'Lunes' },
                    { key: 'tuesday', label: 'Martes' },
                    { key: 'wednesday', label: 'Miércoles' },
                    { key: 'thursday', label: 'Jueves' },
                    { key: 'friday', label: 'Viernes' },
                    { key: 'saturday', label: 'Sábado' },
                    { key: 'sunday', label: 'Domingo' }
                  ].map(dia => {
                    const d = schedule[dia.key] || {}
                    return (
                      <tr key={dia.key} style={{ borderBottom: '1px solid var(--card-border)', opacity: d.off ? 0.6 : 1 }}>
                        <td style={{ padding: '10px', fontWeight: '600' }}>{dia.label}</td>
                        <td style={{ padding: '10px' }}>
                          <input
                            type="time"
                            disabled={d.off}
                            value={d.start || ''}
                            onChange={(e) => handleUpdateScheduleDay(dia.key, 'start', e.target.value)}
                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
                          />
                        </td>
                        <td style={{ padding: '10px' }}>
                          <input
                            type="time"
                            disabled={d.off}
                            value={d.end || ''}
                            onChange={(e) => handleUpdateScheduleDay(dia.key, 'end', e.target.value)}
                            style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
                          />
                        </td>
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          <input
                            type="checkbox"
                            checked={d.off || false}
                            onChange={(e) => handleUpdateScheduleDay(dia.key, 'off', e.target.checked)}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              <button type="submit" style={{ padding: '10px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                Guardar Horarios
              </button>
            </form>
          </div>

          {/* Card 2: Factores de Rendición */}
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', padding: '24px', boxShadow: 'var(--shadow)' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: '700' }}>Factores de Rendición</h3>
            <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Valores asignados a cada tipo de hito para el cálculo del valor total en las rendiciones de horas.</p>

            <form onSubmit={handleSaveFactores}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Valor Alojamiento</label>
                <input
                  type="number"
                  step="any"
                  value={factores.alojamiento}
                  onChange={(e) => handleUpdateFactor('alojamiento', e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Valor Feriado (Porcentaje, ej. 200 para 200%)</label>
                <input
                  type="number"
                  step="any"
                  value={factores.feriado}
                  onChange={(e) => handleUpdateFactor('feriado', e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Valor Horas Extras (Porcentaje, ej. 150 para 150%)</label>
                <input
                  type="number"
                  step="any"
                  value={factores.extras}
                  onChange={(e) => handleUpdateFactor('extras', e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Valor Viaje (Porcentaje, ej. 50 para 50%)</label>
                <input
                  type="number"
                  step="any"
                  value={factores.viaje}
                  onChange={(e) => handleUpdateFactor('viaje', e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <button type="submit" style={{ padding: '10px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                Guardar Factores
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================== SUBTAB: SMTP & SISTEMA ==================== */}
      {activeSubTab === 'smtp' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '30px', alignItems: 'start' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {/* SMTP Form */}
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', padding: '24px', boxShadow: 'var(--shadow)' }}>
              <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: '700' }}>Notificaciones SMTP</h3>
              <form onSubmit={handleSaveSmtp}>
                <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="smtp-enabled"
                    checked={smtp.enabled}
                    onChange={(e) => setSmtp({ ...smtp, enabled: e.target.checked })}
                  />
                  <label htmlFor="smtp-enabled" style={{ fontSize: '0.88rem', fontWeight: '600' }}>Habilitar Envío de Emails</label>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Host SMTP</label>
                  <input
                    type="text"
                    placeholder="mail.ejemplo.cl"
                    value={smtp.host}
                    onChange={(e) => setSmtp({ ...smtp, host: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Puerto</label>
                    <input
                      type="number"
                      value={smtp.port}
                      onChange={(e) => setSmtp({ ...smtp, port: parseInt(e.target.value) || 587 })}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '20px' }}>
                      <input
                        type="checkbox"
                        id="smtp-tls"
                        checked={smtp.use_tls}
                        onChange={(e) => setSmtp({ ...smtp, use_tls: e.target.checked })}
                      />
                      <label htmlFor="smtp-tls" style={{ fontSize: '0.85rem' }}>Usar TLS</label>
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Usuario SMTP</label>
                  <input
                    type="text"
                    placeholder="notificador@ejemplo.cl"
                    value={smtp.user}
                    onChange={(e) => setSmtp({ ...smtp, user: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Contraseña SMTP</label>
                  <input
                    type="password"
                    placeholder="Contraseña"
                    value={smtp.password}
                    onChange={(e) => setSmtp({ ...smtp, password: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Remitente (From)</label>
                  <input
                    type="email"
                    placeholder="notificador@ejemplo.cl"
                    value={smtp.from_email}
                    onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                  />
                </div>

                <button type="submit" style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                  Guardar SMTP
                </button>
              </form>
            </div>

            {/* Test SMTP card */}
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', padding: '24px', boxShadow: 'var(--shadow)' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: '700' }}>Probar Conectividad SMTP</h3>
              <form onSubmit={handleTestSmtp}>
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Destinatario de Prueba</label>
                  <input
                    type="email"
                    placeholder="destinatario@ejemplo.cl"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <button type="submit" disabled={testingSmtp} style={{ width: '100%', background: 'var(--accent-hover)', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                  {testingSmtp ? 'Enviando...' : 'Enviar Email de Prueba'}
                </button>
              </form>
            </div>
          </div>

          {/* other settings card */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* Public Registration Switch */}
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', padding: '24px', boxShadow: 'var(--shadow)' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: '700' }}>Registro de Usuarios</h3>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span style={{ fontSize: '0.88rem', flex: 1 }}>Habilitar Registro Público de Colaboradores</span>
                <button 
                  onClick={() => handleTogglePublicRegistration(!publicRegEnabled)}
                  style={{
                    background: publicRegEnabled ? 'var(--success)' : 'var(--danger)',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontWeight: 'bold',
                    cursor: 'pointer'
                  }}
                >
                  {publicRegEnabled ? 'Habilitado' : 'Deshabilitado'}
                </button>
              </div>
            </div>

            {/* System Timezone Card */}
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', padding: '24px', boxShadow: 'var(--shadow)' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: '700' }}>Zona Horaria del Sistema</h3>
              <p style={{ margin: '0 0 20px 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Establece la zona horaria utilizada para la visualización y conversión de fechas guardadas en UTC.</p>
              <form onSubmit={handleSaveTimezone}>
                <div style={{ marginBottom: '20px' }}>
                  <select
                    value={systemTimezone}
                    onChange={(e) => setSystemTimezone(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
                  >
                    <option value="America/Santiago">Chile (America/Santiago)</option>
                    <option value="UTC">UTC (Tiempo Universal Coordinado)</option>
                    <option value="America/Argentina/Buenos_Aires">Argentina (America/Argentina/Buenos_Aires)</option>
                    <option value="America/Lima">Perú (America/Lima)</option>
                    <option value="America/Bogota">Colombia (America/Bogota)</option>
                    <option value="America/Mexico_City">México (America/Mexico_City)</option>
                    <option value="America/New_York">EEUU Este (America/New_York)</option>
                  </select>
                </div>
                <button type="submit" style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}>
                  Guardar Zona Horaria
                </button>
              </form>
            </div>

            {/* System Factory Reset Card */}
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', padding: '24px', boxShadow: 'var(--shadow)', borderLeft: '4px solid var(--danger)' }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', fontWeight: '700', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa fa-triangle-exclamation"></i> Restablecer Sistema de Fábrica
              </h3>
              <p style={{ margin: '0 0 20px 0', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.5' }}>
                <strong>¡ADVERTENCIA!</strong> Esta acción eliminará de forma permanente todos los colaboradores, solicitudes, rendiciones de horas de proyectos e historial de saldo.
                El sistema se reiniciará automáticamente y se restablecerá el usuario administrador por defecto (<code>admin@sistema.local</code> con clave <code>admin123</code>).
              </p>
              <button 
                onClick={handleSystemReset}
                disabled={resetting}
                style={{ 
                  width: '100%', 
                  background: 'var(--danger)', 
                  color: '#fff', 
                  border: 'none', 
                  padding: '12px', 
                  borderRadius: '8px', 
                  fontWeight: '600', 
                  cursor: resetting ? 'not-allowed' : 'pointer',
                  opacity: resetting ? 0.7 : 1,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {resetting ? (
                  <>
                    <i className="fa fa-spinner fa-spin"></i> Restableciendo y Reiniciando...
                  </>
                ) : (
                  <>
                    <i className="fa fa-power-off"></i> Restablecer y Reiniciar Sistema
                  </>
                )}
              </button>
            </div>

          </div>

        </div>
      )}

      {/* ==================== USER MODAL (CREATE / EDIT) ==================== */}
      {showUserModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderRadius: 'var(--radius)', padding: '30px', maxWidth: '450px', width: '90%',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--card-border)', paddingBottom: '10px' }}>
              <h3 style={{ margin: 0 }}>{editingUser ? 'Editar Colaborador' : 'Crear Colaborador'}</h3>
              <button onClick={() => setShowUserModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}>&times;</button>
            </div>

            <form onSubmit={handleSaveUser}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px' }}>Nombre</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px' }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                  required
                />
              </div>

              {!editingUser && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px' }}>Contraseña</label>
                  <input
                    type="password"
                    placeholder="Dejar vacío para default 'schap123'"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px' }}>Rol</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
                  >
                    <option value="trabajador">Trabajador</option>
                    <option value="jefe">Jefe</option>
                    <option value="administrador">Administrador</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '6px' }}>Jefe Directo</label>
                  <select
                    value={bossId}
                    onChange={(e) => setBossId(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
                  >
                    <option value="">Sin jefe asignado</option>
                    {users.filter(u => u.role === 'administrador' || u.role === 'jefe').map(u => (
                      <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="must-change-pass"
                  checked={mustChangePassword}
                  onChange={(e) => setMustChangePassword(e.target.checked)}
                />
                <label htmlFor="must-change-pass" style={{ fontSize: '0.85rem' }}>Exigir cambio de clave al iniciar sesión</label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowUserModal(false)} style={{ padding: '8px 16px', background: 'var(--card-border)', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--text)' }}>
                  Cancelar
                </button>
                <button type="submit" style={{ padding: '8px 20px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer', fontWeight: 'bold' }}>
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
