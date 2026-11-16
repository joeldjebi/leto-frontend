import { FormEvent, useState } from 'react';
import { api, setToken, User } from '../api';
import { Icon } from '../ui';

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { phone, password } });
      if (res.user.role !== 'COMPANY' && res.user.role !== 'SUPER_ADMIN') {
        throw new Error('Espace réservé au Super Admin et aux entreprises de livraison.');
      }
      setToken(res.token);
      onLogin(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="card">
        <div className="app-icon"><Icon name="bike" size={38} /></div>
        <h1>LETO</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>Back-office des livraisons</p>
        <form onSubmit={submit}>
          <input placeholder="Téléphone" inputMode="tel" autoComplete="username" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input type="password" placeholder="Mot de passe" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="alert error">{error}</div>}
          <button className="btn lg" type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        </form>
      </div>
    </div>
  );
}
