import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Register service worker with auto-update on new version
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      // Check for updates every 30 seconds
      setInterval(() => {
        registration.update()
      }, 30000)

      // Listen for updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker installed, reload to use it
              console.log('Nueva versión disponible, actualizando...')
              window.location.reload()
            }
          })
        }
      })
    }).catch(err => {
      console.log('Service Worker registration failed:', err)
    })
  })
}
