import 'dotenv/config';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createApp } from './app';

const app = createApp();

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  socket.on('disconnect', () => {});
});

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`StroyControl backend listening on :${port}`);
});
