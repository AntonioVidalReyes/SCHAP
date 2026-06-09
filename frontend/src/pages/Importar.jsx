import React, { useState } from 'react'
import api from '../api'

export default function Importar({ currentUser }) {
  const [importType, setImportType] = useState('users') // 'users', 'requests', 'rendiciones'
  const [inputType, setInputType] = useState('file') // 'file', 'text'
  const [jsonData, setJsonData] = useState('')
  const [jsonFile, setJsonFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState([])
  const [resetDbBefore, setResetDbBefore] = useState(false)

  if (currentUser?.role !== 'superusuario') {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--danger)' }}>
        <h2>Acceso Denegado</h2>
        <p>Solo el Superusuario de emergencia puede ingresar a esta sección de importación general.</p>
      </div>
    )
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    setJsonFile(file)
    addLog(`Archivo seleccionado: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`)
  }

  const addLog = (text, type = 'info') => {
    const time = new Date().toLocaleTimeString('es-ES')
    setLogs(prev => [...prev, { time, text, type }])
  }

  const clearLogs = () => {
    setLogs([])
  }

  const getTemplate = () => {
    if (importType === 'users') {
      return JSON.stringify([
        {
          "name": "Juan Perez",
          "email": "juan@sistema.local",
          "password": "pass123",
          "role": "trabajador",
          "boss_email": "jefe@sistema.local",
          "bonus_hours": 10.0,
          "must_change_password": 1
        },
        {
          "name": "Pedro Jefe",
          "email": "jefe@sistema.local",
          "password": "jefe123",
          "role": "jefe",
          "bonus_hours": 0.0,
          "must_change_password": 0
        }
      ], null, 2)
    } else if (importType === 'requests') {
      return JSON.stringify([
        {
          "user_email": "juan@sistema.local",
          "type": "Permiso",
          "date": "2026-06-01",
          "hours": 4.5,
          "comment": "Trámite médico personal",
          "status": "aprobado",
          "from_time": "09:00",
          "to_time": "13:30"
        },
        {
          "user_email": "juan@sistema.local",
          "type": "Abono",
          "date": "2026-06-02",
          "hours": 8.0,
          "comment": "Abono horas extras fin de semana",
          "status": "informativa"
        }
      ], null, 2)
    } else {
      // Rendiciones
      return JSON.stringify([
        {
          "user_email": "juan@sistema.local",
          "proyecto": "Proyecto Alfa",
          "cliente": "Cliente X",
          "trabajo": "Desarrollo del módulo de base de datos",
          "obs": "Sin observaciones adicionales",
          "status": "aprobado",
          "total_horas": 8.0,
          "hitos": [
            {
              "day": "2026-06-01",
              "desde": "09:00",
              "hasta": "13:00",
              "tipo": "extras",
              "alojamiento": 0,
              "feriado": 0,
              "valor": 4.0
            },
            {
              "day": "2026-06-01",
              "desde": "14:00",
              "hasta": "18:00",
              "tipo": "extras",
              "alojamiento": 0,
              "feriado": 0,
              "valor": 4.0
            }
          ]
        }
      ], null, 2)
    }
  }

  const handleImport = async (e) => {
    e.preventDefault()
    clearLogs()
    setLoading(true)
    addLog("Iniciando proceso de importación...", "info")

    try {
      let parsedData = []

      // 1. Parsing step
      if (inputType === 'file') {
        if (!jsonFile) {
          addLog("Error: Debe seleccionar un archivo JSON (.json) para importar.", "error")
          setLoading(false)
          return
        }

        addLog("Leyendo archivo JSON...", "info")
        const text = await jsonFile.text()
        try {
          parsedData = JSON.parse(text)
          if (!Array.isArray(parsedData)) {
            addLog("Error: El contenido del archivo JSON debe ser una lista/array de objetos.", "error")
            setLoading(false)
            return
          }
          addLog(`JSON procesado localmente. Se encontraron ${parsedData.length} registros.`, "info")
        } catch (jsonErr) {
          addLog(`Error al parsear el archivo JSON: ${jsonErr.message}`, "error")
          setLoading(false)
          return
        }
      } else {
        if (!jsonData.trim()) {
          addLog("Error: Debe pegar código JSON para importar.", "error")
          setLoading(false)
          return
        }
        try {
          parsedData = JSON.parse(jsonData)
          if (!Array.isArray(parsedData)) {
            addLog("Error: El JSON provisto debe ser una lista/array de objetos.", "error")
            setLoading(false)
            return
          }
          addLog(`JSON parseado correctamente. Se encontraron ${parsedData.length} registros.`, "info")
        } catch (jsonErr) {
          addLog(`Error al parsear JSON pegado: ${jsonErr.message}`, "error")
          setLoading(false)
          return
        }
      }

      if (parsedData.length === 0) {
        addLog("Error: No hay datos para importar.", "error")
        setLoading(false)
        return
      }

      // Optional: System reset before importing
      if (resetDbBefore) {
        const confirmReset = window.confirm("¿Está seguro de querer restablecer el sistema de fábrica antes de la importación? Se borrarán todos los datos actuales.")
        if (confirmReset) {
          addLog("Ejecutando reinicio del sistema de fábrica...", "warning")
          const resetRes = await api.post('/api/config/reset-system')
          if (resetRes.ok) {
            addLog("Sistema restablecido con éxito. Esperando a que el servidor vuelva a estar en línea...", "success")
            
            // Poll /api/check-setup until it responds with 200
            let online = false
            for (let attempt = 1; attempt <= 15; attempt++) {
              addLog(`Intentando conectar con el servidor (intento ${attempt}/15)...`, "info")
              await new Promise(r => setTimeout(r, 1500))
              try {
                const checkRes = await fetch('/api/check-setup')
                if (checkRes.ok) {
                  online = true
                  break
                }
              } catch (e) {
                // Ignore connection errors during restart
              }
            }
            
            if (!online) {
              addLog("Error: El servidor no se reconectó a tiempo. Por favor, intente importar de nuevo manualmente.", "error")
              setLoading(false)
              return
            }
            
            addLog("Servidor en línea de nuevo. Procediendo con la importación...", "success")
          } else {
            addLog("Advertencia: No se pudo restablecer el sistema, continuando con importación estándar.", "warning")
          }
        }
      }

      // 2. Upload and validation step
      addLog("Enviando lote al servidor para validación e inserción...", "info")
      const res = await api.post(`/api/admin/import/${importType}`, { data: parsedData })
      const resData = await res.json()

      if (res.ok) {
        addLog(`Éxito: ${resData.message}`, "success")
      } else {
        addLog(`Error en el servidor: ${resData.error}`, "error")
        addLog("Transacción abortada. Ningún registro fue insertado en la base de datos.", "error")
      }

    } catch (err) {
      addLog(`Error de comunicación con el servidor: ${err.message}`, "error")
    } finally {
      setLoading(false)
    }
  }

  const copyTemplateToClipboard = () => {
    navigator.clipboard.writeText(getTemplate())
    alert("Plantilla copiada al portapapeles.")
  }

  return (
    <div className="page-container">
      
      {/* Title */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '1.8rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <i className="fa fa-upload" style={{ color: 'var(--accent)' }}></i> Importador de Datos por Lotes
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          Módulo de administración exclusivo para poblar masivamente la base de datos utilizando archivos JSON.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '30px',
        alignItems: 'start'
      }}>
        
        {/* Left column: Controls & Upload */}
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 'var(--radius)',
          padding: '24px',
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}>
          
          <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem', fontWeight: '700' }}>
            Configurar Importación
          </h3>

          <form onSubmit={handleImport} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            
            {/* Import type */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>
                ¿Qué tipo de datos desea importar?
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                {[
                  { id: 'users', label: 'Colaboradores', icon: 'fa-users' },
                  { id: 'requests', label: 'Solicitudes / Abonos', icon: 'fa-envelope' },
                  { id: 'rendiciones', label: 'Rendiciones', icon: 'fa-briefcase' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setImportType(tab.id)}
                    style={{
                      padding: '12px 8px',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: importType === tab.id ? 'var(--accent)' : 'var(--input-border)',
                      background: importType === tab.id ? 'rgba(37, 99, 235, 0.08)' : 'var(--input-bg)',
                      color: importType === tab.id ? 'var(--accent)' : 'var(--text)',
                      fontWeight: '600',
                      fontSize: '0.82rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.2s'
                    }}
                  >
                    <i className={`fa ${tab.icon}`} style={{ fontSize: '1.1rem' }}></i>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input type selection */}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>
                Formato de entrada
              </label>
              <div style={{ display: 'flex', gap: '16px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="inputType"
                    value="file"
                    checked={inputType === 'file'}
                    onChange={() => setInputType('file')}
                  />
                  Subir Archivo JSON (.json)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="inputType"
                    value="text"
                    checked={inputType === 'text'}
                    onChange={() => setInputType('text')}
                  />
                  Pegar Código JSON
                </label>
              </div>
            </div>

            {/* File upload or text input depending on type */}
            {inputType === 'file' ? (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>
                  Seleccione Archivo JSON
                </label>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileChange}
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '8px',
                    border: '1px dashed var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    boxSizing: 'border-box',
                    cursor: 'pointer'
                  }}
                />
              </div>
            ) : (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px' }}>
                  Pegue el Código JSON de Importación
                </label>
                <textarea
                  rows="12"
                  placeholder='[ { "key": "value" } ]'
                  value={jsonData}
                  onChange={(e) => setJsonData(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    color: 'var(--text)',
                    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                    fontSize: '0.82rem',
                    boxSizing: 'border-box',
                    resize: 'vertical'
                  }}
                />
              </div>
            )}

            {/* Optional Reset Db */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
              <input
                type="checkbox"
                id="reset-db-before"
                checked={resetDbBefore}
                onChange={(e) => setResetDbBefore(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="reset-db-before" style={{ fontSize: '0.85rem', cursor: 'pointer', color: resetDbBefore ? 'var(--danger)' : 'var(--text)' }}>
                <strong>(Peligro)</strong> Vaciar la base de datos antes de importar
              </label>
            </div>

            {/* Action button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? 'var(--card-border)' : 'var(--accent)',
                color: loading ? 'var(--text-muted)' : '#fff',
                border: 'none',
                padding: '12px',
                borderRadius: '8px',
                fontWeight: '700',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '0.95rem'
              }}
            >
              {loading ? (
                <>
                  <i className="fa fa-spinner fa-spin"></i>
                  <span>Importando...</span>
                </>
              ) : (
                <>
                  <i className="fa fa-file-import"></i>
                  <span>Validar e Importar</span>
                </>
              )}
            </button>

          </form>

        </div>

        {/* Right column: Templates and instruction */}
        <div style={{
          background: 'var(--card-bg)',
          border: '1px solid var(--card-border)',
          borderRadius: 'var(--radius)',
          padding: '24px',
          boxShadow: 'var(--shadow)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700' }}>
              Plantilla JSON Recomendada
            </h3>
            <button
              onClick={copyTemplateToClipboard}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent)',
                cursor: 'pointer',
                fontWeight: '600',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <i className="fa fa-copy"></i> Copiar Plantilla
            </button>
          </div>

          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Asegúrese de respetar la estructura JSON provista. Los valores del objeto deben estar bien estructurados en listas o arreglos.
          </p>

          <pre style={{
            margin: 0,
            padding: '16px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '8px',
            fontSize: '0.78rem',
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            color: '#a5b4fc',
            overflowX: 'auto',
            border: '1px solid var(--card-border)'
          }}>
            {getTemplate()}
          </pre>

          <div style={{ fontSize: '0.82rem', borderTop: '1px solid var(--card-border)', paddingTop: '16px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontWeight: '700' }}>Consejos de Integridad:</h4>
            <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <li><strong>Jerarquía:</strong> Al importar usuarios, defina al jefe usando su correo electrónico registrado.</li>
              <li><strong>Vinculación:</strong> Las solicitudes y rendiciones se enlazan a los colaboradores mediante el campo <code>user_email</code> o <code>email</code>.</li>
              <li><strong>Estructura:</strong> Las rendiciones de horas permiten incluir un arreglo de <code>hitos</code> con sus detalles de horas ajustadas.</li>
            </ul>
          </div>

        </div>

      </div>

      {/* Logs console */}
      <div style={{
        marginTop: '30px',
        background: '#070a13',
        border: '1px solid #1e293b',
        borderRadius: '8px',
        boxShadow: 'var(--shadow)',
        overflow: 'hidden'
      }}>
        
        <div style={{
          padding: '12px 20px',
          background: '#0d1527',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa fa-terminal" style={{ color: '#10b981' }}></i> Consola de Resultados e Importación
          </span>
          <button
            onClick={clearLogs}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '0.78rem',
              fontWeight: '600'
            }}
          >
            Limpiar Consola
          </button>
        </div>

        <div style={{
          padding: '16px 20px',
          height: '220px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          fontSize: '0.82rem',
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace"
        }}>
          {logs.length === 0 ? (
            <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', marginTop: '80px' }}>
              Consola inactiva. Complete la configuración arriba y presione "Validar e Importar".
            </div>
          ) : (
            logs.map((log, index) => {
              let color = '#cbd5e1'
              if (log.type === 'error') color = '#f87171' // red
              if (log.type === 'success') color = '#4ade80' // green
              if (log.type === 'warning') color = '#fbbf24' // yellow

              return (
                <div key={index} style={{ display: 'flex', gap: '10px' }}>
                  <span style={{ color: '#64748b', userSelect: 'none' }}>[{log.time}]</span>
                  <span style={{ color }}>{log.text}</span>
                </div>
              )
            })
          )}
        </div>

      </div>

    </div>
  )
}
