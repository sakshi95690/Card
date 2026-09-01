import { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { LogOut } from 'lucide-react';
import { Volunteer, FestivalEvent } from './types';
import RegistrationForm from './components/RegistrationForm';
import VolunteerCard from './components/VolunteerCard';
import AdminDashboard from './components/AdminDashboard';
import AdminLogin from './components/AdminLogin';
import { AppLogo } from './components/AppLogo';
import { fetchAllEvents, subscribeToVolunteerUpdates } from './lib/storage';

export default function App() {
  // Check if current route is admin (via pathname e.g. /admin or hash e.g. #admin)
  const checkIsAdminRoute = () => {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    const search = window.location.search.toLowerCase();
    return (
      path.startsWith('/admin') ||
      hash === '#admin' ||
      hash.startsWith('#/admin') ||
      search.includes('admin=true')
    );
  };

  const [isAdminRoute, setIsAdminRoute] = useState(checkIsAdminRoute);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(() => {
    return Boolean(sessionStorage.getItem('iskcon_admin_token'));
  });

  const [registeredVolunteer, setRegisteredVolunteer] = useState<Volunteer | null>(null);
  const [activeEvent, setActiveEvent] = useState<FestivalEvent | null>(null);

  // Function to load latest active event
  const refreshActiveEvent = useCallback(async () => {
    try {
      const list = await fetchAllEvents();
      if (list && list.length > 0) {
        const savedId = localStorage.getItem('active_festival_event_id');
        let matched = savedId ? list.find((e) => e.id === savedId) : null;
        if (!matched) {
          matched = list.find((e) => e.isDefault && e.isActive !== false) || list.find((e) => e.isActive !== false) || list[0];
        }
        if (matched) {
          setActiveEvent(matched);
        }
      }
    } catch (err) {
      console.warn('Error loading active festival event:', err);
    }
  }, []);

  // Initial load & real-time sync for active festival
  useEffect(() => {
    refreshActiveEvent();

    const handleFestivalChange = (e: any) => {
      if (e?.detail?.event) {
        setActiveEvent(e.detail.event);
      } else {
        refreshActiveEvent();
      }
    };

    window.addEventListener('festival_event_changed', handleFestivalChange);
    const unsubscribe = subscribeToVolunteerUpdates(() => {
      refreshActiveEvent();
    });

    return () => {
      window.removeEventListener('festival_event_changed', handleFestivalChange);
      unsubscribe();
    };
  }, [refreshActiveEvent]);

  // Sync route changes
  useEffect(() => {
    const handleLocationChange = () => {
      setIsAdminRoute(checkIsAdminRoute());
      setIsAdminAuthenticated(Boolean(sessionStorage.getItem('iskcon_admin_token')));
    };

    window.addEventListener('hashchange', handleLocationChange);
    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('hashchange', handleLocationChange);
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const handleRegistrationSuccess = (volunteer: Volunteer) => {
    setRegisteredVolunteer(volunteer);

    // Festive celebration confetti
    try {
      confetti({
        particleCount: 85,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#1e40af'],
      });
    } catch {
      // Fallback
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRegisterAnother = () => {
    setRegisteredVolunteer(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleExitAdmin = () => {
    // Navigate to root
    if (window.location.pathname.startsWith('/admin')) {
      window.history.pushState({}, '', '/');
    }
    window.location.hash = '';
    setIsAdminRoute(false);
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem('iskcon_admin_token');
    setIsAdminAuthenticated(false);
    handleExitAdmin();
  };

  const activeFestivalTitle = activeEvent
    ? `${activeEvent.name} ${activeEvent.year ? activeEvent.year : ''}`.trim()
    : 'Sri Krishna Janmashtami 2026';

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col text-slate-800">
      {/* Header - Uses AppLogo and shows active festival & exit button when in admin */}
      <header className="no-print w-full bg-white/95 backdrop-blur-md border-b border-blue-100 sticky top-0 z-40 shadow-xs">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between">
          {/* Logo & Title */}
          <div className="flex items-center gap-2.5 select-none">
            <AppLogo className="w-9 h-9 sm:w-10 sm:h-10 shadow-xs rounded-full" />
            <div>
              <h1 className="text-sm sm:text-base font-bold text-[#1E40AF] font-serif-cultural tracking-tight leading-tight flex items-center gap-1.5">
                <span>{activeFestivalTitle}</span>
              </h1>
              <p className="text-[10px] sm:text-[11px] text-slate-500 leading-none mt-0.5 font-medium">
                {isAdminRoute ? 'Admin Control Portal' : 'ISKCON Seva Volunteer Registration'}
              </p>
            </div>
          </div>

          {/* Exit Button in Top Header for Admin */}
          {isAdminRoute && (
            <button
              type="button"
              id="header-exit-admin-btn"
              onClick={handleAdminLogout}
              className="px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#1E40AF] border border-blue-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs min-h-[34px]"
              title="Exit Admin Portal"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Exit</span>
            </button>
          )}
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 w-full max-w-4xl mx-auto py-2 sm:py-4 px-2 sm:px-4 flex flex-col">
        {isAdminRoute ? (
          isAdminAuthenticated ? (
            <div className="animate-in fade-in duration-200 w-full">
              <AdminDashboard onBackToRegistration={handleAdminLogout} />
            </div>
          ) : (
            <AdminLogin
              onSuccess={() => setIsAdminAuthenticated(true)}
              onCancel={handleExitAdmin}
            />
          )
        ) : registeredVolunteer ? (
          <div className="animate-in fade-in zoom-in-95 duration-300">
            <VolunteerCard
              volunteer={registeredVolunteer}
              onRegisterAnother={handleRegisterAnother}
              onClose={handleRegisterAnother}
            />
          </div>
        ) : (
          <RegistrationForm onSuccess={handleRegistrationSuccess} />
        )}
      </main>
    </div>
  );
}
