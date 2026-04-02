// import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import '@uiw/react-md-editor/markdown-editor.css'
import './index.css'

createRoot(document.getElementById('root')!).render(
  // <StrictMode>
    <App />
  // </StrictMode>,
)
