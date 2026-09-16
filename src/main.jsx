import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles/index.css'

// Note: no StrictMode here. React's dev double-mounting plays badly with
// imperative singletons such as the Rapier world and the input listener layer.
createRoot(document.getElementById('root')).render(<App />)
