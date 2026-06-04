import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import LandingPage from './pages/LandingPage.jsx'
import LearnPage from './pages/LearnPage.jsx'
import { capturePageview } from './lib/phuglytics.js'
import ThemeProvider from './lib/ThemeContext.jsx'


function PageTracker() {
  const location = useLocation()
  useEffect(() => { capturePageview() }, [location])
  return null
}

export default function App() {
  return (
    <ThemeProvider>
      <PageTracker />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/learn" element={<LearnPage />} />
        <Route path="/learn/:lessonId" element={<LearnPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ThemeProvider>
  )
}
