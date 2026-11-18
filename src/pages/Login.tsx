import { FormEvent, useState } from 'react';
import { api, setToken, User } from '../api';
import { Icon, PhoneInput, LetoMark } from '../ui';

/** Ouvert depuis leto.performx.online/pro (espace des entreprises) */
const PRO_SPACE = location.pathname.startsWith('/pro');

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
        <div className="app-icon"><LetoMark size={40} /></div>
        <h1>LETO</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>{PRO_SPACE ? 'Espace entreprise de livraison' : 'Back-office des livraisons'}</p>
        <form onSubmit={submit}>
          <PhoneInput value={phone} onChange={setPhone} label="Téléphone" autoComplete="username" />
          <input type="password" placeholder="Mot de passe" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="alert error">{error}</div>}
          <button className="btn lg" type="submit" disabled={busy}>{busy ? 'Connexion…' : 'Se connecter'}</button>
        </form>
      </div>
    </div>
  );
}
