import express from 'express';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Serve Vite production build static files
app.use(express.static(path.join(__dirname, 'dist')));

// Serve index.html as fallback for React routing (SPA)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// Start HTTP Server
const server = app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(` Servidor de Álbum de Figuritas activo en puerto ${PORT}`);
  console.log(` Servidor WS de Intercambios listo en /trade`);
  console.log(`===================================================`);
});

// Initialize WebSocket Server
const wss = new WebSocketServer({ noServer: true });

// Attach WS server to the HTTP server on path '/trade'
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  
  if (pathname === '/trade') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Rooms dictionary to manage active trading sessions
// Schema:
// rooms[roomId] = {
//   host: { ws, nickname, offers: [], confirmed: false },
//   guest: { ws, nickname, offers: [], confirmed: false }
// }
const rooms = {};

wss.on('connection', (ws) => {
  let userRoomId = null;
  let userRole = null; // 'host' or 'guest'

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'join': {
          const { roomId, nickname } = data;
          userRoomId = roomId;

          // If room doesn't exist, create it and set user as Host
          if (!rooms[roomId]) {
            rooms[roomId] = {
              host: { ws, nickname, offers: [], confirmed: false },
              guest: null
            };
            userRole = 'host';
            ws.send(JSON.stringify({ type: 'joined' }));
            console.log(`[Room ${roomId}] Host "${nickname}" creado la sala.`);
          } 
          // If room exists and Guest slot is empty, join as Guest
          else if (!rooms[roomId].guest) {
            rooms[roomId].guest = {
              ws,
              nickname,
              offers: [],
              confirmed: false
            };
            userRole = 'guest';
            
            // Notify both users
            const host = rooms[roomId].host;
            const guest = rooms[roomId].guest;
            
            ws.send(JSON.stringify({ type: 'joined' }));
            ws.send(JSON.stringify({ type: 'peer-join', peerName: host.nickname }));
            host.ws.send(JSON.stringify({ type: 'peer-join', peerName: guest.nickname }));
            
            console.log(`[Room ${roomId}] Guest "${nickname}" se unió a la sala.`);
          } 
          // Room is full (host and guest slots occupied)
          else {
            ws.send(JSON.stringify({ type: 'error', message: 'La sala está llena.' }));
            ws.close();
          }
          break;
        }

        case 'update-offer': {
          if (!userRoomId || !userRole) return;
          const room = rooms[userRoomId];
          const self = room[userRole];
          const peer = userRole === 'host' ? room.guest : room.host;
          
          self.offers = data.offers;
          
          // Clear confirmations when offer changes to prevent accidental locks
          self.confirmed = false;
          if (peer) {
            peer.confirmed = false;
            peer.ws.send(JSON.stringify({ type: 'peer-confirm', confirmed: false }));
          }
          self.ws.send(JSON.stringify({ type: 'peer-confirm', confirmed: false }));

          // Forward the updated offer to peer
          if (peer) {
            peer.ws.send(JSON.stringify({
              type: 'peer-update-offer',
              offers: self.offers
            }));
          }
          break;
        }

        case 'confirm': {
          if (!userRoomId || !userRole) return;
          const room = rooms[userRoomId];
          const self = room[userRole];
          const peer = userRole === 'host' ? room.guest : room.host;

          self.confirmed = data.confirmed;

          // Notify peer of confirmation state
          if (peer) {
            peer.ws.send(JSON.stringify({
              type: 'peer-confirm',
              confirmed: self.confirmed
            }));
          }

          // Check if both users have confirmed the trade
          if (room.host && room.guest && room.host.confirmed && room.guest.confirmed) {
            console.log(`[Room ${userRoomId}] ¡Intercambio ejecutado entre ${room.host.nickname} y ${room.guest.nickname}!`);
            
            const hostGive = room.host.offers;
            const guestGive = room.guest.offers;

            // Send completion event to both clients
            room.host.ws.send(JSON.stringify({
              type: 'trade-complete',
              myGive: hostGive,
              myGain: guestGive
            }));

            room.guest.ws.send(JSON.stringify({
              type: 'trade-complete',
              myGive: guestGive,
              myGain: hostGive
            }));

            // Reset trading state for another round if they stay
            room.host.offers = [];
            room.host.confirmed = false;
            room.guest.offers = [];
            room.guest.confirmed = false;
          }
          break;
        }
      }
    } catch (err) {
      console.error(`Error procesando mensaje:`, err);
    }
  });

  ws.on('close', () => {
    if (!userRoomId || !userRole) return;
    
    const room = rooms[userRoomId];
    if (!room) return;

    console.log(`[Room ${userRoomId}] Conexión cerrada para el rol "${userRole}".`);

    const peer = userRole === 'host' ? room.guest : room.host;
    
    // Clear self from room
    room[userRole] = null;

    if (peer) {
      // Notify remaining client that their peer left
      peer.ws.send(JSON.stringify({ type: 'peer-leave' }));
      
      // If host left, elevate guest to host role to wait for another user
      if (userRole === 'host') {
        rooms[userRoomId] = {
          host: { ws: peer.ws, nickname: peer.nickname, offers: [], confirmed: false },
          guest: null
        };
        console.log(`[Room ${userRoomId}] Guest ha sido promovido a Host.`);
      }
    } else {
      // Room is now empty, delete it
      delete rooms[userRoomId];
      console.log(`[Room ${userRoomId}] Sala vacía eliminada.`);
    }
  });
});
