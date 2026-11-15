import { FormEvent, useState } from 'react';
import { api, setToken, User } from '../api';

export default function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: { phone, password },
      });
      if (res.user.role !== 'COMPANY' && res.user.role !== 'SUPER_ADMIN') {
        throw new Error("Réservé aux entreprises de livraison. Utilisez l'application mobile.");
      }
      setToken(res.token);
      onLogin(res.user);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form className="card login" onSubmit={submit}>
      <h1>LETO</h1>
      <p className="muted">Espace entreprises de livraison</p>
      <input placeholder="Téléphone (ex : 0701020304)" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <button type="submit">Se connecter</button>
    </form>
  );
}
