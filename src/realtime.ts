import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';
import { refreshMapStyle } from './components/MapTiles';

/**
 * Connexion temps réel du back-office (ou de la page de suivi avec le jeton du lien).
 * Événement commun : `map:changed` → le fond de carte choisi par l'admin est rechargé partout.
 */
export function connectRealtime(auth: { token: string } | { trackToken: string }): Socket {
  const socket = io(API_URL, { auth, transports: ['websocket'], reconnection: true });
  socket.on('map:changed', () => { refreshMapStyle(); });
  // SA : nouvelle demande d'inscription d'une entreprise → liste et pastille du menu rechargées
  socket.on('companies:changed', () => { window.dispatchEvent(new Event('companies:changed')); });
  return socket;
}
