const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));  // serve static files

const rooms = new Map();    // store active rooms

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', ({ roomId, hostName }) => {   // Create room -Host
    socket.join(roomId);
    rooms.set(roomId, {
      hostId: socket.id,
      hostName: hostName,
      clients: []
    });
    socket.emit('room-created', { roomId });
    console.log(`Room created: ${roomId} by ${hostName}`);
  });

  socket.on('join-room', ({ roomId, clientName }) => {   // join room -Client
    const room = rooms.get(roomId);
    
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    socket.join(roomId);
    const clientInfo = {
      id: socket.id,
      name: clientName
    };
    
    room.clients.push(clientInfo);
    
    io.to(room.hostId).emit('client-joined', {    // Notify host about new client
      clientId: socket.id,
      clientName: clientName,
      totalClients: room.clients.length
    });

    socket.emit('joined-room', {    // send host info to client

      hostId: room.hostId,
      hostName: room.hostName
    });

    console.log(`${clientName} joined room ${roomId}`);
  });

  socket.on('offer', ({ target, offer }) => {     // WebRTC signaling
    io.to(target).emit('offer', {
      offer: offer,
      sender: socket.id
    });
  });

  socket.on('answer', ({ target, answer }) => {
    io.to(target).emit('answer', {
      answer: answer,
      sender: socket.id
    });
  });

  socket.on('ice-candidate', ({ target, candidate }) => {
    io.to(target).emit('ice-candidate', {
      candidate: candidate,
      sender: socket.id
    });
  });

  socket.on('disconnect', () => {       // handle disconnect
    console.log('User disconnected:', socket.id);
    
    rooms.forEach((room, roomId) => {       // check if disconnected user was a host
      if (room.hostId === socket.id) {
        io.to(roomId).emit('host-left');            // notify all clients that host left
        rooms.delete(roomId);
        console.log(`Room ${roomId} closed - host left`);
      } else {
        const clientIndex = room.clients.findIndex(c => c.id === socket.id);          // remove client from room
        if (clientIndex > -1) {
          room.clients.splice(clientIndex, 1);
          io.to(room.hostId).emit('client-left', {
            clientId: socket.id,
            totalClients: room.clients.length
          });
        }
      }
    });
  });

  socket.on('leave-room', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      const clientIndex = room.clients.findIndex(c => c.id === socket.id);
      if (clientIndex > -1) {
        const clientName = room.clients[clientIndex].name;
        room.clients.splice(clientIndex, 1);
        socket.leave(roomId);
        io.to(room.hostId).emit('client-left', {
          clientId: socket.id,
          totalClients: room.clients.length
        });
        console.log(`${clientName} left room ${roomId}`);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
