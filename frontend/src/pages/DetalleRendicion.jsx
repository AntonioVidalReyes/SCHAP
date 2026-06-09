import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'

export default function DetalleRendicion({ currentUser }) {
  const { id } = useParams()
  const navigate = useNavigate()
  
  const [rendicion, setRendicion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Popups state
  const [showAprobarPopup, setShowAprobarPopup] = useState(false)
  const [showRechazarPopup, setShowRechazarPopup] = useState(false)
  const [razonRechazo, setRazonRechazo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const loadDetail = async () => {
    try {
      setLoading(true)
      const res = await api.get(`/api/rendiciones/${id}`)
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || "Error al obtener detalles de la rendición.")
        return
      }

      setRendicion(data.rendicion)
    } catch (err) {
      setErrorMsg("Error de red al obtener detalles de la rendición.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDetail()
  }, [id])

  // Actions
  const handleAprobar = async () => {
    setErrorMsg('')
    setSuccessMsg('')
    setSubmitting(true)
    
    let nuevoEstado = "aprobado"
    if (currentUser.role === "jefe") {
      nuevoEstado = "aprobado_jefe"
    }

    try {
      const res = await api.patch(`/api/rendiciones/${id}/status`, {
        status: nuevoEstado,
        razon: ""
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || "No se pudo aprobar la rendición.")
        setSubmitting(false)
        return
      }

      setSuccessMsg("Rendición aprobada exitosamente.")
      setShowAprobarPopup(false)
      setSubmitting(false)
      loadDetail()
    } catch (err) {
      setErrorMsg("Error de red al procesar la aprobación.")
      setSubmitting(false)
    }
  }

  const handleRechazar = async () => {
    setErrorMsg('')
    setSuccessMsg('')

    if (!razonRechazo.trim()) {
      setErrorMsg("Debe especificar la razón del rechazo.")
      return
    }

    setSubmitting(true)

    let nuevoEstado = "rechazado"
    if (currentUser.role === "jefe") {
      nuevoEstado = "rechazado_jefe"
    }

    try {
      const res = await api.patch(`/api/rendiciones/${id}/status`, {
        status: nuevoEstado,
        razon: razonRechazo.trim()
      })
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || "No se pudo rechazar la rendición.")
        setSubmitting(false)
        return
      }

      setSuccessMsg("Rendición rechazada exitosamente.")
      setShowRechazarPopup(false)
      setRazonRechazo('')
      setSubmitting(false)
      loadDetail()
    } catch (err) {
      setErrorMsg("Error de red al procesar el rechazo.")
      setSubmitting(false)
    }
  }

  // Helpers
  const formatDiaConNombre = (dateStr) => {
    if (!dateStr) return "-"
    try {
      const date = new Date(dateStr + "T12:00:00")
      const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
      const dia = String(date.getDate()).padStart(2, "0")
      const mes = String(date.getMonth() + 1).padStart(2, "0")
      const año = date.getFullYear()
      const nombreDia = dias[date.getDay()]
      return `${dia}-${mes}-${año} (${nombreDia})`
    } catch {
      return dateStr
    }
  }

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "-"
    try {
      const date = new Date(dateStr)
      const dia = String(date.getDate()).padStart(2, "0")
      const mes = String(date.getMonth() + 1).padStart(2, "0")
      const año = date.getFullYear()
      const hora = String(date.getHours()).padStart(2, "0")
      const min = String(date.getMinutes()).padStart(2, "0")
      const seg = String(date.getSeconds()).padStart(2, "0")
      return `${dia}-${mes}-${año} ${hora}:${min}:${seg}`
    } catch {
      return dateStr
    }
  }

  const getEstadosSecciones = (status) => {
    const estados = {
      creada: "completado",
      jefe: "inactivo",
      admin: "inactivo",
      finalizada: "inactivo"
    }

    switch (status) {
      case "pendiente":
      case "pendiente_jefe":
        estados.jefe = "pendiente"
        estados.admin = "pendiente"
        break
      case "aprobado_jefe":
        estados.jefe = "completado"
        estados.admin = "inactivo"
        estados.finalizada = "completado"
        break
      case "rechazado_jefe":
        estados.jefe = "rechazado"
        estados.admin = "inactivo"
        estados.finalizada = "rechazado"
        break
      case "aprobado_admin":
      case "aprobado":
        estados.jefe = "inactivo"
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

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#fff' }}>
        <h3>Cargando detalles de la rendición...</h3>
      </div>
    )
  }

  if (!rendicion) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: '#fff' }}>
        <h3>No se pudo cargar la rendición.</h3>
        {errorMsg && <p style={{ color: 'var(--danger)' }}>{errorMsg}</p>}
        <button className="btn btn-secondary" onClick={() => navigate('/solicitudes')} style={{ marginTop: '16px' }}>
          Volver a Solicitudes
        </button>
      </div>
    )
  }

  const status = rendicion.status || 'pendiente'
  const isPending = ["pendiente", "pendiente_jefe", "pendiente_admin"].includes(status)
  const canApproveOrReject = ["administrador", "jefe"].includes(currentUser.role) && isPending

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

  const statusMap = {
    pendiente: "Pendiente de Jefe",
    pendiente_jefe: "Pendiente de Jefe",
    pendiente_admin: "Pendiente de Admin",
    aprobado_jefe: "Aprobada por Jefe",
    aprobado_admin: "Aprobada",
    aprobado: "Aprobada",
    rechazado_jefe: "Rechazada por Jefe",
    rechazado_admin: "Rechazada",
    rechazado: "Rechazada",
    rechazada: "Rechazada"
  }

  // Generate basic timeline events
  const timelineEvents = []
  if (rendicion.status.startsWith('rechazado') || rendicion.status === 'rechazada') {
    const quien = rendicion.status.includes("jefe") ? "Jefe" : "Administrador"
    timelineEvents.push({
      fecha: rendicion.updated_at || rendicion.created_at,
      texto: `Rechazada por ${quien}`
    })
  } else if (rendicion.status.startsWith('aprobado') || rendicion.status === 'aprobado') {
    const quien = rendicion.status.includes("jefe") ? "Jefe" : "Administrador"
    timelineEvents.push({
      fecha: rendicion.updated_at || rendicion.created_at,
      texto: `Aprobada por ${quien}`
    })
  }
  timelineEvents.push({
    fecha: rendicion.created_at,
    texto: `Creada por ${rendicion.user_name || "Trabajador"}`
  })

  return (
    <div className="page-container">
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--card-border)', paddingBottom: '12px' }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: '800', margin: 0 }}>
          Detalle de Rendición #{rendicion.id}
        </h2>
        <button 
          onClick={() => navigate('/solicitudes')}
          className="btn btn-secondary"
          style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '600' }}
        >
          <i className="fa fa-arrow-left"></i> Volver
        </button>
      </div>

      {errorMsg && (
        <div style={{ background: 'rgba(220, 38, 38, 0.1)', borderLeft: '4px solid var(--danger)', color: 'var(--danger)', padding: '12px', borderRadius: '4px', fontSize: '0.88rem', marginBottom: '20px', whiteSpace: 'pre-line' }}>
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div style={{ background: 'rgba(22, 163, 74, 0.1)', borderLeft: '4px solid var(--success)', color: 'var(--success)', padding: '12px', borderRadius: '4px', fontSize: '0.88rem', marginBottom: '20px' }}>
          {successMsg}
        </div>
      )}

      {/* SECCIÓN 1: CABECERA Y METADATOS */}
      <section className="card" style={{ padding: '20px', marginBottom: '24px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '16px', borderBottom: '1px solid var(--card-border)', paddingBottom: '12px' }}>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Solicitante:</span>
            <h4 style={{ margin: '4px 0 0 0', fontSize: '1.1rem', fontWeight: '700' }}>{rendicion.user_name}</h4>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Fecha Creación:</span>
            <div style={{ fontSize: '0.9rem', fontWeight: '600', marginTop: '4px' }}>{formatDateTime(rendicion.created_at)}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Cliente</span>
            <div style={{ fontSize: '0.92rem', fontWeight: '600', marginTop: '4px' }}>{rendicion.cliente || '-'}</div>
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Guía de Servicio</span>
            <div style={{ fontSize: '0.92rem', fontWeight: '600', marginTop: '4px' }}>{rendicion.guia || '-'}</div>
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Proyecto</span>
            <div style={{ fontSize: '0.92rem', fontWeight: '600', marginTop: '4px' }}>{rendicion.proyecto || '-'}</div>
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Trabajo realizado</span>
            <div style={{ fontSize: '0.92rem', fontWeight: '600', marginTop: '4px' }}>{rendicion.trabajo || '-'}</div>
          </div>
        </div>

        {rendicion.obs && (
          <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--card-border)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Observaciones</span>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{rendicion.obs}</p>
          </div>
        )}
      </section>

      {/* SECCIÓN 2: PROGRESO VISUAL */}
      <section className="card" style={{ padding: '20px', marginBottom: '24px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '750', margin: '0 0 16px 0', color: 'var(--text)' }}>
          Progreso del Flujo de Aprobación
        </h3>
        
        {/* Progress steps row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <div style={getStepStyle(colorCreada)}>Creada</div>
          <div style={getStepStyle(colorJefe)}>Revisión (Jefe)</div>
          <div style={getStepStyle(colorAdmin)}>Revisión (Admin)</div>
          <div style={getStepStyle(colorFinalizada)}>Finalizada</div>
        </div>

        {/* Timeline List */}
        <ul style={{ listStyleType: 'disc', paddingLeft: '20px', margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.8' }}>
          <li>Creada el {formatDateTimeUser(rendicion.created_at)}</li>
          
          {status === 'aprobado_jefe' && (
            <li>Aprobada el {formatDateTimeUser(rendicion.updated_at || rendicion.created_at)}</li>
          )}
          {(status === 'aprobado' || status === 'aprobado_admin') && (
            <li>Aprobada el {formatDateTimeUser(rendicion.updated_at || rendicion.created_at)}</li>
          )}
          {status === 'rechazado_jefe' && (
            <li>Rechazada el {formatDateTimeUser(rendicion.updated_at || rendicion.created_at)}</li>
          )}
          {(status === 'rechazado' || status === 'rechazado_admin' || status === 'rechazada') && (
            <li>Rechazada el {formatDateTimeUser(rendicion.updated_at || rendicion.created_at)}</li>
          )}
          
          <li>
            Estado actual: <strong>{['pendiente', 'pendiente_jefe', 'pendiente_admin'].includes(status) ? 'Pendiente' : 'Finalizada'}</strong>
          </li>
        </ul>
      </section>

      {/* SECCIÓN 3: HITOS REPORTADOS */}
      <section className="card" style={{ padding: '20px', marginBottom: '24px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflowX: 'auto' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '750', margin: '0 0 16px 0', color: 'var(--text)' }}>
          Hitos Reportados
        </h3>

        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              <th style={{ padding: '10px' }}>Día</th>
              <th style={{ padding: '10px' }}>Desde</th>
              <th style={{ padding: '10px' }}>Hasta</th>
              <th style={{ padding: '10px' }}>Tipo</th>
              <th style={{ padding: '10px' }}>Adicionales</th>
            </tr>
          </thead>
          <tbody>
            {(rendicion.hitos || []).map((h, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--card-border)', fontSize: '0.9rem' }}>
                <td style={{ padding: '10px', fontWeight: '600' }}>{formatDiaConNombre(h.day)}</td>
                <td style={{ padding: '10px' }}>{h.desde || '-'}</td>
                <td style={{ padding: '10px' }}>{h.hasta || '-'}</td>
                <td style={{ padding: '10px', textTransform: 'capitalize' }}>
                  {h.tipo === 'extra' ? 'Horas Extras' : h.tipo === 'viaje' ? 'Viaje' : h.tipo}
                </td>
                <td style={{ padding: '10px' }}>
                  {h.alojamiento === 1 && <span style={{ background: '#8e44ad', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', marginRight: '6px', fontWeight: '600' }}>Alojamiento</span>}
                  {h.feriado === 1 && <span style={{ background: '#e67e22', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: '600' }}>Feriado / Domingo</span>}
                  {h.alojamiento !== 1 && h.feriado !== 1 && '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* SECCIÓN 4: RESUMEN DE TIEMPOS */}
      <section className="card" style={{ padding: '20px', marginBottom: '24px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '750', margin: '0 0 16px 0', color: 'var(--text)' }}>
          Resumen de Horas Calculadas
        </h3>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '10px' }}>Concepto</th>
              <th style={{ padding: '10px', textAlign: 'center' }}>Real</th>
              <th style={{ padding: '10px', textAlign: 'right' }}>Horas Ajustadas Equivalentes</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
              <td style={{ padding: '10px' }}><i className="fa fa-bed" style={{ color: '#8e44ad', marginRight: '8px' }}></i> Alojamiento</td>
              <td style={{ padding: '10px', textAlign: 'center' }}>{rendicion.tiempos?.alojamiento?.real || 0} {rendicion.tiempos?.alojamiento?.real === 1 ? 'día' : 'días'}</td>
              <td style={{ padding: '10px', textAlign: 'right', fontWeight: '600' }}>{Number(rendicion.tiempos?.alojamiento?.ajustado || 0).toFixed(2)} hrs</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
              <td style={{ padding: '10px' }}><i className="fa fa-calendar-check" style={{ color: '#e67e22', marginRight: '8px' }}></i> Feriados / Domingos</td>
              <td style={{ padding: '10px', textAlign: 'center' }}>{rendicion.tiempos?.feriado?.real || 0} hrs</td>
              <td style={{ padding: '10px', textAlign: 'right', fontWeight: '600' }}>{Number(rendicion.tiempos?.feriado?.ajustado || 0).toFixed(2)} hrs</td>
            </tr>
            <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
              <td style={{ padding: '10px' }}><i className="fa fa-clock" style={{ color: '#2ecc71', marginRight: '8px' }}></i> Horas extras semanales</td>
              <td style={{ padding: '10px', textAlign: 'center' }}>{rendicion.tiempos?.extras?.real || 0} hrs</td>
              <td style={{ padding: '10px', textAlign: 'right', fontWeight: '600' }}>{Number(rendicion.tiempos?.extras?.ajustado || 0).toFixed(2)} hrs</td>
            </tr>
            <tr style={{ borderBottom: '2px solid var(--card-border)' }}>
              <td style={{ padding: '10px' }}><i className="fa fa-car" style={{ color: '#3498db', marginRight: '8px' }}></i> Viajes</td>
              <td style={{ padding: '10px', textAlign: 'center' }}>{rendicion.tiempos?.viaje?.real || 0} hrs</td>
              <td style={{ padding: '10px', textAlign: 'right', fontWeight: '600' }}>{Number(rendicion.tiempos?.viaje?.ajustado || 0).toFixed(2)} hrs</td>
            </tr>
            <tr style={{ fontSize: '1rem', fontWeight: '800' }}>
              <td style={{ padding: '14px 10px' }}>TOTAL RENDIDO</td>
              <td></td>
              <td style={{ padding: '14px 10px', textAlign: 'right', color: 'var(--accent)' }}>
                {Number(
                  rendicion.total_horas && Number(rendicion.total_horas) > 0
                    ? rendicion.total_horas
                    : (
                        Number(rendicion.tiempos?.alojamiento?.ajustado || 0) +
                        Number(rendicion.tiempos?.feriado?.ajustado || 0) +
                        Number(rendicion.tiempos?.extras?.ajustado || 0) +
                        Number(rendicion.tiempos?.viaje?.ajustado || 0)
                      )
                ).toFixed(2)} hrs
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* SECCIÓN 5: ESTADO DE LA SOLICITUD */}
      <section className="card" style={{ padding: '20px', marginBottom: '24px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '750', margin: '0 0 16px 0', color: 'var(--text)' }}>
          Estado de la Rendición
        </h3>
        
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Estado</span>
            <div style={{
              marginTop: '4px', padding: '6px 14px', borderRadius: '12px', fontSize: '0.88rem', fontWeight: '600', display: 'inline-block',
              background: ['aprobado', 'aprobado_admin', 'aprobado_jefe'].includes(rendicion.status) ? 'rgba(16, 185, 129, 0.15)' : ['rechazado', 'rechazado_admin', 'rechazado_jefe', 'rechazada'].includes(rendicion.status) ? 'rgba(239, 68, 68, 0.15)' : 'rgba(230, 126, 34, 0.15)',
              color: ['aprobado', 'aprobado_admin', 'aprobado_jefe'].includes(rendicion.status) ? 'var(--success)' : ['rechazado', 'rechazado_admin', 'rechazado_jefe', 'rechazada'].includes(rendicion.status) ? 'var(--danger)' : '#e67e22',
            }}>
              {statusMap[rendicion.status] || rendicion.status}
            </div>
          </div>

          {rendicion.razon && (
            <div style={{ flex: 1 }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Razón / Feedback</span>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: 'var(--text)', fontWeight: '500' }}>{rendicion.razon}</p>
            </div>
          )}
        </div>
      </section>

      {/* SECCIÓN 6: ACCIONES DE JEFE / ADMIN */}
      {canApproveOrReject && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '24px' }}>
          <button 
            className="btn btn-danger"
            onClick={() => setShowRechazarPopup(true)}
            style={{ padding: '12px 24px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '600' }}
          >
            <i className="fa fa-times"></i> Rechazar Rendición
          </button>
          <button 
            className="btn btn-primary"
            onClick={() => setShowAprobarPopup(true)}
            style={{ padding: '12px 30px', background: 'var(--success)', color: '#fff', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '600' }}
          >
            <i className="fa fa-check"></i> Aprobar Rendición
          </button>
        </div>
      )}

      {/* POPUP APROBAR */}
      {showAprobarPopup && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)',
            padding: '30px', maxWidth: '440px', width: '90%', boxShadow: 'var(--shadow-lg)'
          }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: '0 0 16px 0', color: 'var(--success)' }}>
              <i className="fa fa-check-circle"></i> Confirmar Aprobación
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: '1.5', margin: '0 0 16px 0' }}>
              ¿Está seguro que desea aprobar esta rendición de horas de proyecto?
            </p>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.02)', padding: '10px', borderRadius: '4px', borderLeft: '3px solid var(--success)' }}>
              Se sumarán <strong>{rendicion.total_horas}</strong> horas al saldo acumulado del trabajador.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button 
                onClick={() => setShowAprobarPopup(false)}
                disabled={submitting}
                style={{ padding: '10px 18px', background: 'var(--card-border)', color: 'var(--text)', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: submitting ? 0.7 : 1 }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleAprobar}
                disabled={submitting}
                style={{ padding: '10px 20px', background: 'var(--success)', color: '#fff', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: submitting ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                {submitting ? (
                  <>
                    <i className="fa fa-spinner fa-spin"></i> Procesando...
                  </>
                ) : (
                  'Confirmar y Aprobar'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP RECHAZAR */}
      {showRechazarPopup && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div style={{
            background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)',
            padding: '30px', maxWidth: '440px', width: '90%', boxShadow: 'var(--shadow-lg)'
          }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: '0 0 16px 0', color: 'var(--danger)' }}>
              <i className="fa fa-times-circle"></i> Rechazar Rendición
            </h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text)', lineHeight: '1.5', margin: '0 0 16px 0' }}>
              Por favor, indique la razón del rechazo de esta rendición:
            </p>
            
            <textarea 
              rows={4}
              placeholder="Indique los motivos detalladamente..."
              value={razonRechazo}
              onChange={(e) => setRazonRechazo(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', resize: 'vertical', boxSizing: 'border-box' }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
              <button 
                onClick={() => { setShowRechazarPopup(false); setRazonRechazo(''); }}
                disabled={submitting}
                style={{ padding: '10px 18px', background: 'var(--card-border)', color: 'var(--text)', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: submitting ? 0.7 : 1 }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleRechazar}
                disabled={submitting}
                style={{ padding: '10px 20px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: '6px', cursor: submitting ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: submitting ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                {submitting ? (
                  <>
                    <i className="fa fa-spinner fa-spin"></i> Procesando...
                  </>
                ) : (
                  'Confirmar Rechazo'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
