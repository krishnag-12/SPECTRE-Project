export type TrustState = 'trusted' | 'pending';
export type CommandType = 'PING' | 'REKEY' | 'ZERO';

export interface TelemetryPacket {
  nodeId: string;
  msgId: number;
  hopCount: number;
  status: string;
  posX: number;
  posY: number;
  rssi: number;
  snr: number;
  anomalyScore: number;
  payload: string;
  timestamp: number;
}

export interface BridgeStats {
  mode?: 'MOCK' | 'LIVE';
  droppedFrames: number;
  connected: boolean;
  portPath: string | null;
}

export interface CommandPayload {
  type: CommandType;
  nodeId: string;
}

export interface CommandAttempt extends CommandPayload {
  commandId: string;
}

export interface CommandAck extends CommandAttempt {
  success: boolean;
  outcomeCode: string;
  timestamp: number;
}
