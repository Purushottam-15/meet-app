const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static('public'));

// Store active rooms
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create room (Host)
  socket.on('create-room', ({ roomId, hostName }) => {
    socket.join(roomId);
    rooms.set(roomId, {
      hostId: socket.id,
      hostName: hostName,
      clients: []
    });
    socket.emit('room-created', { roomId });
    console.log(`Room created: ${roomId} by ${hostName}`);
  });

  // Join room (Client)
  socket.on('join-room', ({ roomId, clientName }) => {
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
    
    // Notify host about new client
    io.to(room.hostId).emit('client-joined', {
      clientId: socket.id,
      clientName: clientName,
      totalClients: room.clients.length
    });

    // Send host info to client
    socket.emit('joined-room', {
      hostId: room.hostId,
      hostName: room.hostName
    });

    socket.to(roomId).emit('new-participant', {    // Notify all other clients about new participant
      participantId: socket.id,
      participantName: clientName
    });

    const existingParticipants = room.clients    // Send existing participants to new client
      .filter(c => c.id !== socket.id)
      .map(c => ({ id: c.id, name: c.name }));
    
    socket.emit('existing-participants', {
      participants: existingParticipants,
      host: { id: room.hostId, name: room.hostName }
    });

    console.log(`${clientName} joined room ${roomId}`);
  });

  socket.on('offer', ({ target, offer }) => {   // WebRTC signaling
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

  // Handle disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Check if disconnected user was a host
    rooms.forEach((room, roomId) => {
      if (room.hostId === socket.id) {
        // Notify all clients that host left
        io.to(roomId).emit('host-left');
        rooms.delete(roomId);
        console.log(`Room ${roomId} closed - host left`);
      } else {
        // Remove client from room
        const clientIndex = room.clients.findIndex(c => c.id === socket.id);
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
const HOST = '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log(`Server running on port ${PORT}`);
});