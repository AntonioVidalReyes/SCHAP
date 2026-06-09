import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Rendicion({ currentUser }) {
  const navigate = useNavigate()
  const [cliente, setCliente] = useState('')
  const [guia, setGuia] = useState('')
  const [trabajo, setTrabajo] = useState('')
  const [proyecto, setProyecto] = useState('')
  const [obs, setObs] = useState('')
  const [hitos, setHitos] = useState([])
  const [workSchedule, setWorkSchedule] = useState(null)
  
  // Factores
  const [factores, setFactores] = useState({
    alojamiento: 4.5,
    feriado: 2.0, // 200%
    extras: 1.5,  // 150%
    viaje: 0.5    // 50%
  })

  // Resumen
  const [resumen, setResumen] = useState({
    viaje: { real: 0, ajustado: 0 },
    alojamiento: { real: 0, ajustado: 0 },
    feriado: { real: 0, ajustado: 0 },
    extras: { real: 0, ajustado: 0 }
  })

  const [totalReal, setTotalReal] = useState(0)
  const [totalAjus, setTotalAjus] = useState(0)

  // Status
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [saving, setSaving] = useState(false)

  // Load Work Schedule and Factores
  useEffect(() => {
    async function loadConfig() {
      try {
        const [schedRes, factRes] = await Promise.all([
          api.get('/api/config/schedule'),
          api.get('/api/config/factores')
        ])

        if (schedRes.ok) {
          const sData = await schedRes.json()
          setWorkSchedule(sData.schedule)
        }

        if (factRes.ok) {
          const fData = await factRes.json()
          const apiFactores = fData.factores || fData.value
          if (apiFactores) {
            setFactores({
              alojamiento: parseFloat(apiFactores.alojamiento) || 4.5,
              feriado: (parseFloat(apiFactores.feriado) || 200) / 100,
              extras: (parseFloat(apiFactores.extras) || 150) / 100,
              viaje: (parseFloat(apiFactores.viaje) || 50) / 100
            })
          }
        }
      } catch (err) {
        console.error("Error loading rendicion configuration:", err)
      }
    }
    loadConfig()
  }, [])

  // Helper date/schedule calculations
  const getDayName = (dateStr) => {
    const date = new Date(dateStr + "T12:00:00")
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    return days[date.getDay()]
  }

  const getDayNumber = (dateStr) => {
    const date = new Date(dateStr + "T12:00:00")
    return date.getDay() // 0 = Sunday, 6 = Saturday
  }

  const getWorkHoursForDay = (dateStr) => {
    if (!workSchedule) return { start: "08:30", end: "18:30" }
    const dayName = getDayName(dateStr)
    const daySched = workSchedule[dayName]
    if (!daySched) return { start: "08:30", end: "18:30" }
    if (daySched.off) return null
    return {
      start: daySched.start || "08:30",
      end: daySched.end || "18:30"
    }
  }

  const timeToMinutes = (timeStr) => {
    if (!timeStr) return 0
    const [h, m] = timeStr.split(":").map(Number)
    return h * 60 + m
  }

  const minutesToHours = (minutes) => {
    return Math.round((minutes / 60) * 100) / 100
  }

  const calculateHours = (from, to) => {
    const fromMin = timeToMinutes(from)
    const toMin = timeToMinutes(to)
    if (toMin <= fromMin) return 0
    return minutesToHours(toMin - fromMin)
  }

  const calculateExtraHours = (dateStr, from, to) => {
    const workHours = getWorkHoursForDay(dateStr)
    if (!workHours) {
      return calculateHours(from, to)
    }

    const fromMin = timeToMinutes(from)
    const toMin = timeToMinutes(to)
    const workStartMin = timeToMinutes(workHours.start)
    const workEndMin = timeToMinutes(workHours.end)

    let extraMinutes = 0

    // Hours before work start
    if (fromMin < workStartMin) {
      extraMinutes += Math.min(toMin, workStartMin) - fromMin
    }

    // Hours after work end
    if (toMin > workEndMin) {
      extraMinutes += toMin - Math.max(fromMin, workEndMin)
    }

    return minutesToHours(extraMinutes)
  }

  const isValidExtraTime = (dateStr, from, to) => {
    const workHours = getWorkHoursForDay(dateStr)
    if (!workHours) return true

    const fromMin = timeToMinutes(from)
    const toMin = timeToMinutes(to)
    const workStartMin = timeToMinutes(workHours.start)
    const workEndMin = timeToMinutes(workHours.end)

    return (toMin <= workStartMin) || (fromMin >= workEndMin)
  }

  // Overlap & Rule Validations
  const validateHitoLocal = (index, hito, otherHitos) => {
    const { day, tipo, desde, hasta, alojamiento } = hito

    if (!day) return "Debe seleccionar un día."
    if (!tipo) return "Debe seleccionar un tipo (Horas Extras o Viaje)."
    if (!desde || !hasta) return "Debe ingresar hora desde y hasta."
    
    if (timeToMinutes(desde) >= timeToMinutes(hasta)) {
      return "La hora 'Desde' debe ser anterior a la hora 'Hasta'."
    }

    // 1. Check if there's an accommodation (alojamiento) on this day already in other hitos
    const alreadyAloj = otherHitos.some((oh, idx) => idx !== index && oh.day === day && oh.alojamiento && oh.calculada)
    if (alreadyAloj && tipo === "extra" && !alojamiento) {
      return `Ya existe un alojamiento para el día ${day}. No se pueden agregar más horas extras en este día (solo viaje).`
    }

    // 2. If this is alojamiento, make sure no other extras exist on this day
    if (alojamiento) {
      const hasOtherExtras = otherHitos.some((oh, idx) => idx !== index && oh.day === day && (oh.tipo === "extra" || oh.feriado) && oh.calculada)
      if (hasOtherExtras) {
        return `Ya existen horas extras para el día ${day}. No se puede agregar alojamiento si hay horas extras.`
      }
    }

    // 3. Check time overlaps (skip for alojamiento since it is standard daily factor)
    if (!alojamiento) {
      const desdeMin = timeToMinutes(desde)
      const hastaMin = timeToMinutes(hasta)

      for (let i = 0; i < otherHitos.length; i++) {
        if (i === index) continue
        const oh = otherHitos[i]
        if (oh.day !== day || oh.alojamiento || !oh.calculada) continue

        const ohDesdeMin = timeToMinutes(oh.desde)
        const ohHastaMin = timeToMinutes(oh.hasta)

        if (desdeMin < ohHastaMin && hastaMin > ohDesdeMin) {
          return `Solapamiento de horarios con otro hito (${oh.desde} - ${oh.hasta}) en el día ${day}.`
        }
      }
    }

    return null
  }

  // Row Controls
  const addHitoRow = () => {
    setHitos([...hitos, {
      day: '',
      desde: '',
      hasta: '',
      tipo: '',
      alojamiento: false,
      feriado: false,
      valor: 0,
      calculada: false
    }])
  }

  const removeHitoRow = (index) => {
    const updated = hitos.filter((_, idx) => idx !== index)
    setHitos(updated)
    recalcularTotales(updated)
  }

  const updateHitoRow = (index, field, value) => {
    const updated = [...hitos]
    const row = updated[index]
    row[field] = value

    // Reset validations and calculations if values change
    row.calculada = false
    row.valor = 0

    if (field === 'tipo') {
      row.alojamiento = false
      row.feriado = false
    }

    if (field === 'alojamiento') {
      if (value === true) {
        row.feriado = false
        const workHours = getWorkHoursForDay(row.day)
        if (workHours) {
          row.desde = workHours.start
          row.hasta = workHours.end
        }
      } else {
        row.desde = ''
        row.hasta = ''
      }
    }

    if (field === 'feriado' && value === true) {
      row.alojamiento = false
    }

    if (field === 'day' && value) {
      if (row.alojamiento) {
        const workHours = getWorkHoursForDay(value)
        if (workHours) {
          row.desde = workHours.start
          row.hasta = workHours.end
        }
      }
    }

    setHitos(updated)
    recalcularTotales(updated)
  }

  // Calculate Single Row
  const handleCalcularRow = (index) => {
    setErrorMsg('')
    const updated = [...hitos]
    const row = updated[index]

    const error = validateHitoLocal(index, row, hitos)
    if (error) {
      setErrorMsg(error)
      return
    }

    const dayNumber = getDayNumber(row.day)
    const esDomingo = dayNumber === 0

    if (row.tipo === 'viaje') {
      const horas = calculateHours(row.desde, row.hasta)
      if (!isValidExtraTime(row.day, row.desde, row.hasta)) {
        setErrorMsg("Las horas de viaje deben ser fuera de la jornada laboral.")
        return
      }
      row.valor = horas
      row.calculada = true
    } else if (row.tipo === 'extra') {
      if (row.alojamiento) {
        row.valor = 1 // 1 dia de alojamiento
        row.calculada = true
      } else if (row.feriado || esDomingo) {
        const horas = calculateHours(row.desde, row.hasta)
        row.valor = horas
        row.calculada = true
      } else {
        // Horas extras comunes L-S
        if (dayNumber < 1 || dayNumber > 6) {
          setErrorMsg("Las horas extras ordinarias solo aplican de Lunes a Sábado. Para Domingos use el check de 'Feriado'.")
          return
        }

        const horasExtras = calculateExtraHours(row.day, row.desde, row.hasta)
        if (horasExtras <= 0) {
          setErrorMsg("Las horas extras deben ser fuera del horario de la jornada laboral.")
          return
        }
        row.valor = horasExtras
        row.calculada = true
      }
    }

    setHitos(updated)
    recalcularTotales(updated)
  }

  // Recalculate Totales
  const recalcularTotales = (hitosList) => {
    let realViaje = 0
    let realAloj = 0
    let realFeriado = 0
    let realExtras = 0

    hitosList.forEach(h => {
      if (!h.calculada) return
      
      if (h.tipo === 'viaje') {
        realViaje += h.valor
      } else if (h.tipo === 'extra') {
        if (h.alojamiento) {
          realAloj += h.valor // En dias
        } else if (h.feriado || getDayNumber(h.day) === 0) {
          realFeriado += h.valor
        } else {
          realExtras += h.valor
        }
      }
    })

    const ajusViaje = round(realViaje * factores.viaje, 2)
    const ajusAloj = round(realAloj * factores.alojamiento, 2)
    const ajusFeriado = round(realFeriado * factores.feriado, 2)
    const ajusExtras = round(realExtras * factores.extras, 2)

    const resObj = {
      viaje: { real: realViaje, ajustado: ajusViaje },
      alojamiento: { real: realAloj, ajustado: ajusAloj },
      feriado: { real: realFeriado, ajustado: ajusFeriado },
      extras: { real: realExtras, ajustado: ajusExtras }
    }

    setResumen(resObj)
    setTotalReal(realViaje + realFeriado + realExtras)
    setTotalAjus(round(ajusViaje + ajusAloj + ajusFeriado + ajusExtras, 2))
  }

  const limpiarFormulario = () => {
    setCliente('')
    setGuia('')
    setTrabajo('')
    setProyecto('')
    setObs('')
    setHitos([])
    setResumen({
      viaje: { real: 0, ajustado: 0 },
      alojamiento: { real: 0, ajustado: 0 },
      feriado: { real: 0, ajustado: 0 },
      extras: { real: 0, ajustado: 0 }
    })
    setTotalReal(0)
    setTotalAjus(0)
    setErrorMsg('')
    setSuccessMsg('')
  }

  const handleSave = async () => {
    setErrorMsg('')
    setSuccessMsg('')

    if (!cliente.trim()) {
      setErrorMsg("Debe especificar el Cliente.")
      return
    }

    const calculatedHitos = hitos.filter(h => h.calculada)
    if (calculatedHitos.length === 0) {
      setErrorMsg("Debe agregar y calcular al menos un Hito.")
      return
    }

    setSaving(true)

    // Build payload matching backend requirements
    const payload = {
      cliente: cliente.trim(),
      guia: guia.trim(),
      trabajo: trabajo.trim(),
      proyecto: proyecto.trim(),
      obs: obs.trim(),
      hitos: calculatedHitos.map(h => ({
        day: h.day,
        desde: h.desde,
        hasta: h.hasta,
        tipo: h.tipo,
        valor: h.valor,
        alojamiento: h.alojamiento ? 1 : 0,
        feriado: h.feriado ? 1 : 0
      })),
      total_horas: round(totalAjus, 2),
      tiempos: {
        viaje: {
          real: resumen.viaje.real,
          ajustado: resumen.viaje.ajustado
        },
        alojamiento: {
          real: resumen.alojamiento.real,
          ajustado: resumen.alojamiento.ajustado
        },
        feriado: {
          real: resumen.feriado.real,
          ajustado: resumen.feriado.ajustado
        },
        extras: {
          real: resumen.extras.real,
          ajustado: resumen.extras.ajustado
        }
      }
    }

    try {
      const res = await api.post('/api/rendiciones', payload)
      const data = await res.json()

      if (!res.ok) {
        setErrorMsg(data.error || "Error al enviar la rendición.")
        setSaving(false)
        return
      }

      setSuccessMsg(data.message || "Rendición registrada y enviada para aprobación.")
      setTimeout(() => {
        limpiarFormulario()
        setSaving(false)
        navigate('/solicitudes')
      }, 2000)
    } catch (err) {
      setErrorMsg("Error de red al enviar la rendición.")
      setSaving(false)
    }
  }

  const round = (val, dec) => {
    return Math.round(val * Math.pow(10, dec)) / Math.pow(10, dec)
  }

  return (
    <div className="page-container">
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '1px solid var(--card-border)', paddingBottom: '12px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '800', margin: 0 }}>
          Solicitar Rendición de Horas por Proyecto
        </h2>
        <button 
          onClick={() => navigate('/solicitar')}
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

      {/* SECCIÓN 1: DATOS GENERALES */}
      <section className="card" style={{ padding: '20px', marginBottom: '24px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '750', margin: '0 0 16px 0', color: 'var(--text)' }}>
          Datos Generales del Servicio
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Cliente *</label>
            <input 
              type="text" 
              placeholder="Nombre del Cliente"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Guía de Servicio</label>
            <input 
              type="text" 
              placeholder="Número de guía"
              value={guia}
              onChange={(e) => setGuia(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Proyecto</label>
            <input 
              type="text" 
              placeholder="Nombre / Código de Proyecto"
              value={proyecto}
              onChange={(e) => setProyecto(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Trabajo realizado</label>
            <input 
              type="text" 
              placeholder="Descripción breve del trabajo"
              value={trabajo}
              onChange={(e) => setTrabajo(e.target.value)}
              style={{ padding: '10px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Observaciones</label>
            <textarea 
              placeholder="Observaciones adicionales..."
              rows={2}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', resize: 'vertical' }}
            />
          </div>
        </div>
      </section>

      {/* SECCIÓN 2: HITOS */}
      <section className="card" style={{ padding: '20px', marginBottom: '24px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', overflowX: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '750', margin: 0, color: 'var(--text)' }}>
            Detalle de Hitos Trabajados
          </h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Ingrese cada jornada y calcule sus horas correspondientes
          </span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              <th style={{ padding: '12px 10px' }}>Día</th>
              <th style={{ padding: '12px 10px' }}>Desde</th>
              <th style={{ padding: '12px 10px' }}>Hasta</th>
              <th style={{ padding: '12px 10px' }}>Tipo</th>
              <th style={{ padding: '12px 10px' }}>Configuración Adicional</th>
              <th style={{ padding: '12px 10px', textAlign: 'center' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {hitos.map((hito, idx) => (
              <tr key={idx} style={{ 
                borderBottom: '1px solid var(--card-border)', 
                background: hito.calculada ? 'rgba(16, 185, 129, 0.05)' : 'none'
              }}>
                <td style={{ padding: '10px' }}>
                  <input 
                    type="date"
                    value={hito.day}
                    disabled={hito.calculada}
                    onChange={(e) => updateHitoRow(idx, 'day', e.target.value)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
                  />
                </td>
                <td style={{ padding: '10px' }}>
                  <input 
                    type="time"
                    value={hito.desde}
                    disabled={hito.calculada || hito.alojamiento}
                    onChange={(e) => updateHitoRow(idx, 'desde', e.target.value)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
                  />
                </td>
                <td style={{ padding: '10px' }}>
                  <input 
                    type="time"
                    value={hito.hasta}
                    disabled={hito.calculada || hito.alojamiento}
                    onChange={(e) => updateHitoRow(idx, 'hasta', e.target.value)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
                  />
                </td>
                <td style={{ padding: '10px' }}>
                  <select
                    value={hito.tipo}
                    disabled={hito.calculada}
                    onChange={(e) => updateHitoRow(idx, 'tipo', e.target.value)}
                    style={{ padding: '8px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', width: '160px' }}
                  >
                    <option value="">-- Seleccionar --</option>
                    <option value="extra">Horas Extras</option>
                    <option value="viaje">Viaje</option>
                  </select>
                </td>
                <td style={{ padding: '10px', fontSize: '0.85rem' }}>
                  {hito.tipo === 'extra' && (
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: hito.calculada ? 'default' : 'pointer' }}>
                        <input 
                          type="checkbox"
                          checked={hito.alojamiento}
                          disabled={hito.calculada}
                          onChange={(e) => updateHitoRow(idx, 'alojamiento', e.target.checked)}
                        /> Alojamiento
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: hito.calculada ? 'default' : 'pointer' }}>
                        <input 
                          type="checkbox"
                          checked={hito.feriado}
                          disabled={hito.calculada}
                          onChange={(e) => updateHitoRow(idx, 'feriado', e.target.checked)}
                        /> Feriado
                      </label>
                    </div>
                  )}
                  {hito.tipo === 'viaje' && <span style={{ color: 'var(--text-muted)' }}>Fuera de jornada (50%)</span>}
                </td>
                <td style={{ padding: '10px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                    <button
                      onClick={() => handleCalcularRow(idx)}
                      disabled={hito.calculada}
                      className={hito.calculada ? "btn btn-success" : "btn btn-primary"}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: hito.calculada ? 'default' : 'pointer',
                        fontSize: '0.85rem'
                      }}
                      title={hito.calculada ? "Calculado con éxito" : "Verificar y Calcular Hito"}
                    >
                      <i className={hito.calculada ? "fa fa-check" : "fa fa-calculator"}></i> {hito.calculada ? 'Listo' : 'Calcular'}
                    </button>
                    <button
                      onClick={() => removeHitoRow(idx)}
                      className="btn btn-danger"
                      style={{
                        padding: '6px 12px',
                        borderRadius: '4px',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                      title="Eliminar Hito"
                    >
                      <i className="fa fa-trash-can"></i>
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {hitos.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                  Aún no hay hitos registrados en la rendición. Pulse el botón inferior para añadir uno.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          <button 
            onClick={addHitoRow}
            className="btn btn-secondary"
            style={{ padding: '10px 20px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '600' }}
          >
            <i className="fa fa-plus-circle"></i> Agregar Fila de Hito
          </button>
        </div>
      </section>

      {/* SECCIÓN 3: RESUMEN DE TIEMPOS Y TOTALES */}
      <section className="card" style={{ padding: '20px', marginBottom: '24px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '750', margin: '0 0 16px 0', color: 'var(--text)' }}>
          Resumen de Tiempos Calculados
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th style={{ padding: '10px' }}>Concepto</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Factor Asignado</th>
                <th style={{ padding: '10px', textAlign: 'center' }}>Cantidad Real</th>
                <th style={{ padding: '10px', textAlign: 'right' }}>Equivalente Horas Ajustadas</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                <td style={{ padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa fa-bed" style={{ color: '#8e44ad' }}></i> Alojamiento
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                  <span className="factor-badge" style={{ background: '#8e44ad', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>
                    {factores.alojamiento} hrs/día
                  </span>
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                  {resumen.alojamiento.real} {resumen.alojamiento.real === 1 ? 'día' : 'días'}
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '600' }}>
                  {resumen.alojamiento.ajustado.toFixed(2)} hrs
                </td>
              </tr>

              <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                <td style={{ padding: '12px 10px' }}>
                  <i className="fa fa-calendar-check" style={{ color: '#e67e22', marginRight: '8px' }}></i> Feriados y Domingos
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                  <span className="factor-badge" style={{ background: '#e67e22', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>
                    {(factores.feriado * 100).toFixed(0)}%
                  </span>
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                  {resumen.feriado.real.toFixed(2)} hrs
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '600' }}>
                  {resumen.feriado.ajustado.toFixed(2)} hrs
                </td>
              </tr>

              <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                <td style={{ padding: '12px 10px' }}>
                  <i className="fa fa-clock" style={{ color: '#2ecc71', marginRight: '8px' }}></i> Horas Extras (Lunes a Sábado)
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                  <span className="factor-badge" style={{ background: '#2ecc71', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>
                    {(factores.extras * 100).toFixed(0)}%
                  </span>
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                  {resumen.extras.real.toFixed(2)} hrs
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '600' }}>
                  {resumen.extras.ajustado.toFixed(2)} hrs
                </td>
              </tr>

              <tr style={{ borderBottom: '2px solid var(--card-border)' }}>
                <td style={{ padding: '12px 10px' }}>
                  <i className="fa fa-car" style={{ color: '#3498db', marginRight: '8px' }}></i> Viajes
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                  <span className="factor-badge" style={{ background: '#3498db', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: '600' }}>
                    {(factores.viaje * 100).toFixed(0)}%
                  </span>
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                  {resumen.viaje.real.toFixed(2)} hrs
                </td>
                <td style={{ padding: '12px 10px', textAlign: 'right', fontWeight: '600' }}>
                  {resumen.viaje.ajustado.toFixed(2)} hrs
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ fontSize: '1rem', fontWeight: '800', background: 'rgba(255,255,255,0.02)' }}>
                <td colSpan={2} style={{ padding: '16px 10px' }}>TOTALES DE RENDICIÓN</td>
                <td style={{ padding: '16px 10px', textAlign: 'center', borderTop: '2px solid var(--card-border)' }}>
                  {totalReal.toFixed(2)} hrs <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '400' }}>(real)</span>
                </td>
                <td style={{ padding: '16px 10px', textAlign: 'right', borderTop: '2px solid var(--card-border)', color: 'var(--accent)' }}>
                  {totalAjus.toFixed(2)} hrs <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '400' }}>(abonables)</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* ACCIONES FINALES */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '16px', marginTop: '24px' }}>
        <button 
          onClick={limpiarFormulario}
          className="btn btn-danger"
          style={{ padding: '12px 24px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontWeight: '600' }}
        >
          <i className="fa fa-times"></i> Cancelar / Limpiar
        </button>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="btn btn-primary"
          style={{ padding: '12px 30px', background: 'var(--accent)', color: '#fff', borderRadius: '6px', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: '600', opacity: saving ? 0.7 : 1, display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          {saving ? (
            <>
              <i className="fa fa-spinner fa-spin"></i> Procesando...
            </>
          ) : (
            <>
              <i className="fa fa-save"></i> Guardar y Enviar Rendición
            </>
          )}
        </button>
      </div>

    </div>
  )
}
