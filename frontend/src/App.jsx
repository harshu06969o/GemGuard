import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import TopNav from './components/TopNav';
import DashboardPage from './pages/DashboardPage';
import TenderWorkspacePage from './pages/TenderWorkspacePage';
import BidWorkspacePage from './pages/BidWorkspacePage';
import BidderWorkspacePage from './pages/BidderWorkspacePage';
import ComplianceDashboard from './pages/ComplianceDashboard';
import CorrigendumPage from './pages/CorrigendumPage';
import LoginPage from './pages/LoginPage';
import { getToken } from './api/client';

function RequireAuth({ children }) {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected */}
          <Route path="/*" element={
            <RequireAuth>
              <>
                <TopNav />
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/tender" element={<TenderWorkspacePage />} />
                    <Route path="/tender/:tenderId" element={<TenderWorkspacePage />} />
                    <Route path="/bids" element={<BidWorkspacePage />} />
                    <Route path="/bids/:bidId" element={<BidWorkspacePage />} />
                    <Route path="/my-bids" element={<BidderWorkspacePage />} />
                    <Route path="/compliance" element={<ComplianceDashboard />} />
                    <Route path="/corrigendum" element={<CorrigendumPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </div>
              </>
            </RequireAuth>
          } />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
