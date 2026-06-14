import { useState } from 'react';
import { Outlet, useLocation, useSearchParams } from 'react-router-dom';
import Sidebar from './Sidebar';
import './MainLayout.css';

export default function MainLayout() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const isPopup = searchParams.get('popup') === 'true';
  const isWorktoolTestMode =
    location.pathname.startsWith('/worktool') && searchParams.get('mode') === 'test';
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(isPopup);

  const handleToggleSidebar = () => {
    setIsSidebarCollapsed(prev => !prev);
  };

  return (
    <div className="main-layout">
      {!isWorktoolTestMode && (
        <Sidebar
          isCollapsed={isSidebarCollapsed}
          onToggle={handleToggleSidebar}
        />
      )}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
