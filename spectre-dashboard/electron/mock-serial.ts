// =============================================================================
// S.P.E.C.T.R.E. TCC — Mock Serial Data Simulator
// =============================================================================
export {};

const { Server } = require('socket.io');

function startMockStream(httpServer) {
  const ioServer = new Server(httpServer, {
    cors: { origin: '*' },
  });

  const nodes = [
    { nodeId: 'Alpha-1', posX: 40, posY: 60, angle: 0.5, status: 'ACTIVE', baseRssi: -65 },
    { nodeId: 'Bravo-3', posX: -80, posY: -30, angle: 2.1, status: 'ACTIVE', baseRssi: -72 },
    { nodeId: 'Charlie-2', posX: 110, posY: -90, angle: 4.3, status: 'ACTIVE', baseRssi: -78 },
  ];

  let tickCount = 0;

  const statsInterval = setInterval(() => {
    ioServer.emit('bridge_stats', {
      mode: 'MOCK',
      droppedFrames: 0,
      connected: true,
      portPath: 'mock://spectre',
    });
  }, 1000);

  const interval = setInterval(() => {
    tickCount++;

    const telemetryPackets = nodes.map((node) => {
      node.posX += Math.sin(node.angle) * 1.2;
      node.posY += Math.cos(node.angle) * 1.2;
      node.angle += (Math.random() - 0.5) * 0.2;

      const dist = Math.sqrt(node.posX * node.posX + node.posY * node.posY);
      if (dist > 450) {
        node.angle += Math.PI;
      }

      const isJammed = Math.random() > 0.95;
      const rssiJitter = Math.floor(Math.random() * 15);

      return {
        nodeId: node.nodeId,
        msgId: tickCount * 10 + nodes.indexOf(node),
        hopCount: Math.random() > 0.8 ? 2 : 1,
        status: isJammed ? 'COMPROMISED' : node.status,
        posX: parseFloat(node.posX.toFixed(2)),
        posY: parseFloat(node.posY.toFixed(2)),
        rssi: isJammed ? node.baseRssi - 25 - rssiJitter : node.baseRssi - rssiJitter,
        snr: isJammed
          ? parseFloat((Math.random() * 2).toFixed(1))
          : parseFloat((6 + Math.random() * 5).toFixed(1)),
        anomalyScore: isJammed
          ? parseFloat((0.8 + Math.random() * 0.2).toFixed(2))
          : parseFloat((Math.random() * 0.2).toFixed(2)),
        payload: isJammed
          ? '▲ LINK CORRUPTED // JAMMING DETECTED'
          : 'Secured heartbeat transmission nominal.',
        timestamp: Math.floor(Date.now() / 1000),
      };
    });

    ioServer.emit('telemetry_matrix', telemetryPackets);
  }, 1000);

  ioServer.on('connection', (socket) => {
    console.log(`[MOCK SERIAL] Dashboard client connected: ${socket.id}`);

    socket.on('command', (cmd) => {
      if (!cmd?.commandId || !cmd?.nodeId || !cmd?.type) return;

      const targetNode = nodes.find((n) => n.nodeId === cmd.nodeId);
      const ack = {
        commandId: cmd.commandId,
        nodeId: cmd.nodeId,
        type: cmd.type,
        success: !!targetNode,
        outcomeCode: targetNode ? 'ACKED' : 'UNKNOWN_NODE',
        timestamp: Math.floor(Date.now() / 1000),
      };

      if (targetNode && cmd.type === 'ZERO') {
        targetNode.status = 'ZEROIZED';
      }

      socket.emit('command_ack', ack);
    });

    socket.on('disconnect', () => {
      console.log(`[MOCK SERIAL] Dashboard client disconnected: ${socket.id}`);
    });
  });

  console.log('[MOCK SERIAL] Active: Broadcasting simulated tactical data streams...');

  return () => {
    clearInterval(interval);
    clearInterval(statsInterval);
    ioServer.close();
  };
}

module.exports = { startMockStream };
