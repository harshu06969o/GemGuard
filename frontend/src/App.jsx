import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import TopNav from './components/TopNav';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import TenderWorkspacePage from './pages/TenderWorkspacePage';
import BidWorkspacePage from './pages/BidWorkspacePage';
import BidderWorkspacePage from './pages/BidderWorkspacePage';
import ComplianceDashboard from './pages/ComplianceDashboard';
import CorrigendumPage from './pages/CorrigendumPage';
import LoginPage from './pages/LoginPage';
import { getToken } from './api/client';

function RequireAuth({ children }) {
  const token = getToken() || localStorage.getItem('token') || localStorage.getItem('gemguard_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Routes>
          {/* STEP 1: Full-Screen Enterprise Landing Hero at root / */}
          <Route path="/" element={<LandingPage />} />

          {/* Public Login Route */}
          <Route path="/login" element={<LoginPage />} />

          {/* Protected Enterprise Workspaces with TopNav */}
          <Route element={
            <RequireAuth>
              <TopNav />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <Outlet />
              </div>
            </RequireAuth>
          }>
            <Route path="/dashboard" element={<DashboardPage />} />
            
            {/* STEP 2: Tender Workspace Routes */}
            <Route path="/tenders" element={<TenderWorkspacePage />} />
            <Route path="/tender" element={<TenderWorkspacePage />} />
            <Route path="/tenders/:tenderId" element={<TenderWorkspacePage />} />
            <Route path="/tender/:tenderId" element={<TenderWorkspacePage />} />

            {/* Other Workspaces */}
            <Route path="/bids" element={<BidWorkspacePage />} />
            <Route path="/bids/:bidId" element={<BidWorkspacePage />} />
            <Route path="/my-bids" element={<BidderWorkspacePage />} />
            <Route path="/compliance" element={<ComplianceDashboard />} />
            <Route path="/corrigendum" element={<CorrigendumPage />} />
          </Route>

          {/* Catch-all redirect to Landing */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
