import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import ToastContainer from './components/Toast'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import TransferSimulator from './pages/TransferSimulator'
import Transactions from './pages/Transactions'
import FraudCenter from './pages/FraudCenter'
import ChaosPanel from './pages/ChaosPanel'
import Monitoring from './pages/Monitoring'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <div className="p-6 max-w-7xl mx-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/transfer" element={<TransferSimulator />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/fraud" element={<FraudCenter />} />
              <Route path="/chaos" element={<ChaosPanel />} />
              <Route path="/monitoring" element={<Monitoring />} />
            </Routes>
          </div>
        </main>
        <ToastContainer />
      </div>
    </BrowserRouter>
  )
}
