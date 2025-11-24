import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import InterviewApp from './InterviewApp.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <InterviewApp />
  </StrictMode>,
)
