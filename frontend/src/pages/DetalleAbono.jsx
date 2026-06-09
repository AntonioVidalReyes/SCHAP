import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api'

export default function DetalleAbono({ currentUser }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [abono, setAbono] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [userBalance, setUserBalance] = useState('')

  useEffect(() => {
    async function loadAbonoDetail() {
      setLoading(true)
      setErrorMsg('')
      try {
        const res = await api.get('/api/requests?mine=0')
        if (!res.ok) {
          setErrorMsg("No se pudieron cargar los detalles del abono.")
          setLoading(false)
          return
        }

        const data = await res.json()
        const abonoId = parseInt(id, 10)
        const a = (data.requests || []).find(item => item.id === abonoId)

        if (!a) {
          setErrorMsg(`No se encontró el abono/regalo #${id}`)
          setLoading(false)
          return
        }

        setAbono(a)

        // Load user balance
        const usersRes = await api.get('/api/users')
        if (usersRes.ok) {
          const uData = await usersRes.json()
          const matchUser = (uData.users || []).find(u => u.id === a.user_id)
          if (matchUser) {
            const balance = (matchUser.bonus_hours || 0) - (matchUser.used_hours || 0)
            setUserBalance(`${balance.toFixed(1)} horas disponibles`)
          }
        }

      } catch (err) {
        setErrorMsg("Error de red.")
      } finally {
        setLoading(false)
      }
    }
    loadAbonoDetail()
  }, [id])

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando detalles de abono...</div>
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

  const isGift = abono.type === 'Regalo'

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

  return (
    <div className="page-container">
      
      {/* Back button */}
      <div style={{ marginBottom: '20px' }}>
        <button 
          onClick={() => navigate('/solicitudes')}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <i className="fa fa-arrow-left"></i> Volver
        </button>
      </div>

      {/* Info Card */}
      <div className="req-card" style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 'var(--radius)',
        padding: '24px',
        boxShadow: 'var(--shadow)',
        marginBottom: '20px'
      }}>
        <div style={{ fontSize: '1.25rem', fontWeight: '800', borderBottom: '1px solid var(--card-border)', paddingBottom: '12px', marginBottom: '16px' }}>
          Ajuste #{abono.id} - Colaborador: <span style={{ color: 'var(--accent)' }}>{abono.user_name}</span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', marginBottom: '16px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--card-border)', textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '8px' }}>Fecha</th>
              <th style={{ padding: '8px' }}>Tipo de Ajuste</th>
              <th style={{ padding: '8px' }}>Horas Añadidas</th>
              <th style={{ padding: '8px' }}>Concepto</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
              <td style={{ padding: '12px 8px', fontWeight: '600' }}>{abono.date?.split('T')[0]}</td>
              <td style={{ padding: '12px 8px' }}>
                <span style={{
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  background: isGift ? 'rgba(52, 211, 153, 0.15)' : 'rgba(37, 99, 235, 0.15)',
                  color: isGift ? '#10b981' : '#3b82f6'
                }}>
                  {isGift ? 'REGALO (CUMPLE/MÉRITO)' : 'ABONO ESTÁNDAR'}
                </span>
              </td>
              <td style={{ padding: '12px 8px', fontWeight: 'bold', color: 'var(--success)' }}>+{abono.hours?.toFixed(1)} h</td>
              <td style={{ padding: '12px 8px', color: 'var(--text-muted)' }}>{abono.comment || 'Ajuste de horas'}</td>
            </tr>
          </tbody>
        </table>
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
        <div style={{ fontWeight: '700', fontSize: '0.95rem', marginBottom: '16px' }}>Progreso del Ajuste</div>
        
        <div className="req-progress-bar" style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <div className="req-progress-step req-progress-step--notificacion" style={{ flex: '1 1 100%', padding: '12px', textAlign: 'center', background: '#2563eb', color: '#fff', borderRadius: '8px', fontSize: '0.9rem', fontWeight: '700' }}>
            Finalizada (Informativa)
          </div>
        </div>

        {/* Timeline List */}
        <ul style={{ listStyleType: 'disc', paddingLeft: '20px', margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: '1.8' }}>
          <li>Creada el {formatDateTimeUser(abono.created_at)}</li>
          <li>Estado actual: <strong>Finalizada</strong></li>
        </ul>
      </div>

      {/* User Card */}
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
            <p style={{ margin: 0, fontWeight: '600' }}>{abono.user_name}</p>
          </div>
          <div>
            <p style={{ margin: '0 0 4px 0', color: 'var(--text-muted)' }}>Saldo Disponible actual:</p>
            <p style={{ margin: 0, fontWeight: '600' }}>{userBalance || '-'}</p>
          </div>
        </div>
      </div>

    </div>
  )
}
