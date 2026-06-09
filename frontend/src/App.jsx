import React, { useState, useEffect } from 'react'
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation, useNavigate } from 'react-router-dom'
import api from './api'

// Import pages
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import Calendario from './pages/Calendario'
import Solicitar from './pages/Solicitar'
import Solicitudes from './pages/Solicitudes'
import Reportes from './pages/Reportes'
import Admin from './pages/Admin'
import Auditoria from './pages/Auditoria'
import Importar from './pages/Importar'
import DetalleSolicitud from './pages/DetalleSolicitud'
import DetalleAbono from './pages/DetalleAbono'
import DetalleRendicion from './pages/DetalleRendicion'
import Rendicion from './pages/Rendicion'

// Layout Component
function Layout({ children, currentUser, onLogout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light')

  useEffect(() => {
    if (theme === 'dark') {
      document.body.classList.add('dark-theme')
      document.documentElement.classList.add('dark-theme')
    } else {
      document.body.classList.remove('dark-theme')
      document.documentElement.classList.remove('dark-theme')
    }
  }, [theme])

  const toggleTheme = () => {
    const nextTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(nextTheme)
    localStorage.setItem('theme', nextTheme)
  }

  const isRouteActive = (path) => {
    return location.pathname === path
  }

  const hasRole = (roles) => {
    return currentUser && (roles.includes(currentUser.role) || currentUser.role === 'superusuario')
  }

  return (
    <div className="app-shell">
      <header className="main-header">
        <div className="header-left">
          <span className="brand">SCHA</span>
          {currentUser && (
            <span className={`role-badge role-${currentUser.role}`}>
              {currentUser.role}
            </span>
          )}
        </div>

        <nav className="top-menu">
          <button 
            className={isRouteActive('/inicio') ? 'active' : ''} 
            onClick={() => navigate('/inicio')}
          >
            <i className="fa fa-home"></i> Inicio
          </button>

          <button 
            className={isRouteActive('/calendario') ? 'active' : ''} 
            onClick={() => navigate('/calendario')}
          >
            <i className="fa fa-calendar"></i> Calendario
          </button>

          <button 
            className={isRouteActive('/solicitar') ? 'active' : ''} 
            onClick={() => navigate('/solicitar')}
          >
            <i className="fa fa-plus-circle"></i> Solicitar
          </button>

          <button 
            className={isRouteActive('/solicitudes') ? 'active' : ''} 
            onClick={() => navigate('/solicitudes')}
          >
            <i className="fa fa-envelope"></i> Solicitudes
          </button>

          {hasRole(['administrador', 'jefe']) && (
            <button 
              className={isRouteActive('/reportes') ? 'active' : ''} 
              onClick={() => navigate('/reportes')}
            >
              <i className="fa fa-chart-bar"></i> Reportes
            </button>
          )}

          {hasRole(['administrador']) && (
            <button 
              className={isRouteActive('/admin') ? 'active' : ''} 
              onClick={() => navigate('/admin')}
            >
              <i className="fa fa-user-gear"></i> Admin
            </button>
          )}

          {currentUser?.role === 'superusuario' && (
            <>
              <button 
                className={isRouteActive('/auditoria') ? 'active' : ''} 
                onClick={() => navigate('/auditoria')}
              >
                <i className="fa fa-shield-halved"></i> Auditoría
              </button>
              <button 
                className={isRouteActive('/importar') ? 'active' : ''} 
                onClick={() => navigate('/importar')}
              >
                <i className="fa fa-file-import"></i> Importar
              </button>
            </>
          )}

          <button id="btn-theme-toggle" className="theme-btn" onClick={toggleTheme} title="Cambiar modo de color">
            <i className={theme === 'dark' ? 'fa fa-sun' : 'fa fa-moon'}></i>
          </button>

          <button className="danger" onClick={onLogout}>
            <i className="fa fa-sign-out-alt"></i> Cerrar sesión
          </button>
        </nav>
      </header>

      <main className="app-main-content">
        {children}
      </main>

      <footer>
        <div className="footer-left">
          <span className="brand">SCHA</span>
          <span className="footer-divider">|</span>
          <span className="footer-brand-text">Control de Horas Administrativas</span>
        </div>
        <div className="footer-center">
          <span id="footer-datetime">
            {new Date().toLocaleDateString('es-ES')}
          </span>
        </div>
        <div className="footer-right">
          <span id="footer-user">
            Usuario: {currentUser?.name || '-'} ({currentUser?.role || '-'})
          </span>
        </div>
      </footer>
    </div>
  )
}

function App() {
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadUser = async () => {
    const token = localStorage.getItem("authToken")
    if (!token) {
      setCurrentUser(null)
      setLoading(false)
      return
    }

    try {
      const res = await api.get("/api/me")
      if (res.ok) {
        const data = await res.json()
        setCurrentUser(data.user)
      } else {
        localStorage.removeItem("authToken")
        setCurrentUser(null)
      }
    } catch (e) {
      console.error("Error loading user:", e)
      localStorage.removeItem("authToken")
      setCurrentUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUser()
  }, [])

  const handleLogout = () => {
    localStorage.removeItem("authToken")
    localStorage.removeItem("isDefaultUser")
    setCurrentUser(null)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0b0f19', color: '#fff', fontFamily: 'Inter' }}>
        <div style={{ fontSize: '1.2rem' }}>Cargando SCHA...</div>
      </div>
    )
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/login" 
          element={
            currentUser ? <Navigate to="/inicio" replace /> : <Login onLoginSuccess={loadUser} />
          } 
        />
        
        <Route
          path="/*"
          element={
            !currentUser ? (
              <Navigate to="/login" replace />
            ) : (
              <Layout currentUser={currentUser} onLogout={handleLogout}>
                <Routes>
                  <Route path="/inicio" element={<Inicio currentUser={currentUser} onPasswordChanged={loadUser} />} />
                  <Route path="/calendario" element={<Calendario currentUser={currentUser} />} />
                  <Route path="/solicitar" element={<Solicitar currentUser={currentUser} />} />
                  <Route path="/solicitudes" element={<Solicitudes currentUser={currentUser} />} />
                  <Route path="/reportes" element={<Reportes currentUser={currentUser} />} />
                  <Route path="/admin" element={<Admin currentUser={currentUser} />} />
                  <Route path="/auditoria" element={<Auditoria currentUser={currentUser} />} />
                  <Route path="/importar" element={<Importar currentUser={currentUser} />} />
                  
                  {/* Detalle Views */}
                  <Route path="/solicitudes/:id" element={<DetalleSolicitud currentUser={currentUser} />} />
                  <Route path="/abonos/:id" element={<DetalleAbono currentUser={currentUser} />} />
                  <Route path="/rendiciones/:id" element={<DetalleRendicion currentUser={currentUser} />} />
                  <Route path="/rendir" element={<Rendicion currentUser={currentUser} />} />
                  
                  <Route path="*" element={<Navigate to="/inicio" replace />} />
                </Routes>
              </Layout>
            )
          }
        />
      </Routes>
    </Router>
  )
}

export default App
