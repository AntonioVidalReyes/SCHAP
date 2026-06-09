import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

export default function Auditoria({ currentUser }) {
  const navigate = useNavigate()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  // Filter states
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [dateDesde, setDateDesde] = useState('')
  const [dateHasta, setDateHasta] = useState('')

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(15)

  const loadAuditLogs = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const res = await api.get('/api/admin/audit-logs')
      const data = await res.json()
      if (res.ok) {
        setLogs(data.logs || [])
      } else {
        setErrorMsg(data.error || 'No se pudieron cargar los registros de auditoría.')
      }
    } catch (err) {
      setErrorMsg('Error de red al conectar con el servidor.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (currentUser?.role === 'superusuario') {
      loadAuditLogs()
    }
  }, [currentUser])

  if (currentUser?.role !== 'superusuario') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--danger)' }}>
        <h2>Acceso Denegado</h2>
        <p>Solo el Superusuario de emergencia puede ingresar a esta sección de auditoría general.</p>
      </div>
    )
  }

  // Format Date helper
  const formatDateStr = (val) => {
    if (!val) return '-'
    try {
      const t = new Date(val)
      if (isNaN(t.getTime())) return val
      const d = String(t.getDate()).padStart(2, '0')
      const m = String(t.getMonth() + 1).padStart(2, '0')
      const y = t.getFullYear()
      const h = String(t.getHours()).padStart(2, '0')
      const min = String(t.getMinutes()).padStart(2, '0')
      const sec = String(t.getSeconds()).padStart(2, '0')
      return `${d}-${m}-${y} ${h}:${min}:${sec}`
    } catch {
      return val
    }
  }

  // Type Badges style helpers
  const getTypeBadgeStyle = (type) => {
    const t = type.toLowerCase()
    let bg = 'rgba(245, 158, 11, 0.15)'
    let col = '#f59e0b'
    if (t === 'notificación') {
      bg = 'rgba(16, 185, 129, 0.15)'
      col = '#10b981'
    } else if (t === 'abono') {
      bg = 'rgba(56, 189, 248, 0.15)'
      col = '#38bdf8'
    } else if (t === 'rendición') {
      bg = 'rgba(99, 102, 241, 0.15)'
      col = '#6366f1'
    }
    return {
      padding: '4px 10px',
      borderRadius: '12px',
      fontSize: '0.75rem',
      fontWeight: '700',
      textTransform: 'uppercase',
      background: bg,
      color: col,
      display: 'inline-block'
    }
  }

  // Status indicator colors
  const getStatusColor = (status, type) => {
    if (type.toLowerCase() === 'abono') return 'var(--text-muted)'
    const s = (status || '').toLowerCase()
    if (s.startsWith('pendiente')) return '#f1c40f' // yellow
    if (s.startsWith('aprobado') || s.startsWith('finaliz')) return '#10b981' // green
    if (s.startsWith('rechaz')) return '#ef4444' // red
    return 'var(--text-muted)' // gray
  }

  const formatStatusText = (status, type) => {
    if (type.toLowerCase() === 'abono') return 'Informativa'
    const s = (status || '').toLowerCase()
    const map = {
      pendiente: 'Pendiente',
      pendiente_jefe: 'Pendiente Jefe',
      pendiente_admin: 'Pendiente Admin',
      aprobado: 'Aprobada',
      aprobado_jefe: 'Aprobada Jefe',
      aprobado_admin: 'Aprobada Admin',
      rechazado: 'Rechazada',
      rechazado_jefe: 'Rechazada Jefe',
      rechazado_admin: 'Rechazada Admin',
      rechazada: 'Rechazada',
      finalizada: 'Finalizada',
      informativa: 'Informativa'
    }
    return map[s] || status
  }

  // Filtering Logic
  const getFilteredLogs = () => {
    return logs.filter(item => {
      // Text Search Filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchUser = (item.user_name || '').toLowerCase().includes(query) || (item.user_email || '').toLowerCase().includes(query)
        const matchComment = (item.comment || '').toLowerCase().includes(query)
        const matchDetails = (item.details || '').toLowerCase().includes(query)
        const matchId = String(item.id).includes(query)
        const matchType = (item.type || '').toLowerCase().includes(query)
        if (!matchUser && !matchComment && !matchDetails && !matchId && !matchType) return false
      }

      // Type Filter
      if (filterType && item.type.toLowerCase() !== filterType.toLowerCase()) return false

      // Status Filter
      if (filterStatus) {
        const s = item.status.toLowerCase()
        const isAbono = item.type.toLowerCase() === 'abono'
        
        if (filterStatus === 'pendiente' && !s.startsWith('pendiente')) return false
        if (filterStatus === 'aprobado' && !s.startsWith('aprobado') && !s.startsWith('finaliz') && !isAbono) return false
        if (filterStatus === 'rechazado' && !s.startsWith('rechaz')) return false
        if (filterStatus === 'informativa' && s !== 'informativa' && !isAbono && s !== 'notificación') return false
      }

      // Date Range Filter
      if (dateDesde || dateHasta) {
        const itemDateStr = item.created_at || ''
        if (!itemDateStr) return false
        
        // Extract YYYY-MM-DD from itemDateStr (Format: DD-MM-YYYY HH:MM:SS or ISO)
        // Since created_at is converted to local format DD-MM-YYYY HH:MM:SS in backend:
        let itemDate = null
        if (itemDateStr.includes('-')) {
          const parts = itemDateStr.split(' ')[0].split('-')
          if (parts[0].length === 4) {
            // ISO: YYYY-MM-DD
            itemDate = new Date(itemDateStr)
          } else {
            // Local: DD-MM-YYYY
            itemDate = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`)
          }
        }
        
        if (itemDate) {
          if (dateDesde) {
            const desde = new Date(`${dateDesde}T00:00:00`)
            if (itemDate < desde) return false
          }
          if (dateHasta) {
            const hasta = new Date(`${dateHasta}T23:59:59`)
            if (itemDate > hasta) return false
          }
        }
      }

      return true
    })
  }

  const filteredLogs = getFilteredLogs()
  const totalLogs = filteredLogs.length
  const totalPages = Math.ceil(totalLogs / rowsPerPage) || 1
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  return (
    <div className="page-container">
      
      {/* Title Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <i className="fa fa-shield-halved" style={{ color: 'var(--accent)' }}></i> Auditoría General de Solicitudes
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Bitácora unificada de auditoría. Monitoree de forma cronológica los permisos, notificaciones, abonos y rendiciones de todos los usuarios registrados.
        </p>
      </div>

      {errorMsg && (
        <div style={{
          background: 'rgba(220, 38, 38, 0.1)',
          borderLeft: '4px solid var(--danger)',
          color: 'var(--danger)',
          padding: '12px',
          borderRadius: '4px',
          fontSize: '0.88rem',
          marginBottom: '20px',
          fontWeight: '600'
        }}>
          {errorMsg}
        </div>
      )}

      {/* Filters Area */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius)',
        padding: '20px',
        boxShadow: 'var(--shadow)',
        marginBottom: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          
          {/* Search bar */}
          <div style={{ flex: 2, minWidth: '250px', position: 'relative' }}>
            <input
              type="text"
              placeholder="Buscar por Colaborador, ID, detalle, proyecto..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              style={{
                width: '100%',
                padding: '10px 14px 10px 36px',
                borderRadius: '8px',
                border: '1px solid var(--input-border)',
                color: 'var(--text)',
                background: 'var(--input-bg)',
                boxSizing: 'border-box'
              }}
            />
            <i className="fa fa-search" style={{ position: 'absolute', left: '12px', top: '13px', color: 'var(--text-muted)' }}></i>
          </div>

          {/* Type Filter */}
          <div style={{ flex: 1, minWidth: '150px' }}>
            <select
              value={filterType}
              onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
            >
              <option value="">Todos los tipos</option>
              <option value="Permiso">Permiso</option>
              <option value="Notificación">Notificación</option>
              <option value="Abono">Abono</option>
              <option value="Rendición">Rendición</option>
            </select>
          </div>

          {/* Status Filter */}
          <div style={{ flex: 1, minWidth: '150px' }}>
            <select
              value={filterStatus}
              onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
            >
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendientes</option>
              <option value="aprobado">Aprobadas / Finalizadas</option>
              <option value="rechazado">Rechazadas</option>
              <option value="informativa">Informativas</option>
            </select>
          </div>
        </div>

        {/* Date Filters Row */}
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Desde:</span>
            <input
              type="date"
              value={dateDesde}
              onChange={(e) => { setDateDesde(e.target.value); setCurrentPage(1); }}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Hasta:</span>
            <input
              type="date"
              value={dateHasta}
              onChange={(e) => { setDateHasta(e.target.value); setCurrentPage(1); }}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
            />
          </div>

          <button
            onClick={() => {
              setSearchQuery('')
              setFilterType('')
              setFilterStatus('')
              setDateDesde('')
              setDateHasta('')
              setCurrentPage(1)
            }}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <i className="fa fa-arrow-rotate-left"></i> Limpiar Filtros
          </button>
        </div>
      </div>

      {/* Grid view showing stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {[
          { label: 'Total de Registros', count: totalLogs, icon: 'fa-list', color: 'var(--accent)' },
          { label: 'Pendientes de Revisión', count: logs.filter(l => l.status.toLowerCase().startsWith('pendiente')).length, icon: 'fa-clock', color: '#f1c40f' },
          { label: 'Aprobadas / Finalizadas', count: logs.filter(l => l.status.toLowerCase().startsWith('aprob') || l.status.toLowerCase().startsWith('finaliz')).length, icon: 'fa-check-double', color: '#10b981' }
        ].map((stat, i) => (
          <div key={i} style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 'var(--radius)', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: 'var(--shadow)' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: stat.color, fontSize: '1.2rem' }}>
              <i className={`fa ${stat.icon}`}></i>
            </div>
            <div>
              <p style={{ margin: '0 0 4px 0', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '600' }}>{stat.label}</p>
              <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '800' }}>{stat.count}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Table Container */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa fa-spinner fa-spin fa-2x" style={{ marginBottom: '12px', color: 'var(--accent)' }}></i>
            <p style={{ margin: 0 }}>Cargando logs de auditoría...</p>
          </div>
        ) : totalLogs === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="fa fa-inbox fa-2x" style={{ marginBottom: '12px' }}></i>
            <p style={{ margin: 0 }}>No se encontraron registros que coincidan con los filtros aplicados.</p>
          </div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: 'rgba(255, 255, 255, 0.02)', borderBottom: '2px solid var(--card-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '14px 16px', width: '80px' }}>ID</th>
                  <th style={{ padding: '14px 16px' }}>Colaborador</th>
                  <th style={{ padding: '14px 16px' }}>Tipo</th>
                  <th style={{ padding: '14px 16px' }}>Horas</th>
                  <th style={{ padding: '14px 16px' }}>Fecha Creación</th>
                  <th style={{ padding: '14px 16px' }}>Estado</th>
                  <th style={{ padding: '14px 16px' }}>Detalles / Glosa</th>
                  <th style={{ padding: '14px 16px', textAlign: 'center', width: '90px' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.map((log) => (
                  <tr key={`${log.type}-${log.id}`} style={{ borderBottom: '1px solid var(--card-border)' }}>
                    <td style={{ padding: '14px 16px', fontWeight: '600' }}>#{log.id}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: '600' }}>{log.user_name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{log.user_email}</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={getTypeBadgeStyle(log.type)}>{log.type}</span>
                    </td>
                    <td style={{ padding: '14px 16px', fontWeight: 'bold' }}>{log.hours.toFixed(2)} h</td>
                    <td style={{ padding: '14px 16px' }}>{formatDateStr(log.created_at)}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: '600', color: getStatusColor(log.status, log.type) }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: getStatusColor(log.status, log.type), display: 'inline-block' }}></span>
                        {formatStatusText(log.status, log.type)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.details}>
                      {log.details}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <button
                        onClick={() => navigate(log.target_url)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          padding: '6px 12px',
                          fontSize: '1.1rem'
                        }}
                        title="Ver solicitud a detalle"
                      >
                        <i className="fa fa-eye"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '16px 20px',
                background: 'rgba(255, 255, 255, 0.01)',
                borderTop: '1px solid var(--card-border)',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Mostrando {Math.min(totalLogs, (currentPage - 1) * rowsPerPage + 1)} al {Math.min(totalLogs, currentPage * rowsPerPage)} de {totalLogs} resultados
                </div>
                
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  
                  {/* Select rows per page */}
                  <select
                    value={rowsPerPage}
                    onChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setCurrentPage(1); }}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px solid var(--input-border)',
                      background: 'var(--input-bg)',
                      color: 'var(--text)',
                      fontSize: '0.8rem',
                      marginRight: '12px'
                    }}
                  >
                    <option value={15}>15 filas</option>
                    <option value={30}>30 filas</option>
                    <option value={50}>50 filas</option>
                  </select>

                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    style={{ padding: '6px 10px', background: 'var(--card-border)', border: 'none', color: 'var(--text)', borderRadius: '4px', cursor: 'pointer', opacity: currentPage === 1 ? 0.4 : 1 }}
                  >
                    «
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    style={{ padding: '6px 10px', background: 'var(--card-border)', border: 'none', color: 'var(--text)', borderRadius: '4px', cursor: 'pointer', opacity: currentPage === 1 ? 0.4 : 1 }}
                  >
                    ‹
                  </button>
                  
                  <span style={{ padding: '6px 12px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                    Página {currentPage} de {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    style={{ padding: '6px 10px', background: 'var(--card-border)', border: 'none', color: 'var(--text)', borderRadius: '4px', cursor: 'pointer', opacity: currentPage === totalPages ? 0.4 : 1 }}
                  >
                    ›
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    style={{ padding: '6px 10px', background: 'var(--card-border)', border: 'none', color: 'var(--text)', borderRadius: '4px', cursor: 'pointer', opacity: currentPage === totalPages ? 0.4 : 1 }}
                  >
                    »
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

    </div>
  )
}
