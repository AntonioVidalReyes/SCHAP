import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Calendario({ currentUser }) {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState('month') // 'month', 'week'
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState([])
  const [schedule, setSchedule] = useState(null)
  
  // Modal state
  const [selectedEvent, setSelectedEvent] = useState(null)

  useEffect(() => {
    async function loadData() {
      try {
        const [reqRes, schedRes] = await Promise.all([
          api.get('/api/requests?calendar=1'), // Load all requests for team visibility
          api.get('/api/config/schedule')
        ])

        if (reqRes.ok) {
          const reqData = await reqRes.ok ? await reqRes.json() : { requests: [] }
          setEvents(reqData.requests || [])
        }
        if (schedRes.ok) {
          const schedData = await schedRes.json()
          setSchedule(schedData.schedule)
        }
      } catch (err) {
        console.error("Error loading calendar events:", err)
      }
    }
    loadData()
  }, [])

  // Month navigation helpers
  const prevPeriod = () => {
    const nextDate = new Date(currentDate)
    if (viewMode === 'month') {
      nextDate.setMonth(nextDate.getMonth() - 1)
    } else if (viewMode === 'week') {
      nextDate.setDate(nextDate.getDate() - 7)
    } else {
      nextDate.setDate(nextDate.getDate() - 1)
    }
    setCurrentDate(nextDate)
  }

  const nextPeriod = () => {
    const nextDate = new Date(currentDate)
    if (viewMode === 'month') {
      nextDate.setMonth(nextDate.getMonth() + 1)
    } else if (viewMode === 'week') {
      nextDate.setDate(nextDate.getDate() + 7)
    } else {
      nextDate.setDate(nextDate.getDate() + 1)
    }
    setCurrentDate(nextDate)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const getPeriodLabel = () => {
    if (viewMode === 'month') {
      return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    } else if (viewMode === 'week') {
      const start = new Date(currentDate)
      const day = start.getDay()
      const diff = start.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(start.setDate(diff))
      const sunday = new Date(start.setDate(diff + 6))
      
      if (monday.getMonth() === sunday.getMonth()) {
        return `${monday.getDate()} - ${sunday.getDate()} de ${monthNames[monday.getMonth()]} ${monday.getFullYear()}`
      } else if (monday.getFullYear() === sunday.getFullYear()) {
        return `${monday.getDate()} de ${monthNames[monday.getMonth()]} - ${sunday.getDate()} de ${monthNames[sunday.getMonth()]} ${monday.getFullYear()}`
      } else {
        return `${monday.getDate()} de ${monthNames[monday.getMonth()]} ${monday.getFullYear()} - ${sunday.getDate()} de ${monthNames[sunday.getMonth()]} ${sunday.getFullYear()}`
      }
    } else {
      return `${currentDate.getDate()} de ${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`
    }
  }

  // Render Month View
  const renderMonthDays = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()

    const firstDayIndex = new Date(year, month, 1).getDay() // 0 = Sunday, 1 = Monday...
    const adjustedFirstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1 // Shift so Monday is index 0

    const totalDays = new Date(year, month + 1, 0).getDate()

    const days = []
    
    // Previous month filler days
    const prevMonthDays = new Date(year, month, 0).getDate()
    for (let i = adjustedFirstDayIndex - 1; i >= 0; i--) {
      days.push({
        day: prevMonthDays - i,
        isCurrentMonth: false,
        date: new Date(year, month - 1, prevMonthDays - i)
      })
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      days.push({
        day: i,
        isCurrentMonth: true,
        date: new Date(year, month, i)
      })
    }

    // Next month filler days to complete grid (multiples of 7)
    const totalCells = Math.ceil(days.length / 7) * 7
    const nextMonthDays = totalCells - days.length
    for (let i = 1; i <= nextMonthDays; i++) {
      days.push({
        day: i,
        isCurrentMonth: false,
        date: new Date(year, month + 1, i)
      })
    }

    return days
  }

  // Find events for a specific date
  const getEventsForDate = (dateObj) => {
    const dateStr = dateObj.toISOString().split('T')[0]
    return events.filter(e => {
      if (e.type === 'Abono') return false
      const eDate = e.date || e.created_at || ''
      return eDate.startsWith(dateStr)
    })
  }

  // Get status class for color coding
  const getEventColor = (e) => {
    const status = e.status || ''
    const type = e.type || ''

    if (type.toLowerCase() === 'notificación' || status === 'informativa') {
      return '#3498db' // blue
    }
    if (status === 'pendiente' || status === 'pendiente_jefe') {
      return '#f1c40f' // yellow
    }
    if (status.startsWith('rechaz')) {
      return '#ef4444' // red
    }
    return '#10b981' // green
  }

  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

  const renderMonthView = () => {
    return (
      <>
        {/* Days of the week header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          background: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid var(--card-border)',
          textAlign: 'center',
          fontWeight: '700',
          fontSize: '0.85rem',
          padding: '12px 0',
          color: 'var(--text-muted)'
        }}>
          <div>Lun</div>
          <div>Mar</div>
          <div>Mié</div>
          <div>Jue</div>
          <div>Vie</div>
          <div>Sáb</div>
          <div>Dom</div>
        </div>

        {/* Calendar days grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridTemplateRows: `repeat(${renderMonthDays().length / 7}, 1fr)`,
          height: 'calc(100vh - 340px)',
          minHeight: '480px',
          maxHeight: '650px'
        }}>
          {renderMonthDays().map((cell, idx) => {
            const cellEvents = getEventsForDate(cell.date)
            const isToday = new Date().toDateString() === cell.date.toDateString()
            
            // Check if day is weekend
            const dayOfWeek = cell.date.getDay()
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

            return (
              <div 
                key={idx} 
                style={{
                  borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--card-border)' : 'none',
                  borderBottom: '1px solid var(--card-border)',
                  padding: '8px',
                  background: isToday 
                    ? 'rgba(37, 99, 235, 0.05)' 
                    : (isWeekend ? 'rgba(255, 255, 255, 0.01)' : 'transparent'),
                  opacity: cell.isCurrentMonth ? 1 : 0.4,
                  height: '100%',
                  minHeight: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  boxSizing: 'border-box',
                  overflow: 'hidden'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '6px',
                  fontSize: '0.85rem',
                  fontWeight: isToday ? 'bold' : 'normal'
                }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: isToday ? '24px' : 'auto',
                    height: isToday ? '24px' : 'auto',
                    background: isToday ? 'var(--accent)' : 'transparent',
                    color: isToday ? '#fff' : 'var(--text)',
                    borderRadius: '50%'
                  }}>
                    {cell.day}
                  </span>
                </div>

                {/* Date Events list */}
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: '4px',
                  overflowY: 'auto',
                  flex: 1,
                  paddingRight: '2px',
                  scrollbarWidth: 'thin'
                }}>
                  {cellEvents.map((evt, eIdx) => {
                    const bgColor = getEventColor(evt)
                    return (
                      <div
                        key={eIdx}
                        onClick={() => setSelectedEvent(evt)}
                        style={{
                          background: bgColor,
                          color: (bgColor === '#f1c40f') ? '#1e293b' : '#ffffff',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                        }}
                        title={`${evt.user_name || 'Usuario'} - ${evt.comment || 'Permiso'}`}
                      >
                        {evt.user_name?.split(' ')[0]}: {evt.comment || 'Permiso'}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </>
    )
  }

  const renderWeekView = () => {
    const start = new Date(currentDate)
    const day = start.getDay()
    const diff = start.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(start.setDate(diff))

    const weekDays = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday)
      d.setDate(monday.getDate() + i)
      weekDays.push(d)
    }

    const dayLabels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

    return (
      <div>
        {/* Week Columns Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          background: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid var(--card-border)',
          textAlign: 'center',
          fontWeight: '700',
          fontSize: '0.85rem',
          padding: '12px 0',
          color: 'var(--text-muted)'
        }}>
          {weekDays.map((dateObj, i) => {
            const isToday = new Date().toDateString() === dateObj.toDateString()
            return (
              <div key={i} style={{ color: isToday ? 'var(--accent)' : 'inherit' }}>
                {dayLabels[i]} {dateObj.getDate()}
              </div>
            )
          })}
        </div>

        {/* Week Cells */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          minHeight: '300px'
        }}>
          {weekDays.map((dateObj, i) => {
            const cellEvents = getEventsForDate(dateObj)
            const isToday = new Date().toDateString() === dateObj.toDateString()
            const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6

            return (
              <div 
                key={i} 
                style={{
                  borderRight: i < 6 ? '1px solid var(--card-border)' : 'none',
                  padding: '12px 8px',
                  background: isToday 
                    ? 'rgba(37, 99, 235, 0.05)' 
                    : (isWeekend ? 'rgba(255, 255, 255, 0.01)' : 'transparent'),
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                {/* Events list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {cellEvents.length === 0 ? (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', marginTop: '20px' }}>Sin eventos</span>
                  ) : (
                    cellEvents.map((evt, eIdx) => {
                      const bgColor = getEventColor(evt)
                      return (
                        <div
                          key={eIdx}
                          onClick={() => setSelectedEvent(evt)}
                          style={{
                            background: bgColor,
                            color: (bgColor === '#f1c40f') ? '#1e293b' : '#ffffff',
                            padding: '6px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                          }}
                          title={`${evt.user_name || 'Usuario'} - ${evt.comment || 'Permiso'}`}
                        >
                          <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{evt.user_name?.split(' ')[0]}</div>
                          <div style={{ fontSize: '0.7rem', opacity: 0.9 }}>{evt.comment || 'Permiso'}</div>
                          {evt.from_time && evt.to_time && (
                            <div style={{ fontSize: '0.65rem', marginTop: '2px', opacity: 0.8 }}>
                              <i className="fa fa-clock"></i> {evt.from_time} - {evt.to_time} ({evt.hours}h)
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const renderDayView = () => {
    const cellEvents = getEventsForDate(currentDate)
    const dayLabelsFull = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]

    return (
      <div style={{ padding: '20px' }}>
        <h4 style={{ margin: '0 0 16px 0', fontSize: '1rem', fontWeight: '700', color: 'var(--text-muted)' }}>
          {dayLabelsFull[currentDate.getDay()]}, {currentDate.getDate()} de {monthNames[currentDate.getMonth()]}
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {cellEvents.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--card-border)', borderRadius: '8px', color: 'var(--text-muted)' }}>
              No hay solicitudes ni notificaciones para este día.
            </div>
          ) : (
            cellEvents.map((evt, eIdx) => {
              const bgColor = getEventColor(evt)
              return (
                <div
                  key={eIdx}
                  onClick={() => setSelectedEvent(evt)}
                  style={{
                    borderLeft: `4px solid ${bgColor}`,
                    background: 'rgba(255, 255, 255, 0.02)',
                    padding: '16px',
                    borderRadius: '0 8px 8px 0',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '16px',
                    transition: 'background 0.2s',
                    boxShadow: 'var(--shadow)'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: '700', fontSize: '1rem' }}>{evt.user_name}</span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        background: bgColor + '20',
                        color: bgColor === '#f1c40f' ? '#e2b100' : bgColor
                      }}>{evt.type || 'Permiso'}</span>
                    </div>
                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{evt.comment || '(Sin comentario)'}</p>
                  </div>

                  <div style={{ textAlign: 'right', minWidth: '100px' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text)' }}>{evt.hours} h</div>
                    {evt.from_time && evt.to_time && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {evt.from_time} - {evt.to_time}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }


  return (
    <div className="page-container">
      
      {/* Calendar Legend */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '12px 20px',
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius)',
        marginBottom: '20px',
        flexWrap: 'wrap',
        fontSize: '0.85rem'
      }}>
        <strong style={{ color: 'var(--text)' }}>Leyenda:</strong>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#3498db', display: 'inline-block' }}></span>
            <span>Notificación</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#f1c40f', display: 'inline-block' }}></span>
            <span>Pendiente</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#10b981', display: 'inline-block' }}></span>
            <span>Aprobado</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: '#ef4444', display: 'inline-block' }}></span>
            <span>Rechazado</span>
          </div>
        </div>
      </div>

      {/* Header controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn" onClick={prevPeriod} style={{ padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '6px', color: 'var(--text)', cursor: 'pointer' }}>
            <i className="fa fa-chevron-left"></i>
          </button>
          <button className="btn" onClick={nextPeriod} style={{ padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '6px', color: 'var(--text)', cursor: 'pointer' }}>
            <i className="fa fa-chevron-right"></i>
          </button>
          <button className="btn" onClick={goToToday} style={{ padding: '8px 16px', background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: '6px', color: 'var(--text)', cursor: 'pointer', fontWeight: '500' }}>
            Hoy
          </button>
        </div>

        <h2 style={{ fontSize: '1.4rem', fontWeight: '800', margin: 0 }}>
          {getPeriodLabel()}
        </h2>

        <div style={{ display: 'flex', gap: '4px', background: 'var(--card-border)', padding: '2px', borderRadius: '8px' }}>
          {[
            { key: 'month', label: 'Mes' },
            { key: 'week', label: 'Semana' },
            { key: 'day', label: 'Día' }
          ].map(mode => (
            <button
              key={mode.key}
              onClick={() => setViewMode(mode.key)}
              style={{
                padding: '6px 12px',
                background: viewMode === mode.key ? 'var(--accent)' : 'none',
                border: 'none',
                borderRadius: '6px',
                color: viewMode === mode.key ? '#fff' : 'var(--text-muted)',
                fontSize: '0.82rem',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar shell */}
      <div className="calendar-shell" style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        overflow: 'hidden'
      }}>
        {viewMode === 'month' && renderMonthView()}
        {viewMode === 'week' && renderWeekView()}
        {viewMode === 'day' && renderDayView()}
      </div>

      {/* EVENT DETAIL POPUP MODAL */}
      {selectedEvent && (
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
            maxWidth: '450px',
            width: '90%',
            boxShadow: 'var(--shadow-lg)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--card-border)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', margin: 0, color: 'var(--text)' }}>
                {selectedEvent.type || 'Permiso'}
              </h3>
              <button 
                onClick={() => setSelectedEvent(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.9rem', color: 'var(--text)' }}>
              <div><strong>Usuario:</strong> {selectedEvent.user_name || '-'}</div>
              <div><strong>Fecha de Solicitud:</strong> {selectedEvent.date ? new Date(selectedEvent.date).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) : '-'}</div>
              <div><strong>Duración:</strong> {selectedEvent.hours} horas</div>
              {selectedEvent.from_time && selectedEvent.to_time && (
                <div><strong>Horario:</strong> {selectedEvent.from_time} - {selectedEvent.to_time}</div>
              )}
              <div>
                <strong>Estado:</strong>{' '}
                <span style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 'bold',
                  background: getEventColor(selectedEvent),
                  color: getEventColor(selectedEvent) === '#f1c40f' ? '#1e293b' : '#fff'
                }}>
                  {selectedEvent.status}
                </span>
              </div>
              <div style={{ borderTop: '1px solid var(--card-border)', paddingTop: '12px', marginTop: '4px' }}>
                <strong>Comentario:</strong>
                <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                  {selectedEvent.comment || '(Sin comentario)'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px', borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => { setSelectedEvent(null); navigate(`/solicitudes/${selectedEvent.id}`); }}
                style={{ padding: '8px 16px', background: 'var(--card-border)', color: 'var(--text)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
              >
                Ver detalles
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => setSelectedEvent(null)}
                style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
