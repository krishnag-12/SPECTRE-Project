// =============================================================================
// S.P.E.C.T.R.E. TCC — Web Serial Bridge
// Browser-native serial port communication using the Web Serial API.
// Replaces Socket.IO + Electron serial-bridge for browser-only mode.
// =============================================================================

import type { TelemetryPacket, CommandAck, CommandAttempt } from './types';

const NODE_ID_PATTERN = /^[A-Za-z]+-\d+$/;
const COMMAND_TYPES = new Set(['PING', 'REKEY', 'ZERO']);
const BAUD_RATE = 115200;

// ---- Packet validation (mirrors electron/serial-bridge.ts) ----

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTelemetryPacket(packet: unknown): packet is TelemetryPacket {
  if (!packet || typeof packet !== 'object') return false;
  const p = packet as Record<string, unknown>;
  return (
    typeof p.nodeId === 'string' &&
    NODE_ID_PATTERN.test(p.nodeId) &&
    Number.isInteger(p.msgId) &&
    Number.isInteger(p.hopCount) &&
    typeof p.status === 'string' &&
    isFiniteNumber(p.posX) &&
    isFiniteNumber(p.posY) &&
    isFiniteNumber(p.rssi) &&
    isFiniteNumber(p.snr) &&
    isFiniteNumber(p.anomalyScore) &&
    typeof p.payload === 'string' &&
    Number.isInteger(p.timestamp)
  );
}

function isCommandAck(payload: unknown): payload is CommandAck {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    p.kind === 'ack' &&
    typeof p.commandId === 'string' &&
    typeof p.nodeId === 'string' &&
    COMMAND_TYPES.has(p.type as string) &&
    typeof p.success === 'boolean' &&
    typeof p.outcomeCode === 'string' &&
    Number.isInteger(p.timestamp)
  );
}

// ---- Connection state ----

export type SerialConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WebSerialCallbacks {
  onTelemetry: (packets: TelemetryPacket[]) => void;
  onCommandAck: (ack: CommandAck) => void;
  onConnectionChange: (state: SerialConnectionState, portName: string | null) => void;
  onDroppedFrame: (reason: string) => void;
}

// ---- WebSerialBridge class ----

export class WebSerialBridge {
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private encoder = new TextEncoder();
  private callbacks: WebSerialCallbacks;
  private abortController: AbortController | null = null;
  private _state: SerialConnectionState = 'disconnected';
  private _portName: string | null = null;
  private droppedFrames = 0;

  constructor(callbacks: WebSerialCallbacks) {
    this.callbacks = callbacks;
  }

  get state(): SerialConnectionState {
    return this._state;
  }

  get portName(): string | null {
    return this._portName;
  }

  get dropped(): number {
    return this.droppedFrames;
  }

  static isSupported(): boolean {
    return 'serial' in navigator;
  }

  async connect(): Promise<void> {
    if (!WebSerialBridge.isSupported()) {
      this.setState('error', null);
      throw new Error('Web Serial API not supported in this browser. Use Chrome or Edge.');
    }

    this.setState('connecting', null);

    try {
      // Browser shows native port chooser dialog
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: BAUD_RATE });

      this.port = port;
      this._portName = (port.getInfo().usbVendorId ?? 'Serial') + '';
      this.abortController = new AbortController();

      // Set up writer
      if (port.writable) {
        this.writer = port.writable.getWriter();
      }

      this.setState('connected', this._portName);

      // Start reading loop
      this.readLoop();

      // Listen for disconnect
      port.addEventListener('disconnect', () => {
        this.handleDisconnect();
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // User cancelled the port chooser — not an error
      if (msg.includes('No port selected') || msg.includes('cancelled') || msg.includes('user gesture')) {
        this.setState('disconnected', null);
      } else {
        this.setState('error', null);
      }
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.abortController?.abort();
      if (this.reader) {
        try { await this.reader.cancel(); } catch { /* ignore */ }
        this.reader.releaseLock();
        this.reader = null;
      }
      if (this.writer) {
        try { await this.writer.close(); } catch { /* ignore */ }
        this.writer.releaseLock();
        this.writer = null;
      }
      if (this.port) {
        try { await this.port.close(); } catch { /* ignore */ }
        this.port = null;
      }
    } finally {
      this.setState('disconnected', null);
    }
  }

  async sendCommand(command: CommandAttempt): Promise<void> {
    if (!this.writer || this._state !== 'connected') {
      throw new Error('Serial port not connected');
    }

    // Format: CMD:<TYPE>:<nodeId>:<commandId>\n
    const line = `CMD:${command.type}:${command.nodeId}:${command.commandId}\n`;
    await this.writer.write(this.encoder.encode(line));
  }

  // ---- Internal ----

  private setState(state: SerialConnectionState, portName: string | null) {
    this._state = state;
    this._portName = portName;
    this.callbacks.onConnectionChange(state, portName);
  }

  private handleDisconnect() {
    this.reader = null;
    this.writer = null;
    this.port = null;
    this.setState('disconnected', null);
  }

  private async readLoop(): Promise<void> {
    if (!this.port?.readable) return;

    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = this.port.readable.pipeTo(textDecoder.writable as WritableStream<any>, {
      signal: this.abortController?.signal,
    }).catch(() => { /* aborted or port closed */ });

    this.reader = textDecoder.readable.getReader();
    let lineBuffer = '';

    try {
      while (true) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (!value) continue;

        lineBuffer += value;
        let newlineIndex = lineBuffer.indexOf('\n');
        while (newlineIndex !== -1) {
          const line = lineBuffer.slice(0, newlineIndex).trim();
          lineBuffer = lineBuffer.slice(newlineIndex + 1);
          if (line) this.handleSerialLine(line);
          newlineIndex = lineBuffer.indexOf('\n');
        }
      }
    } catch {
      // Stream aborted or port disconnected
    } finally {
      try { this.reader?.releaseLock(); } catch { /* ignore */ }
      await readableStreamClosed;
    }

    // If we exit the read loop, the port was disconnected
    if (this._state === 'connected') {
      this.handleDisconnect();
    }
  }

  private handleSerialLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      this.droppedFrames++;
      this.callbacks.onDroppedFrame('Malformed JSON');
      return;
    }

    if (isCommandAck(parsed)) {
      this.callbacks.onCommandAck(parsed);
      return;
    }

    if (isTelemetryPacket(parsed)) {
      this.callbacks.onTelemetry([parsed]);
      return;
    }

    // Valid JSON but unknown packet type — could be tactical or other
    // Try as telemetry anyway (tactical packets have extra fields but still pass validation)
    this.droppedFrames++;
    this.callbacks.onDroppedFrame('Unknown packet type');
  }
}
