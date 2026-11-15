import { useEffect, useState } from 'react';
import { api, setToken, User } from './api';
import AdminDashboard from './pages/AdminDashboard';
import CompanyDashboard from './pages/CompanyDashboard';
import Login from './pages/Login';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!localStorage.getItem('leta_token'));

  useEffect(() => {
    if (!loading) return;
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [loading]);

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  if (loading) return <p className="center">Chargement…</p>;
  if (!user) return <Login onLogin={setUser} />;

  return (
    <div>
      <header className="topbar">
        <strong>LETA</strong>
        <span>
          {user.company?.name ?? 'Administration'} · {user.name}
          <button className="link" onClick={logout}>Déconnexion</button>
        </span>
      </header>
      <main className="container">
        {user.role === 'ADMIN' && <AdminDashboard />}
        {user.role === 'COMPANY' && <CompanyDashboard />}
        {(user.role === 'CLIENT' || user.role === 'DRIVER') && (
          <p>Ce tableau de bord est réservé aux entreprises. Utilisez l'application mobile LETA.</p>
        )}
      </main>
    </div>
  );
}
