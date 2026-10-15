export type TrustState = 'trusted' | 'pending';
export type CommandType = 'PING' | 'REKEY' | 'ZERO' | 'TEST_JAM';

// Sprint G: Cryptographic pipeline telemetry from AES-256-GCM
export interface CryptoTelemetry {
  algo: 'AES-256-GCM';
  iv: string;            // 24 hex chars (12 bytes)
  tag: string;           // 32 hex chars (16 bytes)
  ciphertext: string;    // Variable-length hex dump
  tagMatch: boolean;     // GMAC authentication result
}

// Sprint H: Edge-AI ML pipeline diagnostics from Isolation Forest
export interface MlTelemetry {
  f: number[];           // 8 engineered RF features [rssi, snr, nf, rssiDelta, nfDelta, rollMean, rollStd, nfRollStd]
  avgPath: number;       // Average Isolation Forest tree traversal depth
  rawScore: number;      // Pre-EWMA anomaly score
  ewma: number;          // Post-EWMA smoothed anomaly score
  cn: number;            // c(n) normalization constant
  trees: number;         // Number of trees in the forest
  ready: boolean;        // Ring buffer fully populated
}

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
  // Sprint G: Optional crypto pipeline data
  crypto?: CryptoTelemetry;
  // Sprint H: Optional ML diagnostics data
  ml?: MlTelemetry;
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
