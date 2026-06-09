import React, { useState, useEffect } from 'react'
import api from '../api'

export default function Reportes({ currentUser }) {
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Search & Filters
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  // Report Date range
  const [dateDesde, setDateDesde] = useState('')
  const [dateHasta, setDateHasta] = useState('')
  const [generating, setGenerating] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    async function loadUsersData() {
      setLoading(true)
      try {
        const [usersRes, reqsRes] = await Promise.all([
          api.get('/api/users'),
          api.get('/api/requests?mine=0')
        ])

        if (!usersRes.ok) return

        const uData = await usersRes.json()
        let allUsers = (uData.users || []).filter(u => u.active === 1 || u.id === currentUser.id)

        // Filter users depending on role
        if (currentUser.role === 'trabajador') {
          allUsers = allUsers.filter(u => u.id === currentUser.id)
        } else if (currentUser.role === 'jefe') {
          allUsers = allUsers.filter(u => u.id === currentUser.id || u.boss_id === currentUser.id)
        }

        // Count pending requests
        const reqsData = reqsRes.ok ? await reqsRes.json() : { requests: [] }
        const requests = reqsData.requests || []
        const pendingCounts = {}
        
        requests.forEach(r => {
          if (['pendiente', 'pendiente_jefe', 'pendiente_admin'].includes(r.status)) {
            pendingCounts[r.user_id] = (pendingCounts[r.user_id] || 0) + 1
          }
        })

        setUsers(allUsers.map(u => ({
          ...u,
          solicitudes_pendientes: pendingCounts[u.id] || 0
        })))

        // Pre-select user if current user is trabajador
        if (currentUser.role === 'trabajador' && allUsers.length > 0) {
          setSelectedUser(allUsers[0])
        }

      } catch (err) {
        console.error("Error loading users for report:", err)
      } finally {
        setLoading(false)
      }
    }
    loadUsersData()
  }, [currentUser])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const getProcessedUsers = () => {
    let list = [...users]

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(u => 
        String(u.id).includes(q) ||
        (u.name || '').toLowerCase().includes(q) ||
        (u.email || '').toLowerCase().includes(q) ||
        (u.role || '').toLowerCase().includes(q)
      )
    }

    list.sort((a, b) => {
      let valA = a[sortField]
      let valB = b[sortField]

      if (sortField === 'id') {
        valA = parseInt(valA) || 0
        valB = parseInt(valB) || 0
      } else {
        valA = String(valA || '').toLowerCase()
        valB = String(valB || '').toLowerCase()
      }

      if (sortOrder === 'asc') {
        return valA > valB ? 1 : valA < valB ? -1 : 0
      } else {
        return valA < valB ? 1 : valA > valB ? -1 : 0
      }
    })

    return list
  }

  const handleSelectUser = (u) => {
    if (currentUser.role === 'trabajador') return // Cannot deselect yourself
    if (selectedUser && selectedUser.id === u.id) {
      setSelectedUser(null)
    } else {
      setSelectedUser(u)
    }
  }

  const handleGenerateReport = async (e) => {
    e.preventDefault()
    setErrorMsg('')
    
    if (!selectedUser) {
      setErrorMsg("Debe seleccionar un usuario.")
      return
    }

    if (!dateDesde || !dateHasta) {
      setErrorMsg("Debe seleccionar las fechas Desde y Hasta.")
      return
    }

    if (dateDesde > dateHasta) {
      setErrorMsg("La fecha Desde no puede ser posterior a la fecha Hasta.")
      return
    }

    setGenerating(true)
    try {
      const params = new URLSearchParams({
        user_id: selectedUser.id,
        desde: dateDesde,
        hasta: dateHasta
      })

      const res = await api.get(`/api/reportes/generar?${params.toString()}`)

      if (!res.ok) {
        const data = await res.json()
        setErrorMsg(data.error || "Error al generar el reporte.")
        setGenerating(false)
        return
      }

      // Download PDF Blob
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `reporte_${selectedUser.name.replace(/\s+/g, "_")}_${dateDesde}_${dateHasta}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)

    } catch (err) {
      setErrorMsg("Error de red al generar el reporte.")
    } finally {
      setGenerating(false)
    }
  }

  const processedUsers = getProcessedUsers()
  const totalItems = processedUsers.length
  const totalPages = Math.ceil(totalItems / limit) || 1
  const paginatedUsers = processedUsers.slice((page - 1) * limit, page * limit)

  return (
    <div className="page-container">
      
      {/* Title */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: '800' }}>
          Generador de Reportes PDF
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Seleccione un usuario y un rango de fechas para generar el reporte de horas en formato PDF.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '30px',
        alignItems: 'start'
      }}>
        
        {/* Left Side: Users Select list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 'var(--radius)',
            padding: '20px',
            boxShadow: 'var(--shadow)'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: '700' }}>
              1. Seleccione Colaborador
            </h3>
            
            {currentUser.role !== 'trabajador' && (
              <div style={{ marginBottom: '16px' }}>
                <input
                  type="text"
                  placeholder="Buscar colaborador..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando colaboradores...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '8px 10px' }}></th>
                    <th onClick={() => handleSort('name')} style={{ padding: '8px 10px', cursor: 'pointer' }}>Nombre <i className="fa fa-sort"></i></th>
                    <th onClick={() => handleSort('role')} style={{ padding: '8px 10px', cursor: 'pointer' }}>Rol <i className="fa fa-sort"></i></th>
                    <th style={{ padding: '8px 10px' }}>Saldo (h)</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedUsers.map((u, idx) => {
                    const isSelected = selectedUser && selectedUser.id === u.id
                    const saldo = (u.bonus_hours || 0) - (u.used_hours || 0)
                    return (
                      <tr 
                        key={idx} 
                        onClick={() => handleSelectUser(u)}
                        style={{
                          borderBottom: '1px solid var(--card-border)',
                          cursor: currentUser.role === 'trabajador' ? 'default' : 'pointer',
                          background: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'transparent'
                        }}
                      >
                        <td style={{ padding: '8px 10px' }}>
                          <input 
                            type="checkbox" 
                            checked={isSelected || false} 
                            disabled={currentUser.role === 'trabajador'}
                            onChange={() => handleSelectUser(u)}
                          />
                        </td>
                        <td style={{ padding: '8px 10px', fontWeight: '600' }}>{u.name}</td>
                        <td style={{ padding: '8px 10px', textTransform: 'capitalize' }}>{u.role}</td>
                        <td style={{ padding: '8px 10px', fontWeight: 'bold', color: saldo < 0 ? 'var(--danger)' : 'var(--text)' }}>
                          {saldo.toFixed(1)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '16px' }}>
                <button disabled={page === 1} onClick={() => setPage(1)} style={{ padding: '4px 8px', background: 'var(--card-border)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>«</button>
                <button disabled={page === 1} onClick={() => setPage(page - 1)} style={{ padding: '4px 8px', background: 'var(--card-border)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{"<"}</button>
                <span style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Pág {page} de {totalPages}</span>
                <button disabled={page === totalPages} onClick={() => setPage(page + 1)} style={{ padding: '4px 8px', background: 'var(--card-border)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>{">"}</button>
                <button disabled={page === totalPages} onClick={() => setPage(totalPages)} style={{ padding: '4px 8px', background: 'var(--card-border)', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>»</button>
              </div>
            )}

          </div>

        </div>

        {/* Right Side: Date picking and Generation controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: 'var(--radius)',
            padding: '24px',
            boxShadow: 'var(--shadow)'
          }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1.1rem', fontWeight: '700' }}>
              2. Configurar Rango de Fechas
            </h3>

            {errorMsg && (
              <div style={{ background: 'rgba(220, 38, 38, 0.1)', borderLeft: '4px solid var(--danger)', color: 'var(--danger)', padding: '12px', borderRadius: '4px', fontSize: '0.88rem', marginBottom: '20px' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleGenerateReport}>
              
              {/* Selected User Summary info */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--card-border)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '20px',
                fontSize: '0.88rem'
              }}>
                <p style={{ margin: '0 0 6px 0' }}><strong>Colaborador Seleccionado:</strong></p>
                <p style={{ margin: '0 0 4px 0' }}>Nombre: {selectedUser?.name || '-'}</p>
                <p style={{ margin: '0 0 4px 0' }}>Email: {selectedUser?.email || '-'}</p>
                <p style={{ margin: 0 }}>Rol: {selectedUser?.role || '-'}</p>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '24px'
              }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Desde:</label>
                  <input
                    type="date"
                    value={dateDesde}
                    onChange={(e) => setDateDesde(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>Hasta:</label>
                  <input
                    type="date"
                    value={dateHasta}
                    onChange={(e) => setDateHasta(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)', boxSizing: 'border-box' }}
                    required
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={!selectedUser || generating}
                style={{
                  width: '100%',
                  background: (!selectedUser || generating) ? 'var(--card-border)' : 'var(--accent)',
                  color: (!selectedUser || generating) ? 'var(--text-muted)' : '#fff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '8px',
                  fontWeight: '600',
                  cursor: (!selectedUser || generating) ? 'not-allowed' : 'pointer'
                }}
              >
                {generating ? (
                  <span><i className="fa fa-spinner fa-spin"></i> Generando PDF...</span>
                ) : (
                  <span><i className="fa fa-file-pdf"></i> Descargar Reporte</span>
                )}
              </button>

            </form>
          </div>

        </div>

      </div>

    </div>
  )
}
