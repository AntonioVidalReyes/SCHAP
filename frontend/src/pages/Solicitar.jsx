import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Solicitar({ currentUser }) {
  const navigate = useNavigate()
  const [requestType, setRequestType] = useState(null) // null, 'permiso', 'notificacion'
  const [rows, setRows] = useState([])
  const [workSchedule, setWorkSchedule] = useState(null)
  const [permisosPendientes, setPermisosPendientes] = useState([])
  
  // Feedback states
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [saving, setSaving] = useState(false)
  
  // Warning Dialog Overlay
  const [showWarningOverlay, setShowWarningOverlay] = useState(false)
  const [warningDetails, setWarningDetails] = useState(null)
  const [countdown, setCountdown] = useState(0)

  useEffect(() => {
    async function loadConfig() {
      try {
        const [schedRes, reqsRes] = await Promise.all([
          api.get('/api/config/schedule'),
          api.get('/api/requests?mine=1')
        ])

        if (schedRes.ok) {
          const sData = await schedRes.json()
          setScheduleConfig(sData.schedule)
        }
        if (reqsRes.ok) {
          const rData = await reqsRes.json()
          const requests = rData.requests || []
          setPermisosPendientes(requests.filter(r => 
            r.type === "Permiso" && 
            (r.status === "pendiente" || r.status === "pendiente_jefe" || r.status === "pendiente_admin")
          ))
        }
      } catch (err) {
        console.error("Error loading request config:", err)
      }
    }
    loadConfig()
  }, [])

  const setScheduleConfig = (sched) => {
    setWorkSchedule(sched)
  }

  // Row Management
  const addRow = () => {
    setRows([...rows, {
      day: '',
      from: '',
      to: '',
      full_day: false,
      comment: ''
    }])
  }

  const removeRow = (index) => {
    setRows(rows.filter((_, idx) => idx !== index))
  }

  const updateRow = (index, field, value) => {
    const updated = [...rows]
    updated[index][field] = value

    // If day is updated, suggest start/end work hours
    if (field === 'day' && value && workSchedule) {
      const dayName = getDayName(value)
      const daySchedule = workSchedule[dayName]
      if (daySchedule && !daySchedule.off && daySchedule.start && daySchedule.end) {
        updated[index].from = daySchedule.start
        updated[index].to = daySchedule.end
      }
    }

    // If full_day is toggled to true, empty from/to
    if (field === 'full_day' && value === true) {
      updated[index].from = ''
      updated[index].to = ''
    }

    setRows(updated)
  }

  // Work Schedule Helpers
  const getDayName = (dateStr) => {
    const date = new Date(dateStr + "T12:00:00")
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    return days[date.getDay()]
  }

  const getDayNameSpanish = (dateStr) => {
    const date = new Date(dateStr + "T12:00:00")
    const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
    return days[date.getDay()]
  }

  const isDayOff = (dateStr) => {
    if (!workSchedule) return false
    const dayName = getDayName(dateStr)
    return workSchedule[dayName] ? !!workSchedule[dayName].off : false
  }

  const getWorkHoursForDay = (dateStr) => {
    if (!workSchedule) return null
    const dayName = getDayName(dateStr)
    const daySchedule = workSchedule[dayName]
    if (!daySchedule || daySchedule.off) return null
    return {
      start: daySchedule.start || null,
      end: daySchedule.end || null
    }
  }

  const validateRow = (row) => {
    const errors = []
    if (!workSchedule) return { valid: true, errors: [] }

    if (isDayOff(row.day)) {
      errors.push(`${row.day}: ${getDayNameSpanish(row.day)} está marcado como día libre en horarios.`)
      return { valid: false, errors }
    }

    if (row.full_day) return { valid: true, errors: [] }

    const workHours = getWorkHoursForDay(row.day)
    if (workHours && workHours.start && workHours.end) {
      if (row.from < workHours.start) {
        errors.push(`${row.day}: La hora de inicio (${row.from}) es anterior a la jornada laboral (${workHours.start}).`)
      }
      if (row.to > workHours.end) {
        errors.push(`${row.day}: La hora de fin (${row.to}) es posterior a la jornada laboral (${workHours.end}).`)
      }
      if (row.from >= row.to) {
        errors.push(`${row.day}: La hora de inicio debe ser anterior a la de fin.`)
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  const calculateDiferenciaHoras = (desde, hasta) => {
    if (!desde || !hasta) return 0
    const [hDesde, mDesde] = desde.split(":").map(Number)
    const [hHasta, mHasta] = hasta.split(":").map(Number)
    const minutosDesde = hDesde * 60 + mDesde
    const minutosHasta = hHasta * 60 + mHasta
    return (minutosHasta - minutosDesde) / 60
  }

  const calcularHorasTotales = (rowsList) => {
    let total = 0
    for (const r of rowsList) {
      if (r.full_day) {
        const wh = getWorkHoursForDay(r.day)
        if (wh && wh.start && wh.end) {
          total += calculateDiferenciaHoras(wh.start, wh.end)
        } else {
          total += 8
        }
      } else {
        total += calculateDiferenciaHoras(r.from, r.to)
      }
    }
    return total
  }

  // Submit Handler
  const handleSave = async () => {
    setErrorMsg('')
    setSuccessMsg('')

    const validRows = rows.filter(r => r.day && (r.full_day || (r.from && r.to)))

    if (validRows.length === 0) {
      setErrorMsg("Debe agregar al menos una fila con datos válidos.")
      return
    }

    // Schedule validation
    if (workSchedule) {
      const allErrors = []
      for (const row of validRows) {
        const validation = validateRow(row)
        if (!validation.valid) {
          allErrors.push(...validation.errors)
        }
      }
      if (allErrors.length > 0) {
        setErrorMsg(allErrors.join(" \n"))
        return
      }
    }

    if (requestType === 'notificacion') {
      // Direct Notification Submit
      setSaving(true)
      try {
        const res = await api.post('/api/notificaciones/batch', { rows: validRows })
        const data = await res.json()
        if (!res.ok) {
          setErrorMsg(data.error || "Error guardando las notificaciones.")
          setSaving(false)
          return
        }
        setSuccessMsg(data.message || "Notificaciones registradas con éxito.")
        setRows([])
        setTimeout(() => {
          setSaving(false)
          setRequestType(null)
        }, 2000)
      } catch (err) {
        setErrorMsg("Error de red.")
        setSaving(false)
      }
    } else {
      // Permit Requests Validation
      const saldoActual = (currentUser.bonus_hours || 0) - (currentUser.used_hours || 0)

      if (saldoActual < 0) {
        setErrorMsg(`Su saldo es negativo (${saldoActual.toFixed(1)}h). No puede solicitar nuevos permisos.`)
        return
      }

      const totalHorasSolicitud = calcularHorasTotales(validRows)
      const saldoDespues = saldoActual - totalHorasSolicitud

      if (saldoDespues < 0) {
        if (permisosPendientes.length > 0) {
          setErrorMsg(`Tiene ${permisosPendientes.length} solicitud(es) pendiente(s). Debe esperar su revisión antes de solicitar más horas de las disponibles.`)
          return
        }

        // Show negative balance confirmation with 10 second countdown
        setWarningDetails({
          saldoActual,
          totalHorasSolicitud,
          saldoDespues,
          validRows
        })
        setCountdown(10)
        setShowWarningOverlay(true)
      } else {
        // Direct submit
        submitPermisoBatch(validRows)
      }
    }
  }

  // Countdowns timer for Negative Balance warning
  useEffect(() => {
    let timer = null
    if (showWarningOverlay && countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    }
    return () => clearTimeout(timer)
  }, [showWarningOverlay, countdown])

  const submitPermisoBatch = async (batchRows) => {
    setShowWarningOverlay(false)
    setSaving(true)
    try {
      const res = await api.post('/api/requests/batch', { rows: batchRows })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || "No se pudieron registrar las solicitudes.")
        setSaving(false)
        return
      }
      setSuccessMsg(data.message || "Solicitudes de permiso enviadas correctamente.")
      setRows([])
      setTimeout(() => {
        setSaving(false)
        setRequestType(null)
      }, 2000)
    } catch (err) {
      setErrorMsg("Error de red.")
      setSaving(false)
    }
  }

  return (
    <div className="page-container">
      
      {!requestType ? (
        // HUB VIEW
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: '800', marginBottom: '24px', textAlign: 'center' }}>
            Selecciona el tipo de solicitud
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '24px',
            marginTop: '20px'
          }}>
            
            {/* CARD: Notificación */}
            <div 
              onClick={() => { setRequestType('notificacion'); addRow(); setErrorMsg(''); }}
              className="sol-card" 
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                borderRadius: 'var(--radius)',
                padding: '30px',
                textAlign: 'center',
                cursor: 'pointer',
                boxShadow: 'var(--shadow)'
              }}
            >
              <div style={{ fontSize: '2.5rem', color: '#3498db', marginBottom: '16px' }}>
                <i className="fa fa-bell"></i>
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', margin: '0 0 10px 0' }}>Notificación</h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                Registra un día o fracción de forma informativa sin requerir aprobación del jefe.
              </p>
            </div>

            {/* CARD: Permiso */}
            <div 
              onClick={() => { setRequestType('permiso'); addRow(); setErrorMsg(''); }}
              className="sol-card" 
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                borderRadius: 'var(--radius)',
                padding: '30px',
                textAlign: 'center',
                cursor: 'pointer',
                boxShadow: 'var(--shadow)'
              }}
            >
              <div style={{ fontSize: '2.5rem', color: '#10b981', marginBottom: '16px' }}>
                <i className="fa fa-gift"></i>
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', margin: '0 0 10px 0' }}>Permiso</h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                Solicita horas administrativas con cargo a tu bolsa de horas acumuladas.
              </p>
            </div>

            {/* CARD: Rendición */}
            <div 
              onClick={() => navigate('/rendir')}
              className="sol-card" 
              style={{
                background: 'var(--card-bg)',
                border: '1px solid var(--card-border)',
                borderRadius: 'var(--radius)',
                padding: '30px',
                textAlign: 'center',
                cursor: 'pointer',
                boxShadow: 'var(--shadow)'
              }}
            >
              <div style={{ fontSize: '2.5rem', color: 'var(--accent)', marginBottom: '16px' }}>
                <i className="fa fa-eye"></i>
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', margin: '0 0 10px 0' }}>Rendición</h3>
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: '1.4' }}>
                Rinde las horas extras y traslados trabajados en clientes para sumarlas a tu bolsa.
              </p>
            </div>

          </div>
        </div>
      ) : (
        // REQUEST FORM VIEW
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 'var(--radius)',
          padding: '24px',
          boxShadow: 'var(--shadow)'
        }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--card-border)', paddingBottom: '12px' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '800', margin: 0, textTransform: 'capitalize' }}>
              Crear {requestType === 'permiso' ? 'Solicitud de Permiso' : 'Notificación de Horas'}
            </h2>
            <button 
              onClick={() => { setRequestType(null); setRows([]); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.9rem', cursor: 'pointer', fontWeight: '600' }}
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

          <table className="req-table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '24px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px' }}>Día</th>
                <th style={{ padding: '10px' }}>Desde</th>
                <th style={{ padding: '10px' }}>Hasta</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Día Completo</th>
                <th style={{ padding: '10px' }}>Comentario</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index} style={{ borderBottom: '1px solid var(--card-border)' }}>
                  <td style={{ padding: '8px' }}>
                    <input 
                      type="date" 
                      value={row.day} 
                      onChange={(e) => updateRow(index, 'day', e.target.value)} 
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input 
                      type="time" 
                      value={row.from} 
                      disabled={row.full_day}
                      onChange={(e) => updateRow(index, 'from', e.target.value)} 
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <input 
                      type="time" 
                      value={row.to} 
                      disabled={row.full_day}
                      onChange={(e) => updateRow(index, 'to', e.target.value)} 
                      style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
                    />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    <input 
                      type="checkbox" 
                      checked={row.full_day} 
                      onChange={(e) => updateRow(index, 'full_day', e.target.checked)} 
                    />
                  </td>
                  <td style={{ padding: '8px' }}>
                    <textarea 
                      placeholder="Indique motivo..." 
                      value={row.comment} 
                      onChange={(e) => updateRow(index, 'comment', e.target.value)} 
                      style={{ width: '100%', minHeight: '36px', padding: '6px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                    />
                  </td>
                  <td style={{ padding: '8px', textAlign: 'center' }}>
                    <button 
                      onClick={() => removeRow(index)}
                      style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1rem' }}
                    >
                      <i className="fa fa-trash-can"></i>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <button 
              className="btn btn-secondary" 
              onClick={addRow}
              style={{ padding: '10px 18px', background: 'var(--card-border)', border: 'none', borderRadius: '6px', color: 'var(--text)', cursor: 'pointer', fontWeight: '600' }}
            >
              <i className="fa fa-plus-circle"></i> Agregar Fila
            </button>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                className="btn btn-danger" 
                onClick={() => setRows([])}
                style={{ padding: '10px 18px', background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
              >
                Limpiar todo
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleSave}
                disabled={saving}
                style={{ padding: '10px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: saving ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                {saving ? (
                  <>
                    <i className="fa fa-spinner fa-spin"></i> Enviando...
                  </>
                ) : (
                  'Enviar Solicitud'
                )}
              </button>
            </div>
          </div>

        </div>
      )}

      {/* WARNING OVERLAY COUNTDOWN FOR NEGATIVE BALANCE */}
      {showWarningOverlay && warningDetails && (
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
            padding: '30px',
            maxWidth: '480px',
            width: '90%',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: '800', margin: '0 0 16px 0', color: 'var(--danger)' }}>
              <i className="fa fa-triangle-exclamation"></i> Advertencia de Saldo
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.5', margin: '0 0 20px 0' }}>
              Esta solicitud <strong>superará su saldo</strong> de horas disponibles acumulado.
            </p>
            
            <table style={{ width: '100%', fontSize: '0.88rem', borderCollapse: 'collapse', marginBottom: '24px' }}>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--card-border)' }}><td style={{ padding: '8px 0' }}>Saldo actual:</td><td style={{ padding: '8px 0', fontWeight: 'bold' }}>{warningDetails.saldoActual.toFixed(1)} h</td></tr>
                <tr style={{ borderBottom: '1px solid var(--card-border)' }}><td style={{ padding: '8px 0' }}>Horas solicitadas:</td><td style={{ padding: '8px 0', fontWeight: 'bold' }}>{warningDetails.totalHorasSolicitud.toFixed(1)} h</td></tr>
                <tr><td style={{ padding: '8px 0' }}>Saldo resultante:</td><td style={{ padding: '8px 0', fontWeight: 'bold', color: 'var(--danger)' }}>{warningDetails.saldoDespues.toFixed(1)} h</td></tr>
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button 
                onClick={() => setShowWarningOverlay(false)}
                style={{ padding: '10px 18px', background: 'var(--card-border)', color: 'var(--text)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
              >
                Cancelar
              </button>
              <button 
                onClick={() => submitPermisoBatch(warningDetails.validRows)}
                disabled={countdown > 0}
                style={{
                  padding: '10px 20px',
                  background: countdown > 0 ? 'var(--card-border)' : 'var(--danger)',
                  color: countdown > 0 ? 'var(--text-muted)' : '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: countdown > 0 ? 'not-allowed' : 'pointer',
                  fontWeight: '600'
                }}
              >
                {countdown > 0 ? `Esperar (${countdown}s)` : 'Enviar ahora'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
