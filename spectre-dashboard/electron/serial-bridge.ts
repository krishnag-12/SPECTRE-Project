// =============================================================================
// S.P.E.C.T.R.E. TCC — Live Serial Bridge
// =============================================================================
export {};

const { Server } = require('socket.io');
const { SerialPort } = require('serialport');

const NODE_ID_PATTERN = /^[A-Za-z]+-\d+$/;
const COMMAND_TYPES = new Set(['PING', 'REKEY', 'ZERO']);

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTelemetryPacket(packet) {
  return packet
    && typeof packet === 'object'
    && typeof packet.nodeId === 'string'
    && NODE_ID_PATTERN.test(packet.nodeId)
    && Number.isInteger(packet.msgId)
    && Number.isInteger(packet.hopCount)
    && typeof packet.status === 'string'
    && isFiniteNumber(packet.posX)
    && isFiniteNumber(packet.posY)
    && isFiniteNumber(packet.rssi)
    && isFiniteNumber(packet.snr)
    && isFiniteNumber(packet.anomalyScore)
    && typeof packet.payload === 'string'
    && Number.isInteger(packet.timestamp);
}

function isCommandAck(payload) {
  return payload
    && typeof payload === 'object'
    && payload.kind === 'ack'
    && typeof payload.commandId === 'string'
    && typeof payload.nodeId === 'string'
    && COMMAND_TYPES.has(payload.type)
    && typeof payload.success === 'boolean'
    && typeof payload.outcomeCode === 'string'
    && Number.isInteger(payload.timestamp);
}

function startSerialBridge(httpServer, ipcMain) {
  const ioServer = new Server(httpServer, {
    cors: { origin: '*' },
  });

  let serialPort = null;
  let droppedFrames = 0;
  let lineBuffer = '';

  const emitStats = () => {
    ioServer.emit('bridge_stats', {
      mode: 'LIVE',
      droppedFrames,
      connected: !!(serialPort && serialPort.isOpen),
      portPath: serialPort?.path ?? null,
    });
  };

  const statsInterval = setInterval(emitStats, 1000);

  const handleSerialLine = (rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      droppedFrames += 1;
      emitStats();
      return;
    }

    if (isCommandAck(parsed)) {
      ioServer.emit('command_ack', {
        commandId: parsed.commandId,
        nodeId: parsed.nodeId,
        type: parsed.type,
        success: parsed.success,
        outcomeCode: parsed.outcomeCode,
        timestamp: parsed.timestamp,
      });
      return;
    }

    if (!isTelemetryPacket(parsed)) {
      droppedFrames += 1;
      emitStats();
      return;
    }

    ioServer.emit('telemetry_matrix', [parsed]);
  };

  const attachSerialListeners = (port) => {
    port.on('data', (chunk) => {
      lineBuffer += chunk.toString('utf8');
      let newlineIndex = lineBuffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = lineBuffer.slice(0, newlineIndex);
        lineBuffer = lineBuffer.slice(newlineIndex + 1);
        handleSerialLine(line);
        newlineIndex = lineBuffer.indexOf('\n');
      }
    });

    port.on('error', () => {
      emitStats();
    });

    port.on('close', () => {
      serialPort = null;
      lineBuffer = '';
      emitStats();
    });
  };

  const disconnectPort = async () => {
    if (!serialPort || !serialPort.isOpen) return;
    const activePort = serialPort;
    await new Promise((resolve, reject) => {
      activePort.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(undefined);
      });
    });
  };

  ipcMain.handle('serial:list', async () => {
    const ports = await SerialPort.list();
    return ports.map((port) => ({
      path: port.path,
      manufacturer: port.manufacturer ?? '',
      serialNumber: port.serialNumber ?? '',
      vendorId: port.vendorId ?? '',
      productId: port.productId ?? '',
    }));
  });

  ipcMain.handle('serial:status', async () => ({
    connected: !!(serialPort && serialPort.isOpen),
    portPath: serialPort?.path ?? null,
    droppedFrames,
  }));

  ipcMain.handle('serial:connect', async (_event, portPath) => {
    if (typeof portPath !== 'string' || !portPath.trim()) {
      return { ok: false, error: 'INVALID_PORT_PATH' };
    }

    if (serialPort && serialPort.isOpen) {
      await disconnectPort();
    }

    const nextPort = new SerialPort({
      path: portPath.trim(),
      baudRate: 115200,
      autoOpen: false,
    });

    await new Promise((resolve, reject) => {
      nextPort.open((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(undefined);
      });
    });

    serialPort = nextPort;
    lineBuffer = '';
    attachSerialListeners(nextPort);
    emitStats();
    return { ok: true };
  });

  ipcMain.handle('serial:disconnect', async () => {
    await disconnectPort();
    emitStats();
    return { ok: true };
  });

  ioServer.on('connection', (socket) => {
    socket.on('command', (command) => {
      if (!serialPort || !serialPort.isOpen) {
        socket.emit('command_ack', {
          commandId: command?.commandId ?? 'unknown',
          nodeId: command?.nodeId ?? 'unknown',
          type: command?.type ?? 'PING',
          success: false,
          outcomeCode: 'SERIAL_DISCONNECTED',
          timestamp: Math.floor(Date.now() / 1000),
        });
        return;
      }

      const type = command?.type;
      const nodeId = command?.nodeId;
      const commandId = command?.commandId;
      if (!COMMAND_TYPES.has(type) || typeof nodeId !== 'string' || typeof commandId !== 'string') {
        socket.emit('command_ack', {
          commandId: commandId ?? 'unknown',
          nodeId: nodeId ?? 'unknown',
          type: type ?? 'PING',
          success: false,
          outcomeCode: 'INVALID_COMMAND',
          timestamp: Math.floor(Date.now() / 1000),
        });
        return;
      }

      const serialLine = `CMD:${type}:${nodeId}:${commandId}\n`;
      serialPort.write(serialLine, (error) => {
        if (error) {
          socket.emit('command_ack', {
            commandId,
            nodeId,
            type,
            success: false,
            outcomeCode: 'SERIAL_WRITE_FAIL',
            timestamp: Math.floor(Date.now() / 1000),
          });
        }
      });
    });
  });

  emitStats();

  return () => {
    clearInterval(statsInterval);
    if (serialPort?.isOpen) {
      serialPort.close();
    }
    ioServer.close();
  };
}

module.exports = { startSerialBridge };
