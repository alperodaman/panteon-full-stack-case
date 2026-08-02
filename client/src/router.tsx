import { Route, Routes } from 'react-router-dom'
import { LeaderboardPage } from './pages/LeaderboardPage'
import { HistoryPage } from './pages/HistoryPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<LeaderboardPage />} />
      <Route path="/history" element={<HistoryPage />} />
    </Routes>
  )
}
