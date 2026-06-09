import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Inicio({ currentUser, onPasswordChanged }) {
  const navigate = useNavigate()
  const chartRef = useRef(null)

  // Page States
  const [stats, setStats] = useState({
    horasAbonadas: 0,
    horasRendidas: 0,
    horasTotales: 0,
    horasUsadas: 0,
    horasDisponibles: 0,
    pendientesCount: 0,
    pendientesHoras: 0
  })
  const [aprobadas, setAprobadas] = useState([])
  const [rechazadas, setRechazadas] = useState([])
  const [schedule, setSchedule] = useState(null)
  const [teamPendingCount, setTeamPendingCount] = useState(0)
  
  const isBossOrAdmin = currentUser?.role === 'jefe' || currentUser?.role === 'administrador' || currentUser?.role === 'superusuario'

  // Overlays
  const [showDefaultOverlay, setShowDefaultOverlay] = useState(false)
  const [showPassChangeOverlay, setShowPassChangeOverlay] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passError, setPassError] = useState('')

  useEffect(() => {
    // Check if user is default or must change password
    if (currentUser?.must_change_password) {
      setShowPassChangeOverlay(true)
    } else if (localStorage.getItem("isDefaultUser") === "true") {
      setShowDefaultOverlay(true)
    }

    async function loadData() {
      try {
        const [reqRes, rendRes, schedRes] = await Promise.all([
          api.get('/api/requests?mine=1'),
          api.get('/api/rendiciones?mine=1'),
          api.get('/api/config/schedule')
        ])

        const reqData = reqRes.ok ? await reqRes.json() : { requests: [] }
        const rendData = rendRes.ok ? await rendRes.json() : { rendiciones: [] }
        const schedData = schedRes.ok ? await schedRes.json() : { schedule: null }

        const requests = reqData.requests || []
        const rendiciones = rendData.rendiciones || []
        setSchedule(schedData.schedule)

        // Calculate stats
        const currentYear = new Date().getFullYear()
        const calculated = calculateStats(requests, rendiciones, currentYear)
        setStats(calculated)

        // Process lists
        processLatestRequests(requests, rendiciones)

        // Draw chart
        drawTrendChart(requests, rendiciones, currentYear)

        // If boss/admin, fetch pending counts of their team
        if (isBossOrAdmin) {
          try {
            const [teamReqRes, teamRendRes] = await Promise.all([
              api.get('/api/requests?pending=1'),
              api.get('/api/rendiciones?pending=1')
            ])
            const teamReqs = teamReqRes.ok ? (await teamReqRes.json()).requests || [] : []
            const teamRends = teamRendRes.ok ? (await teamRendRes.json()).rendiciones || [] : []
            
            const pReqs = teamReqs.filter(r => r.status.startsWith('pendiente'))
            const pRends = teamRends.filter(r => r.status.startsWith('pendiente'))
            
            setTeamPendingCount(pReqs.length + pRends.length)
          } catch (e) {
            console.error("Error loading team pending count:", e)
          }
        }

      } catch (err) {
        console.error("Error loading dashboard data:", err)
      }
    }

    loadData()
  }, [currentUser])

  const calculateStats = (requests, rendiciones, year) => {
    const requestsYear = requests.filter(r => {
      const date = new Date(r.date || r.created_at)
      return date.getFullYear() === year
    })

    const rendicionesYear = rendiciones.filter(r => {
      const date = new Date(r.created_at)
      return date.getFullYear() === year
    })

    const horasTotales = currentUser?.bonus_hours || 0
    const horasRendidas = rendicionesYear
      .filter(r => r.status === "aprobado" || r.status === "aprobado_jefe" || r.status === "aprobado_admin")
      .reduce((acc, r) => acc + (r.total_horas || 0), 0)

    const horasAbonadas = Math.max(0, horasTotales - horasRendidas)
    const horasUsadas = currentUser?.used_hours || 0
    const horasDisponibles = horasTotales - horasUsadas

    const pendientes = requestsYear.filter(r =>
      r.status === "pendiente" || r.status === "pendiente_jefe" || r.status === "pendiente_admin"
    )

    return {
      horasAbonadas,
      horasRendidas,
      horasTotales,
      horasUsadas,
      horasDisponibles,
      pendientesCount: pendientes.length,
      pendientesHoras: pendientes.reduce((acc, r) => acc + (r.hours || 0), 0)
    }
  }

  const processLatestRequests = (requests, rendiciones) => {
    const allItems = []

    requests.forEach(r => {
      allItems.push({
        id: r.id,
        tipo: r.type || "Permiso",
        categoria: r.type?.toLowerCase() === "notificación" ? "notificacion" : "permiso",
        horas: r.hours || 0,
        fecha: r.date || r.created_at,
        comentario: r.comment || "",
        status: r.status
      })
    })

    rendiciones.forEach(r => {
      allItems.push({
        id: r.id,
        tipo: "Rendición",
        categoria: "rendicion",
        horas: r.total_horas || 0,
        fecha: r.created_at,
        comentario: r.cliente || r.trabajo || "",
        status: r.status
      })
    })

    const approved = allItems
      .filter(r => r.status === "aprobado" || r.status === "aprobado_jefe" || r.status === "aprobado_admin")
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 5)

    const rejected = allItems
      .filter(r => r.status === "rechazado" || r.status === "rechazado_jefe" || r.status === "rechazado_admin" || r.status === "rechazada")
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 5)

    setAprobadas(approved)
    setRechazadas(rejected)
  }

  const drawTrendChart = (requests, rendiciones, year) => {
    const canvas = chartRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")

    const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    const horasUsadasMes = new Array(12).fill(0)
    const horasRendidasMes = new Array(12).fill(0)

    requests.forEach(r => {
      const date = new Date(r.date || r.created_at)
      if (date.getFullYear() === year) {
        const month = date.getMonth()
        if (r.status === "aprobado" || r.status === "aprobado_jefe" || r.status === "aprobado_admin") {
          if (r.type?.toLowerCase() !== "notificación" && r.type !== "Abono") {
            horasUsadasMes[month] += r.hours || 0
          }
        }
      }
    })

    rendiciones.forEach(r => {
      const date = new Date(r.created_at)
      if (date.getFullYear() === year) {
        const month = date.getMonth()
        if (r.status === "aprobado" || r.status === "aprobado_jefe" || r.status === "aprobado_admin") {
          horasRendidasMes[month] += r.total_horas || 0
        }
      }
    })

    const width = canvas.width
    const height = canvas.height
    const padding = 40
    const chartWidth = width - padding * 2
    const chartHeight = height - padding * 2

    ctx.clearRect(0, 0, width, height)

    const maxUsadas = Math.max(...horasUsadasMes, 1)
    const maxRendidas = Math.max(...horasRendidasMes, 1)
    const maxValue = Math.max(maxUsadas, maxRendidas, 10)

    // Background lines
    ctx.strokeStyle = "rgba(148, 163, 184, 0.15)"
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = padding + (chartHeight / 4) * i
      ctx.beginPath()
      ctx.moveTo(padding, y)
      ctx.lineTo(width - padding, y)
      ctx.stroke()

      const value = Math.round(maxValue - (maxValue / 4) * i)
      ctx.fillStyle = "var(--text-muted)"
      ctx.font = "10px sans-serif"
      ctx.textAlign = "right"
      ctx.fillText(value.toString(), padding - 5, y + 3)
    }

    // Month labels
    const barWidth = chartWidth / 12
    ctx.fillStyle = "var(--text-muted)"
    ctx.font = "10px sans-serif"
    ctx.textAlign = "center"
    meses.forEach((mes, i) => {
      const x = padding + barWidth * i + barWidth / 2
      ctx.fillText(mes, x, height - 10)
    })

    // Draw used hours bars (Red)
    ctx.fillStyle = "#ef4444"
    horasUsadasMes.forEach((val, i) => {
      const x = padding + barWidth * i + 5
      const barH = (val / maxValue) * chartHeight
      const y = padding + chartHeight - barH
      ctx.fillRect(x, y, barWidth / 2 - 3, barH)
    })

    // Draw rendered hours bars (Green)
    ctx.fillStyle = "#10b981"
    horasRendidasMes.forEach((val, i) => {
      const x = padding + barWidth * i + barWidth / 2 + 2
      const barH = (val / maxValue) * chartHeight
      const y = padding + chartHeight - barH
      ctx.fillRect(x, y, barWidth / 2 - 3, barH)
    })
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPassError('')

    if (!newPassword || newPassword.length < 4) {
      setPassError("La contraseña debe tener al menos 4 caracteres.")
      return
    }

    if (newPassword !== confirmPassword) {
      setPassError("Las contraseñas no coinciden.")
      return
    }

    try {
      const res = await api.patch(`/api/users/${currentUser.id}/password`, {
        password: newPassword
      })

      if (!res.ok) {
        const data = await res.json()
        setPassError(data.error || "Error al cambiar la contraseña.")
        return
      }

      setShowPassChangeOverlay(false)
      if (onPasswordChanged) {
        await onPasswordChanged()
      }
      alert("¡Contraseña actualizada correctamente!")
    } catch (err) {
      setPassError("Error de red. Intente nuevamente.")
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ""
    const d = new Date(dateStr)
    if (isNaN(d)) return dateStr
    return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" })
  }

  const truncate = (str, len) => {
    if (!str) return ""
    return str.length > len ? str.substring(0, len) + "..." : str
  }

  const pctUsado = stats.horasTotales > 0
    ? Math.min(100, (stats.horasUsadas / stats.horasTotales) * 100)
    : 0

  const getIcon = (cat) => {
    if (cat === 'notificacion') return 'fa-bell'
    if (cat === 'rendicion') return 'fa-file-invoice'
    return 'fa-clock'
  }

  return (
    <div className="page-container inicio-container">
      
      {/* Welcome Title */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '2rem', fontWeight: '800' }}>
          Hola, {currentUser?.name}
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
          Resumen de tus horas y solicitudes del año {new Date().getFullYear()}
        </p>
      </div>

      {/* Alert Banner for Directives if team pending items exist */}
      {isBossOrAdmin && teamPendingCount > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(37, 99, 235, 0.03) 100%)',
          border: '1px solid rgba(37, 99, 235, 0.2)',
          borderRadius: 'var(--radius)',
          padding: '16px 24px',
          marginBottom: '30px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              background: 'rgba(37, 99, 235, 0.15)',
              color: 'var(--accent)',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem'
            }}>
              <i className="fa fa-bell"></i>
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '700' }}>Tienes aprobaciones pendientes</h4>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Hay {teamPendingCount} solicitudes o rendiciones de colaboradores de tu equipo esperando tu revisión.
              </p>
            </div>
          </div>
          <button 
            onClick={() => navigate('/solicitudes')}
            style={{
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              padding: '10px 18px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(37, 99, 235, 0.2)',
              transition: 'all 0.2s'
            }}
          >
            Revisar Solicitudes
          </button>
        </div>
      )}

      {/* KPIs Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '20px',
        marginBottom: '30px'
      }}>
        {/* KPI 1: Horas Totales */}
        <div className="kpi-card" style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 'var(--radius)',
          padding: '24px',
          boxShadow: 'var(--shadow)'
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '600', textTransform: 'uppercase', marginBottom: '8px' }}>
            Horas Totales (Bolsa)
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: '800', marginBottom: '8px' }}>
            {stats.horasTotales.toFixed(1)} <span style={{ fontSize: '1rem', fontWeight: '500', color: 'var(--text-muted)' }}>hrs</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {stats.horasAbonadas.toFixed(1)} abonadas + {stats.horasRendidas.toFixed(1)} rendidas
          </div>
        </div>

        {/* KPI 2: Horas Usadas */}
        <div className="kpi-card" style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 'var(--radius)',
          padding: '24px',
          boxShadow: 'var(--shadow)'
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '600', textTransform: 'uppercase', marginBottom: '8px' }}>
            Horas Consumidas
          </div>
          <div style={{ fontSize: '2.2rem', fontWeight: '800', marginBottom: '8px' }}>
            {stats.horasUsadas.toFixed(1)} <span style={{ fontSize: '1rem', fontWeight: '500', color: 'var(--text-muted)' }}>hrs</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {pctUsado.toFixed(1)}% del total acumulado
          </div>
        </div>

        {/* KPI 3: Horas Disponibles */}
        <div className="kpi-card" style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 'var(--radius)',
          padding: '24px',
          boxShadow: 'var(--shadow)'
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '600', textTransform: 'uppercase', marginBottom: '8px' }}>
            Saldo Disponible
          </div>
          <div style={{
            fontSize: '2.2rem',
            fontWeight: '800',
            marginBottom: '8px',
            color: stats.horasDisponibles < 0 ? 'var(--danger)' : 'var(--text)'
          }}>
            {stats.horasDisponibles.toFixed(1)} <span style={{ fontSize: '1rem', fontWeight: '500', color: 'var(--text-muted)' }}>hrs</span>
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {stats.horasDisponibles < 0 ? '⚠️ Saldo negativo' : (
              stats.pendientesCount > 0 
                ? `${stats.pendientesCount} solicitudes pendientes` 
                : 'Sin solicitudes pendientes'
            )}
          </div>
        </div>

        {/* KPI 4: Pending / Team approvals */}
        <div className="kpi-card" style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 'var(--radius)',
          padding: '24px',
          boxShadow: 'var(--shadow)'
        }}>
          {isBossOrAdmin ? (
            <>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '600', textTransform: 'uppercase', marginBottom: '8px' }}>
                Por Aprobar (Equipo)
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: '800', marginBottom: '8px', color: teamPendingCount > 0 ? 'var(--accent)' : 'var(--text)' }}>
                {teamPendingCount} <span style={{ fontSize: '1.1rem', fontWeight: '500', color: 'var(--text-muted)' }}>sol.</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {teamPendingCount > 0 ? '⚠️ Pendientes de revisión' : 'Todo al día'}
              </div>
            </>
          ) : (
            <>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: '600', textTransform: 'uppercase', marginBottom: '8px' }}>
                Horas en Trámite
              </div>
              <div style={{ fontSize: '2.2rem', fontWeight: '800', marginBottom: '8px', color: stats.pendientesCount > 0 ? 'var(--accent)' : 'var(--text)' }}>
                {stats.pendientesHoras.toFixed(1)} <span style={{ fontSize: '1rem', fontWeight: '500', color: 'var(--text-muted)' }}>hrs</span>
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                {stats.pendientesCount} solicitudes pendientes
              </div>
            </>
          )}
        </div>
      </div>

      {/* Progress Bar Section */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius)',
        padding: '20px 24px',
        boxShadow: 'var(--shadow)',
        marginBottom: '30px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>
          <span>Progreso de Consumo de Bolsa</span>
          <span style={{ color: 'var(--text-muted)' }}>
            {stats.horasUsadas.toFixed(1)} de {stats.horasTotales.toFixed(1)} hrs
          </span>
        </div>
        <div style={{ background: 'var(--bg)', borderRadius: '6px', height: '12px', overflow: 'hidden' }}>
          <div style={{
            background: 'var(--accent)',
            width: `${pctUsado}%`,
            height: '100%',
            borderRadius: '6px',
            transition: 'width 0.5s ease'
          }}></div>
        </div>
      </div>

      {/* Layout Main Columns */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))',
        gap: '30px'
      }}>
        
        {/* Left Column: Annual Trend Chart */}
        <div className="dash-section" style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 'var(--radius)',
          padding: '24px',
          boxShadow: 'var(--shadow)'
        }}>
          <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: '700' }}>
            Tendencia de Horas {new Date().getFullYear()}
          </h3>
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <canvas ref={chartRef} width={500} height={250} style={{ display: 'block', margin: '0 auto', maxWidth: '100%' }}></canvas>
          </div>
        </div>

        {/* Right Column: Latest Requests & Schedule */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
          
          {/* Latest Approved/Rejected Requests */}
          <div className="dash-section" style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 'var(--radius)',
            padding: '24px',
            boxShadow: 'var(--shadow)'
          }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: '700' }}>
              Últimas Actividades Aprobadas
            </h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {aprobadas.length === 0 ? (
                <li style={{ padding: '16px 0', color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center' }}>
                  No hay solicitudes aprobadas
                </li>
              ) : (
                aprobadas.map((r, idx) => (
                  <li key={idx} style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '12px 0',
                    borderBottom: idx < aprobadas.length - 1 ? '1px solid var(--card-border)' : 'none'
                  }}>
                    <div style={{
                      background: 'rgba(16, 189, 129, 0.1)',
                      color: '#10b981',
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: '14px',
                      fontSize: '0.9rem'
                    }}>
                      <i className={`fa ${getIcon(r.categoria)}`}></i>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                        {r.tipo} · {r.horas.toFixed(1)}h
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {formatDate(r.fecha)} {r.comentario ? `· ${truncate(r.comentario, 35)}` : ''}
                      </div>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>

          {/* Work Schedule */}
          <div className="dash-section" style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 'var(--radius)',
            padding: '24px',
            boxShadow: 'var(--shadow)'
          }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: '700' }}>
              Horario Laboral
            </h3>
            <div id="schedule-container">
              {schedule ? (
                <table className="schedule-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px' }}>Día</th>
                      <th style={{ padding: '8px 12px' }}>Entrada</th>
                      <th style={{ padding: '8px 12px' }}>Salida</th>
                      <th style={{ padding: '8px 12px' }}>Estado</th>
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
                    ].map((dia) => {
                      const d = schedule[dia.key] || {}
                      const isOff = d.off
                      return (
                        <tr key={dia.key} style={{
                          borderBottom: '1px solid var(--card-border)',
                          opacity: isOff ? 0.6 : 1,
                          background: isOff ? 'rgba(0,0,0,0.01)' : 'transparent'
                        }}>
                          <td style={{ padding: '8px 12px', fontWeight: '500' }}>{dia.label}</td>
                          <td style={{ padding: '8px 12px' }}>{isOff ? '-' : (d.start || '-')}</td>
                          <td style={{ padding: '8px 12px' }}>{isOff ? '-' : (d.end || '-')}</td>
                          <td style={{ padding: '8px 12px' }}>
                            {isOff 
                              ? <span className="badge off" style={{ background: 'rgba(248, 113, 113, 0.15)', color: '#f87171', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>No laboral</span>
                              : <span className="badge working" style={{ background: 'rgba(52, 211, 153, 0.15)', color: '#34d399', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem' }}>Laboral</span>
                            }
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <p style={{ margin: 0, textAlign: 'center', color: 'var(--text-muted)' }}>Horarios no configurados</p>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* OVERLAY 1: Default Admin Warning */}
      {showDefaultOverlay && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 'var(--radius)',
            padding: '40px',
            maxWidth: '500px',
            width: '90%',
            textAlign: 'center',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ fontSize: '3rem', color: 'var(--accent)', marginBottom: '20px' }}>
              <i className="fa fa-screwdriver-wrench"></i>
            </div>
            <h3 style={{ fontSize: '1.4rem', fontWeight: '800', margin: '0 0 16px 0' }}>
              Configuración Inicial Requerida
            </h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.6', fontSize: '0.92rem', marginBottom: '24px' }}>
              Está utilizando la cuenta de administrador temporal por defecto. Por seguridad, debe crear un administrador real y completar la configuración inicial.
            </p>
            <button 
              onClick={() => { setShowDefaultOverlay(false); navigate('/admin'); }}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Completar Configuración
            </button>
          </div>
        </div>
      )}

      {/* OVERLAY 2: Must Change Password Overlay */}
      {showPassChangeOverlay && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 'var(--radius)',
            padding: '40px',
            maxWidth: '450px',
            width: '90%',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <h3 style={{ fontSize: '1.4rem', fontWeight: '800', margin: '0 0 12px 0', textAlign: 'center' }}>
              Cambio de Contraseña Obligatorio
            </h3>
            <p style={{ color: 'var(--text-muted)', lineHeight: '1.5', fontSize: '0.88rem', marginBottom: '24px', textAlign: 'center' }}>
              Su administrador ha solicitado que restablezca su contraseña por motivos de seguridad antes de continuar navegando.
            </p>

            {passError && (
              <div style={{
                background: 'rgba(220, 38, 38, 0.1)',
                borderLeft: '4px solid var(--danger)',
                color: 'var(--danger)',
                padding: '10px',
                borderRadius: '0 4px 4px 0',
                fontSize: '0.82rem',
                marginBottom: '16px'
              }}>
                {passError}
              </div>
            )}

            <form onSubmit={handlePasswordChange}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '6px', fontSize: '0.85rem' }}>
                  Nueva Contraseña
                </label>
                <input
                  type="password"
                  placeholder="Min. 4 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontWeight: '500', marginBottom: '6px', fontSize: '0.85rem' }}>
                  Confirmar Nueva Contraseña
                </label>
                <input
                  type="password"
                  placeholder="Repita la nueva contraseña"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
                cursor: 'pointer'
              }}>
                Guardar Contraseña
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
