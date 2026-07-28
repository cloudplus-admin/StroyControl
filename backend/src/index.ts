import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

io.on('connection', (socket) => {
  socket.on('disconnect', () => {});
});

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`StroyControl backend listening on :${port}`);
});
