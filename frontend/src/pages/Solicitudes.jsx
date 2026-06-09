import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api'

const truncate = (str, len = 30) => {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

export default function Solicitudes({ currentUser }) {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('mine') // 'mine', 'pending', 'reviewed'
  const [loading, setLoading] = useState(true)
  
  // Data
  const [mineList, setMineList] = useState([])
  const [pendingList, setPendingList] = useState([])
  const [reviewedList, setReviewedList] = useState([])

  // Filters & Pagination
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortField, setSortField] = useState('id')
  const [sortOrder, setSortOrder] = useState('desc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  const isBossOrAdmin = currentUser?.role === 'jefe' || currentUser?.role === 'administrador' || currentUser?.role === 'superusuario'

  const loadData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'mine') {
        const [reqRes, rendRes] = await Promise.all([
          api.get('/api/requests?mine=1'),
          api.get('/api/rendiciones?mine=1')
        ])

        const reqs = reqRes.ok ? (await reqRes.json()).requests || [] : []
        const rends = rendRes.ok ? (await rendRes.json()).rendiciones || [] : []

        const merged = [
          ...reqs.map(r => ({ ...r, category: r.type || 'Permiso' })),
          ...rends.map(r => ({ ...r, category: 'Rendición', date: r.created_at, hours: r.total_horas }))
        ]
        setMineList(merged)
      } else if (activeTab === 'pending' && isBossOrAdmin) {
        const [reqRes, rendRes] = await Promise.all([
          api.get('/api/requests?pending=1'),
          api.get('/api/rendiciones?pending=1')
        ])

        const reqs = reqRes.ok ? (await reqRes.json()).requests || [] : []
        const rends = rendRes.ok ? (await rendRes.json()).rendiciones || [] : []

        // Filter actual pending statuses
        const pendingReqs = reqs.filter(r => r.status.startsWith('pendiente'))
        const pendingRends = rends.filter(r => r.status.startsWith('pendiente'))

        const merged = [
          ...pendingReqs.map(r => ({ ...r, category: r.type || 'Permiso' })),
          ...pendingRends.map(r => ({ ...r, category: 'Rendición', date: r.created_at, hours: r.total_horas }))
        ]
        setPendingList(merged)
      } else if (activeTab === 'reviewed' && isBossOrAdmin) {
        // Load non-pending requests and renditions
        const [reqRes, rendRes] = await Promise.all([
          api.get('/api/requests?mine=0'),
          api.get('/api/rendiciones?mine=0')
        ])

        const reqs = reqRes.ok ? (await reqRes.json()).requests || [] : []
        const rends = rendRes.ok ? (await rendRes.json()).rendiciones || [] : []

        const reviewedReqs = reqs.filter(r => !r.status.startsWith('pendiente') && r.type !== 'Abono')
        const reviewedRends = rends.filter(r => !r.status.startsWith('pendiente'))

        const merged = [
          ...reviewedReqs.map(r => ({ ...r, category: r.type || 'Permiso' })),
          ...reviewedRends.map(r => ({ ...r, category: 'Rendición', date: r.created_at, hours: r.total_horas }))
        ]
        setReviewedList(merged)
      }
    } catch (e) {
      console.error("Error loading requests lists:", e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    setPage(1) // Reset page on tab change
  }, [activeTab])

  // Get current active dataset
  const getActiveData = () => {
    if (activeTab === 'mine') return mineList
    if (activeTab === 'pending') return pendingList
    return reviewedList
  }

  // Filter and Sort
  const getProcessedData = () => {
    let list = [...getActiveData()]

    // Filter by type
    if (typeFilter) {
      list = list.filter(item => {
        if (typeFilter === 'Rendición') return item.category === 'Rendición'
        if (typeFilter === 'Notificación') return item.category.toLowerCase() === 'notificación'
        if (typeFilter === 'Permiso') return item.category.toLowerCase() === 'permiso'
        return true
      })
    }

    // Filter by Search string
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(item => 
        String(item.id).includes(q) ||
        (item.user_name || '').toLowerCase().includes(q) ||
        (item.comment || item.trabajo || '').toLowerCase().includes(q) ||
        (item.cliente || '').toLowerCase().includes(q) ||
        (item.proyecto || '').toLowerCase().includes(q)
      )
    }

    // Sort
    list.sort((a, b) => {
      let valA = a[sortField]
      let valB = b[sortField]

      if (sortField === 'id') {
        valA = parseInt(valA) || 0
        valB = parseInt(valB) || 0
      } else if (sortField === 'date' || sortField === 'created_at') {
        valA = new Date(valA || a.created_at || 0).getTime()
        valB = new Date(valB || b.created_at || 0).getTime()
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

  const handleSort = (field) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const formatFecha = (dateStr) => {
    if (!dateStr) return "-"
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return dateStr
      const dia = String(date.getDate()).padStart(2, "0")
      const mes = String(date.getMonth() + 1).padStart(2, "0")
      const año = date.getFullYear()
      const hora = String(date.getHours()).padStart(2, "0")
      const min = String(date.getMinutes()).padStart(2, "0")
      return `${dia}-${mes}-${año} ${hora}:${min}`
    } catch {
      return dateStr
    }
  }

  const formatEstado = (status, category) => {
    if (category === 'Abono') return "Informativa"
    const map = {
      pendiente: "Pendiente",
      pendiente_jefe: "Pendiente Jefe",
      pendiente_admin: "Pendiente Admin",
      aprobado: "Aprobada",
      aprobado_jefe: "Aprobada Jefe",
      aprobado_admin: "Aprobada Admin",
      rechazado: "Rechazada",
      rechazado_jefe: "Rechazada",
      rechazado_admin: "Rechazada",
      rechazada: "Rechazada",
      informativa: "Informativa"
    }
    return map[status] || status
  }

  const getStatusColor = (status, category) => {
    if (category === 'Abono') return 'var(--text-muted)'
    const s = (status || '').toLowerCase()
    if (s.startsWith('pendiente')) return '#f1c40f' // yellow
    if (s.startsWith('aprobado')) return '#10b981' // green
    if (s.startsWith('rechaz')) return '#ef4444' // red
    return 'var(--text-muted)'
  }

  const handleViewDetails = (item) => {
    if (item.category === 'Rendición') {
      navigate(`/rendiciones/${item.id}`)
    } else if (item.category === 'Abono') {
      navigate(`/abonos/${item.id}`)
    } else {
      navigate(`/solicitudes/${item.id}`)
    }
  }

  const processedData = getProcessedData()
  const totalItems = processedData.length
  const totalPages = Math.ceil(totalItems / limit) || 1
  const paginatedData = processedData.slice((page - 1) * limit, page * limit)

  return (
    <div className="page-container">
      
      {/* Title */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: '800' }}>
          Gestión de Solicitudes
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Visualice, filtre y administre los registros y solicitudes de horas administrativas.
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--card-border)',
        marginBottom: '24px',
        gap: '8px',
        overflowX: 'auto'
      }}>
        <button 
          onClick={() => setActiveTab('mine')}
          style={{
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'mine' ? '3px solid var(--accent)' : '3px solid transparent',
            color: activeTab === 'mine' ? 'var(--text)' : 'var(--text-muted)',
            padding: '12px 20px',
            fontSize: '0.92rem',
            fontWeight: activeTab === 'mine' ? '700' : '500',
            cursor: 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          Mis Solicitudes
        </button>

        {isBossOrAdmin && (
          <>
            <button 
              onClick={() => setActiveTab('pending')}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'pending' ? '3px solid var(--accent)' : '3px solid transparent',
                color: activeTab === 'pending' ? 'var(--text)' : 'var(--text-muted)',
                padding: '12px 20px',
                fontSize: '0.92rem',
                fontWeight: activeTab === 'pending' ? '700' : '500',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Pendientes de Aprobación
            </button>
            <button 
              onClick={() => setActiveTab('reviewed')}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: activeTab === 'reviewed' ? '3px solid var(--accent)' : '3px solid transparent',
                color: activeTab === 'reviewed' ? 'var(--text)' : 'var(--text-muted)',
                padding: '12px 20px',
                fontSize: '0.92rem',
                fontWeight: activeTab === 'reviewed' ? '700' : '500',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Historial General Revisado
            </button>
          </>
        )}
      </div>

      {/* Filters Card */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius)',
        padding: '16px 20px',
        boxShadow: 'var(--shadow)',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        alignItems: 'center'
      }}>
        {/* Search */}
        <div style={{ display: 'flex', flex: 1, minWidth: '250px' }}>
          <input
            type="text"
            placeholder="Buscar por ID, usuario, proyecto, comentario..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
          />
        </div>

        {/* Filters Select */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <select 
            value={typeFilter} 
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
            style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
          >
            <option value="">Todos los tipos</option>
            <option value="Permiso">Permiso</option>
            <option value="Notificación">Notificación</option>
            <option value="Rendición">Rendición</option>
          </select>

          <select 
            value={limit} 
            onChange={(e) => { setLimit(parseInt(e.target.value)); setPage(1); }}
            style={{ padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--input-border)', color: 'var(--text)', background: 'var(--input-bg)' }}
          >
            <option value={10}>10 por página</option>
            <option value={20}>20 por página</option>
            <option value={50}>50 por página</option>
          </select>
        </div>
      </div>

      {/* Main Table Card */}
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando solicitudes...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '2px solid var(--card-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
                <th onClick={() => handleSort('id')} style={{ padding: '12px 16px', cursor: 'pointer', fontWeight: '700' }}>ID <i className={`fa fa-sort`}></i></th>
                <th onClick={() => handleSort('date')} style={{ padding: '12px 16px', cursor: 'pointer', fontWeight: '700' }}>Fecha Registro <i className={`fa fa-sort`}></i></th>
                <th onClick={() => handleSort('category')} style={{ padding: '12px 16px', cursor: 'pointer', fontWeight: '700' }}>Tipo <i className={`fa fa-sort`}></i></th>
                <th style={{ padding: '12px 16px', fontWeight: '700' }}>Horas</th>
                <th style={{ padding: '12px 16px', fontWeight: '700' }}>Detalle</th>
                <th onClick={() => handleSort('status')} style={{ padding: '12px 16px', cursor: 'pointer', fontWeight: '700' }}>Estado <i className={`fa fa-sort`}></i></th>
                {activeTab !== 'mine' && <th style={{ padding: '12px 16px', fontWeight: '700' }}>Usuario</th>}
                <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={activeTab === 'mine' ? 7 : 8} style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No se encontraron solicitudes
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--card-border)' }}>
                    <td style={{ padding: '12px 16px', fontWeight: '600' }}>#{item.id}</td>
                    <td style={{ padding: '12px 16px' }}>{formatFecha(item.date || item.created_at)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        textTransform: 'uppercase',
                        background: item.category === 'Rendición' ? 'rgba(37, 99, 235, 0.15)' : (item.category.toLowerCase() === 'notificación' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(245, 158, 11, 0.15)'),
                        color: item.category === 'Rendición' ? '#3b82f6' : (item.category.toLowerCase() === 'notificación' ? '#10b981' : '#f59e0b')
                      }}>{item.category}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>{item.hours?.toFixed(1)}h</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                      {item.category === 'Rendición' 
                        ? `${item.cliente || '-'} (${item.proyecto || '-'})` 
                        : truncate(item.comment || '', 30)
                      }
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '0.82rem',
                        fontWeight: '600',
                        color: getStatusColor(item.status, item.category)
                      }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: getStatusColor(item.status, item.category), display: 'inline-block' }}></span>
                        {formatEstado(item.status, item.category)}
                      </span>
                    </td>
                    {activeTab !== 'mine' && <td style={{ padding: '12px 16px' }}>{item.user_name || '-'}</td>}
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <button 
                        onClick={() => handleViewDetails(item)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--accent)',
                          cursor: 'pointer',
                          padding: '6px 12px',
                          fontSize: '1rem'
                        }}
                        title="Ver detalles"
                      >
                        <i className="fa fa-eye"></i>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}

        {/* Pagination Footer */}
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
              Mostrando {Math.min(totalItems, (page - 1) * limit + 1)} al {Math.min(totalItems, page * limit)} de {totalItems} resultados
            </div>
            
            <div style={{ display: 'flex', gap: '4px' }}>
              <button 
                onClick={() => setPage(1)} 
                disabled={page === 1}
                style={{ padding: '6px 10px', background: 'var(--card-border)', border: 'none', color: 'var(--text)', borderRadius: '4px', cursor: 'pointer', opacity: page === 1 ? 0.4 : 1 }}
              >«</button>
              <button 
                onClick={() => setPage(page - 1)} 
                disabled={page === 1}
                style={{ padding: '6px 10px', background: 'var(--card-border)', border: 'none', color: 'var(--text)', borderRadius: '4px', cursor: 'pointer', opacity: page === 1 ? 0.4 : 1 }}
              >{"<"}</button>
              
              <span style={{ padding: '6px 12px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                Página {page} de {totalPages}
              </span>

              <button 
                onClick={() => setPage(page + 1)} 
                disabled={page === totalPages}
                style={{ padding: '6px 10px', background: 'var(--card-border)', border: 'none', color: 'var(--text)', borderRadius: '4px', cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1 }}
              >{">"}</button>
              <button 
                onClick={() => setPage(totalPages)} 
                disabled={page === totalPages}
                style={{ padding: '6px 10px', background: 'var(--card-border)', border: 'none', color: 'var(--text)', borderRadius: '4px', cursor: 'pointer', opacity: page === totalPages ? 0.4 : 1 }}
              >»</button>
            </div>
          </div>
        )}

      </div>

    </div>
  )
}
