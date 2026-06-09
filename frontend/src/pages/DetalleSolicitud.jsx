import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'

export default function DetalleSolicitud({ currentUser }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [request, setRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [userBalance, setUserBalance] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Modals / Overlays
  const [showApproveOverlay, setShowApproveOverlay] = useState(false)
  const [showRejectOverlay, setShowRejectOverlay] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadDetail = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await api.get('/api/requests?calendar=1')
      if (!res.ok) {
        setErrorMsg("No se pudieron cargar los detalles de la solicitud.")
        setLoading(false)
        return
      }

      const data = await res.json()
      const reqId = parseInt(id, 10)
      const r = (data.requests || []).find(item => item.id === reqId)

      if (!r) {
        setErrorMsg(`No se encontró la solicitud #${id}`)
        setLoading(false)
        return
      }

      setRequest(r)

      // Load user balance
      const usersRes = await api.get('/api/users')
      if (usersRes.ok) {
        const uData = await usersRes.json()
        const matchUser = (uData.users || []).find(u => u.id === r.user_id)
        if (matchUser) {
          const balance = (matchUser.bonus_hours || 0) - (matchUser.used_hours || 0)
          setUserBalance(`${balance.toFixed(1)} horas disponibles`)
        } else {
          setUserBalance('-')
        }
      }
    } catch (e) {
      console.error(e)
      setErrorMsg("Error de red al cargar detalles.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetail()
  }, [id])

  const mapStatus = (statusRaw) => {
    const map = {
      pendiente: "Pendiente",
      pendiente_jefe: "Pendiente de Jefe",
      pendiente_admin: "Pendiente de Administrador",
      aprobado_jefe: "Aprobado por Jefe",
      aprobado_admin: "Aprobado por Administrador",
      aprobado: "Aprobado",
      rechazado_jefe: "Rechazado por Jefe",
      rechazado_admin: "Rechazado por Administrador",
      rechazada: "Rechazada",
      rechazado: "Rechazado",
      informativa: "Informativa (Notificación)"
    }
    return map[statusRaw] || statusRaw || "-"
  }

  const isNotificacion = (r) => {
    return r.type === "Notificación" || r.type === "notificacion" || r.status === "informativa"
  }

  const getEstadosSecciones = (status) => {
    const estados = { creada: "completado", jefe: "inactivo", admin: "inactivo", finalizada: "inactivo" }
    switch (status) {
      case "pendiente":
      case "pendiente_jefe":
      case "pendiente_admin":
        estados.jefe = "pendiente"
        estados.admin = "pendiente"
        break
      case "aprobado_jefe":
        estados.jefe = "completado"
        estados.finalizada = "completado"
        break
      case "rechazado_jefe":
        estados.jefe = "rechazado"
        estados.finalizada = "rechazado"
        break
      case "aprobado_admin":
      case "aprobado":
        estados.jefe = "completado"
        estados.admin = "completado"
        estados.finalizada = "completado"
        break
      case "rechazado_admin":
      case "rechazado":
      case "rechazada":
        estados.jefe = "inactivo"
        estados.admin = "rechazado"
        estados.finalizada = "rechazado"
        break
      default:
        estados.jefe = "pendiente"
        estados.admin = "pendiente"
    }
    return estados
  }

  const getTextoJefe = (status) => {
    if (status === "aprobado_jefe") return "Aprobada (Jefe)"
    if (status === "rechazado_jefe") return "Rechazada (Jefe)"
    return "Revisión (Jefe)"
  }

  const getTextoAdmin = (status) => {
    if (status === "aprobado_admin" || status === "aprobado") return "Aprobada (Admin)"
    if (status === "rechazado_admin" || status === "rechazado" || status === "rechazada") return "Rechazada (Admin)"
    return "Revisión (Admin)"
  }

  // Action handlers
  const handleApprove = async () => {
    setSubmitting(true)
    let nuevoEstado = "aprobado"
    if (currentUser.role === "jefe") {
      nuevoEstado = "aprobado_jefe"
    }

    try {
      const res = await api.patch(`/api/requests/${request.id}/status`, {
        status: nuevoEstado,
        reject_reason: ""
      })

      if (res.ok) {
        alert("Solicitud aprobada con éxito. Correo enviado.")
        setShowApproveOverlay(false)
        loadDetail()
      } else {
        const data = await res.json()
        alert(data.error || "Error al aprobar la solicitud.")
      }
    } catch (err) {
      alert("Error de red.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleReject = async (e) => {
    e.preventDefault()
    if (!rejectReason.trim()) {
      alert("Debe indicar una razón para el rechazo.")
      return
    }

    setSubmitting(true)
    let nuevoEstado = "rechazado"
    if (currentUser.role === "jefe") {
      nuevoEstado = "rechazado_jefe"
    }

    try {
      const res = await api.patch(`/api/requests/${request.id}/status`, {
        status: nuevoEstado,
        reject_reason: rejectReason.trim()
      })

      if (res.ok) {
        alert("Solicitud rechazada. Correo enviado.")
        setShowRejectOverlay(false)
        setRejectReason('')
        loadDetail()
      } else {
        const data = await res.json()
        alert(data.error || "Error al rechazar la solicitud.")
      }
    } catch (err) {
      alert("Error de red.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando solicitud...</div>
  }

  if (errorMsg) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--danger)' }}>
        <h2>Error</h2>
        <p>{errorMsg}</p>
        <button className="btn" onClick={() => navigate('/solicitudes')} style={{ marginTop: '20px', padding: '10px 18px', background: 'var(--card-border)', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--text)' }}>
          Volver a solicitudes
        </button>
      </div>
    )
  }

  const status = request?.status || 'pendiente'
  const isPending = ['pendiente', 'pendiente_jefe', 'pendiente_admin'].includes(status)
  
  const isNotifOrAbono = (r) => {
    if (!r) return false
    const typeLower = (r.type || '').toLowerCase()
    const statusLower = (r.status || '').toLowerCase()
    return typeLower === 'notificación' || typeLower === 'notificacion' || typeLower === 'abono' || typeLower === 'regalo' || statusLower === 'informativa'
  }

  const isAuthorizedRole = currentUser?.role === 'administrador' || currentUser?.role === 'superusuario' || 
                           (currentUser?.role === 'jefe' && (request?.user_boss_id === currentUser.id || request?.user_id === currentUser.id));
  const canAct = isPending && isAuthorizedRole && !isNotifOrAbono(request)

  const formatDateTimeUser = (isoStr) => {
    if (!isoStr) return ''
    const parts = isoStr.split('T')
    if (parts.length < 2) {
      const d = new Date(isoStr)
      if (isNaN(d.getTime())) return isoStr
      return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
    }
    const [datePart, timePart] = parts
    const [year, month, day] = datePart.split('-').map(Number)
    const [hour, minute, second] = timePart.split(':').map(Number)
    return `${day}/${month}/${year}, ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second || 0).padStart(2, '0')}`
  }

  const getStepStyle = (colorType) => {
    if (colorType === 'verde') {
      return {
        flex: '1',
        padding: '12px 10px',
        textAlign: 'center',
        background: '#10b981',
        color: '#fff',
        borderRadius: '6px',
        fontSize: '0.82rem',
        fontWeight: '700',
        border: '1px solid #10b981'
      }
    } else if (colorType === 'rojo') {
      return {
        flex: '1',
        padding: '12px 10px',
        textAlign: 'center',
        background: '#ef4444',
        color: '#fff',
        borderRadius: '6px',
        fontSize: '0.82rem',
        fontWeight: '700',
        border: '1px solid #ef4444'
      }
    } else {
      return {
        flex: '1',
        padding: '12px 10px',
        textAlign: 'center',
        background: 'var(--card-border)',
        color: 'var(--text-muted)',
        borderRadius: '6px',
        fontSize: '0.82rem',
        fontWeight: '700',
        border: '1px solid var(--card-border)',
        opacity: 0.65
      }
    }
  }

  let colorCreada = 'verde'
  let colorJefe = 'plomo'
  let colorAdmin = 'plomo'
  let colorFinalizada = 'plomo'

  if (status === 'aprobado_jefe') {
    colorJefe = 'verde'
    colorFinalizada = 'verde'
  } else if (status === 'aprobado' || status === 'aprobado_admin') {
    colorAdmin = 'verde'
    colorFinalizada = 'verde'
  } else if (status === 'rechazado_jefe') {
    colorJefe = 'rojo'
    colorFinalizada = 'rojo'
  } else if (status === 'rechazado' || status === 'rechazado_admin' || status === 'rechazada') {
    colorAdmin = 'rojo'
    colorFinalizada = 'rojo'
  }

  return (
    <div className="page-container">
      
      {/* Back button */}
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={() => navigate('/solicitudes')}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <i className="fa fa-arrow-left"></i> Volver
        </button>
      </div>

      <div style={{ width: '100%' }}>
        {/* Main Request Card */}
      <div className="req-card" style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        boxShadow: 'var(--shadow)',
        marginBottom: '20px'
      }}>
        <div style={{ fontSize: '1.25rem', fontWeight: '800', borderBottom: '1px solid var(--card-border)', paddingBottom: '12px', marginBottom: '16px' }}>
          Solicitud #{request.id} - Colaborador: <span style={{ color: 'var(--accent)' }}>{request.user_name}</span>
        </div>

        {/* Days Table */}
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', marginBottom: '16px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '8px 4px' }}>Fecha</th>
              <th style={{ padding: '8px 4px' }}>Desde</th>
              <th style={{ padding: '8px 4px' }}>Hasta</th>
              <th style={{ padding: '8px 4px' }}>Día Completo</th>
              <th style={{ padding: '8px 4px' }}>Comentario</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
              <td style={{ padding: '12px 4px', fontWeight: '600' }}>{(request.date || request.day || '').split('T')[0]}</td>
              <td style={{ padding: '12px 4px' }}>{request.from_time || request.from || '-'}</td>
              <td style={{ padding: '12px 4px' }}>{request.to_time || request.to || '-'}</td>
              <td style={{ padding: '12px 4px' }}>{request.full_day ? 'SÍ' : 'NO'}</td>
              <td style={{ padding: '12px 4px', color: 'var(--text-muted)' }}>{request.comment || '-'}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>Total a descontar:</span>
          <span style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{request.hours?.toFixed(1)} Horas</span>
        </div>
      </div>

      {/* Progress Bar View */}
      <div className="req-card" style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        boxShadow: 'var(--shadow)',
        marginBottom: '20px'
      }}>
        <div style={{ fontWeight: '700', fontSize: '0.95rem', marginBottom: '16px' }}>Progreso de la Solicitud</div>
        
        <div className="req-progress-bar" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          {isNotifOrAbono(request) ? (
            <div className="req-progress-step req-progress-step--notificacion" style={{ flex: '1 1 100%', padding: '12px', textAlign: 'center', background: '#2563eb', color: '#fff', borderRadius: '8px', fontSize: '0.9rem', fontWeight: '700' }}>
              Finalizada (Informativa)
            </div>
          ) : (
            <>
              <div style={getStepStyle(colorCreada)}>Creada</div>
              <div style={getStepStyle(colorJefe)}>Revisión (Jefe)</div>
              <div style={getStepStyle(colorAdmin)}>Revisión (Admin)</div>
              <div style={getStepStyle(colorFinalizada)}>Finalizada</div>
            </>
          )}
        </div>

        {/* Timeline List */}
        <ul style={{ listStyleType: 'disc', paddingLeft: '20px', margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.8' }}>
          {isNotifOrAbono(request) ? (
            <>
              <li>Creada el {formatDateTimeUser(request.created_at)}</li>
              <li>Estado actual: <strong>Finalizada</strong></li>
            </>
          ) : (
            <>
              <li>Creada el {formatDateTimeUser(request.created_at)}</li>
              
              {status === 'aprobado_jefe' && (
                <li>Aprobada el {formatDateTimeUser(request.updated_at || request.created_at)}</li>
              )}
              {(status === 'aprobado' || status === 'aprobado_admin') && (
                <li>Aprobada el {formatDateTimeUser(request.updated_at || request.created_at)}</li>
              )}
              {status === 'rechazado_jefe' && (
                <li>Rechazada el {formatDateTimeUser(request.updated_at || request.created_at)}</li>
              )}
              {(status === 'rechazado' || status === 'rechazado_admin' || status === 'rechazada') && (
                <li>Rechazada el {formatDateTimeUser(request.updated_at || request.created_at)}</li>
              )}
              
              <li>
                Estado actual: <strong>{['pendiente', 'pendiente_jefe', 'pendiente_admin'].includes(status) ? 'Pendiente' : 'Finalizada'}</strong>
              </li>
            </>
          )}
        </ul>
      </div>

      {/* User Info & Current Balance Card */}
      <div className="req-card" style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        boxShadow: 'var(--shadow)',
        marginBottom: '20px'
      }}>
        <div style={{ fontWeight: '700', fontSize: '0.95rem', marginBottom: '16px' }}>Colaborador</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '0.88rem' }}>
          <div>
            <p style={{ margin: '0 0 4px 0', color: 'var(--text-muted)' }}>Nombre:</p>
            <p style={{ margin: 0, fontWeight: '600' }}>{request.user_name}</p>
          </div>
          <div>
            <p style={{ margin: '0 0 4px 0', color: 'var(--text-muted)' }}>Saldo Disponible actual:</p>
            <p style={{ margin: 0, fontWeight: '600' }}>{userBalance || '-'}</p>
          </div>
        </div>
      </div>

      {/* Current Status and rejection reasons */}
      <div className="req-card" style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        boxShadow: 'var(--shadow)',
        marginBottom: '30px'
      }}>
        <div style={{ fontWeight: '700', fontSize: '0.95rem', marginBottom: '16px' }}>Estado actual</div>
        <div style={{ fontSize: '0.88rem' }}>
          <p style={{ margin: '0 0 10px 0' }}>Estado: <strong>{mapStatus(request.status)}</strong></p>
          {request.reject_reason && (
            <div style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '10px 14px', borderRadius: '6px', color: 'var(--danger)' }}>
              <strong>Motivo de rechazo:</strong> {request.reject_reason}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons (Boss/Admin approvals) */}
      {canAct && (
        <div id="req-actions" style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '20px' }}>
          <button 
            onClick={() => setShowRejectOverlay(true)}
            style={{ padding: '12px 24px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            <i className="fa fa-times-circle"></i> Rechazar Solicitud
          </button>
          <button 
            onClick={() => setShowApproveOverlay(true)}
            style={{ padding: '12px 24px', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
          >
            <i className="fa fa-check-circle"></i> Aprobar Solicitud
          </button>
        </div>
      )}

      </div>

      {/* APPROVAL OVERLAY MODAL */}
      {showApproveOverlay && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)',
            borderRadius: 'var(--radius)', padding: '30px', maxWidth: '400px', width: '90%',
            boxShadow: 'var(--shadow-lg)', textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', fontWeight: '800' }}>Confirmar Aprobación</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: '24px' }}>
              ¿Está seguro que desea aprobar esta solicitud? Se descontarán <strong>{request.hours?.toFixed(1)} horas</strong> de la bolsa del colaborador y se le enviará una notificación por email.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button 
                onClick={() => setShowApproveOverlay(false)}
                style={{ padding: '8px 16px', background: 'var(--card-border)', color: 'var(--text)', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleApprove}
                disabled={submitting}
                style={{ padding: '8px 20px', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                {submitting ? 'Aprobando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECTION OVERLAY MODAL */}
      {showRejectOverlay && (
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
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.2rem', fontWeight: '800', textAlign: 'center' }}>Rechazar Solicitud</h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.4', marginBottom: '16px', textAlign: 'center' }}>
              Indique el motivo del rechazo. Este comentario será enviado por correo electrónico al colaborador.
            </p>
            <form onSubmit={handleReject}>
              <div style={{ marginBottom: '20px' }}>
                <textarea
                  placeholder="Escriba el motivo aquí..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  style={{ width: '100%', minHeight: '100px', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                  required
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button 
                  type="button"
                  onClick={() => setShowRejectOverlay(false)}
                  style={{ padding: '8px 16px', background: 'var(--card-border)', color: 'var(--text)', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={submitting}
                  style={{ padding: '8px 20px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  {submitting ? 'Rechazando...' : 'Rechazar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
