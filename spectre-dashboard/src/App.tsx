// =============================================================================
// S.P.E.C.T.R.E. TCC — Root Application Component
// =============================================================================

import React, { useReducer, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import TitleBar from './components/TitleBar';
import NodeTelemetryPanel from './components/NodeTelemetryPanel';
import RadarMap from './components/RadarMap';
import C2Panel from './components/C2Panel';
import StatusBar from './components/StatusBar';
import type {
  BridgeStats,
  CommandAck,
  CommandAttempt,
  CommandPayload,
  CommandType,
  TelemetryPacket,
  TrustState,
} from './types';

const NODE_ID_PATTERN = /^[A-Za-z]+-\d+$/;
const ACK_TIMEOUT_MS = 5000;

interface NodeTelemetry extends TelemetryPacket {
  lastSeen: number;
  history: number[];
  trustState: TrustState;
}

interface AppState {
  nodes: Record<string, NodeTelemetry>;
  selectedNodeId: string | null;
  eventLog: Array<{ id: string; time: string; severity: 'normal' | 'warning' | 'critical'; message: string }>;
  stats: {
    packetsReceived: number;
    droppedFrames: number;
    uptime: number;
    connected: boolean;
    mode: 'MOCK' | 'LIVE';
    portPath: string | null;
  };
  pendingCommands: Record<string, CommandAttempt>;
}

type Action =
  | { type: 'TELEMETRY_UPDATE'; payload: TelemetryPacket[] }
  | { type: 'SELECT_NODE'; payload: string | null }
  | { type: 'COMMAND_SENT'; payload: CommandAttempt }
  | { type: 'COMMAND_ACK'; payload: CommandAck }
  | { type: 'COMMAND_TIMEOUT'; payload: { commandId: string } }
  | { type: 'UPDATE_UPTIME'; payload: number }
  | { type: 'DISCONNECT' }
  | { type: 'BRIDGE_STATS'; payload: BridgeStats }
  | { type: 'LOCAL_DROP'; payload: { reason: string } }
  | { type: 'TRUST_NODE'; payload: { nodeId: string } };

const initialState: AppState = {
  nodes: {},
  selectedNodeId: null,
  eventLog: [],
  stats: {
    packetsReceived: 0,
    droppedFrames: 0,
    uptime: 0,
    connected: false,
    mode: 'MOCK',
    portPath: null,
  },
  pendingCommands: {},
};

function nowTime() {
  return new Date().toLocaleTimeString('en-IN', { hour12: false });
}

function telemetryReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'TELEMETRY_UPDATE': {
      const newNodes = { ...state.nodes };
      const newEvents = [...state.eventLog];
      let receivedCount = 0;

      action.payload.forEach((packet) => {
        if (!NODE_ID_PATTERN.test(packet.nodeId)) {
          newEvents.unshift({
            id: `node-id-invalid-${Date.now()}-${Math.random()}`,
            time: nowTime(),
            severity: 'warning',
            message: `Invalid nodeId format dropped: ${packet.nodeId}`,
          });
          return;
        }

        const prev = newNodes[packet.nodeId];
        const trustState: TrustState = prev?.trustState ?? 'pending';
        newNodes[packet.nodeId] = {
          ...packet,
          trustState,
          lastSeen: Date.now(),
          history: prev?.history ? [...prev.history.slice(-29), packet.rssi] : [packet.rssi],
        };
        receivedCount += 1;

        if (!prev) {
          newEvents.unshift({
            id: `node-auto-enrolled-${packet.nodeId}-${Date.now()}`,
            time: nowTime(),
            severity: 'warning',
            message: `${packet.nodeId} auto-enrolled as telemetry-only (approval required for commands)`,
          });
        }

        if (packet.anomalyScore > 0.7) {
          newEvents.unshift({
            id: `${packet.nodeId}-${Date.now()}`,
            time: nowTime(),
            severity: 'critical',
            message: `⚠ EW THREAT: ${packet.nodeId} — Anomaly Score ${packet.anomalyScore} | RSSI ${packet.rssi} dBm`,
          });
        }

        if (prev && prev.status !== packet.status) {
          newEvents.unshift({
            id: `status-${packet.nodeId}-${Date.now()}`,
            time: nowTime(),
            severity: packet.status === 'COMPROMISED' || packet.status === 'ZEROIZED' ? 'critical' : 'normal',
            message: `${packet.nodeId} status → ${packet.status}`,
          });
        }
      });

      if (newEvents.length > 100) newEvents.length = 100;

      return {
        ...state,
        nodes: newNodes,
        eventLog: newEvents,
        stats: {
          ...state.stats,
          packetsReceived: state.stats.packetsReceived + receivedCount,
          connected: true,
        },
      };
    }

    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.payload };

    case 'COMMAND_SENT': {
      const pendingCommands = { ...state.pendingCommands, [action.payload.commandId]: action.payload };
      const eventLog = [
        {
          id: `cmd-pending-${action.payload.commandId}`,
          time: nowTime(),
          severity: 'warning' as const,
          message: `↗ COMMAND SENT: ${action.payload.type} → ${action.payload.nodeId} [PENDING ACK]`,
        },
        ...state.eventLog,
      ].slice(0, 100);
      return { ...state, pendingCommands, eventLog };
    }

    case 'COMMAND_ACK': {
      const pendingCommands = { ...state.pendingCommands };
      delete pendingCommands[action.payload.commandId];
      const eventLog = [
        {
          id: `cmd-ack-${action.payload.commandId}-${Date.now()}`,
          time: nowTime(),
          severity: action.payload.success ? ('normal' as const) : ('critical' as const),
          message: `✦ COMMAND ${action.payload.type} → ${action.payload.nodeId} [${action.payload.success ? 'SUCCESS' : 'FAILED'}:${action.payload.outcomeCode}]`,
        },
        ...state.eventLog,
      ].slice(0, 100);
      return { ...state, pendingCommands, eventLog };
    }

    case 'COMMAND_TIMEOUT': {
      const pending = state.pendingCommands[action.payload.commandId];
      if (!pending) return state;
      const pendingCommands = { ...state.pendingCommands };
      delete pendingCommands[action.payload.commandId];
      const eventLog = [
        {
          id: `cmd-timeout-${action.payload.commandId}-${Date.now()}`,
          time: nowTime(),
          severity: 'critical' as const,
          message: `✖ COMMAND TIMEOUT: ${pending.type} → ${pending.nodeId} [NO ACK IN 5s]`,
        },
        ...state.eventLog,
      ].slice(0, 100);
      return { ...state, pendingCommands, eventLog };
    }

    case 'UPDATE_UPTIME':
      return { ...state, stats: { ...state.stats, uptime: action.payload } };

    case 'DISCONNECT':
      return { ...state, stats: { ...state.stats, connected: false } };

    case 'BRIDGE_STATS':
      return {
        ...state,
        stats: {
          ...state.stats,
          droppedFrames: action.payload.droppedFrames,
          connected: action.payload.connected || state.stats.connected,
          mode: action.payload.mode ?? state.stats.mode,
          portPath: action.payload.portPath ?? state.stats.portPath,
        },
      };

    case 'LOCAL_DROP':
      return {
        ...state,
        stats: {
          ...state.stats,
          droppedFrames: state.stats.droppedFrames + 1,
        },
        eventLog: [
          {
            id: `local-drop-${Date.now()}`,
            time: nowTime(),
            severity: 'warning' as const,
            message: `Dropped local frame: ${action.payload.reason}`,
          },
          ...state.eventLog,
        ].slice(0, 100),
      };

    case 'TRUST_NODE': {
      const node = state.nodes[action.payload.nodeId];
      if (!node) return state;
      return {
        ...state,
        nodes: {
          ...state.nodes,
          [action.payload.nodeId]: {
            ...node,
            trustState: 'trusted',
          },
        },
        eventLog: [
          {
            id: `node-trusted-${action.payload.nodeId}-${Date.now()}`,
            time: nowTime(),
            severity: 'normal' as const,
            message: `${action.payload.nodeId} approved for command channel`,
          },
          ...state.eventLog,
        ].slice(0, 100),
      };
    }

    default:
      return state;
  }
}

export default function App() {
  const [state, dispatch] = useReducer(telemetryReducer, initialState);
  const socketRef = useRef<Socket | null>(null);
  const startTimeRef = useRef(Date.now());
  const timeoutMapRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const socket = io('http://127.0.0.1:3001', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('telemetry_matrix', (packets: TelemetryPacket[]) => {
      if (!Array.isArray(packets)) {
        dispatch({ type: 'LOCAL_DROP', payload: { reason: 'telemetry_matrix payload is not an array' } });
        return;
      }
      dispatch({ type: 'TELEMETRY_UPDATE', payload: packets });
    });

    socket.on('command_ack', (ack: CommandAck) => {
      if (timeoutMapRef.current[ack.commandId]) {
        window.clearTimeout(timeoutMapRef.current[ack.commandId]);
        delete timeoutMapRef.current[ack.commandId];
      }
      dispatch({ type: 'COMMAND_ACK', payload: ack });
    });

    socket.on('bridge_stats', (stats: BridgeStats) => {
      dispatch({ type: 'BRIDGE_STATS', payload: stats });
    });

    socket.on('disconnect', () => {
      dispatch({ type: 'DISCONNECT' });
    });

    return () => {
      Object.values(timeoutMapRef.current).forEach((timer) => window.clearTimeout(timer));
      timeoutMapRef.current = {};
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      dispatch({ type: 'UPDATE_UPTIME', payload: elapsed });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const sendCommand = useCallback((cmd: CommandPayload) => {
    const selectedNode = state.nodes[cmd.nodeId];
    if (!selectedNode || selectedNode.trustState !== 'trusted') {
      dispatch({ type: 'LOCAL_DROP', payload: { reason: `command blocked for untrusted node ${cmd.nodeId}` } });
      return;
    }

    if (socketRef.current?.connected) {
      const commandId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const attempt: CommandAttempt = { ...cmd, commandId };
      socketRef.current.emit('command', attempt);
      dispatch({ type: 'COMMAND_SENT', payload: attempt });
      timeoutMapRef.current[commandId] = window.setTimeout(() => {
        dispatch({ type: 'COMMAND_TIMEOUT', payload: { commandId } });
        delete timeoutMapRef.current[commandId];
      }, ACK_TIMEOUT_MS);
    }
  }, [state.nodes]);

  const approveNode = useCallback((nodeId: string) => {
    dispatch({ type: 'TRUST_NODE', payload: { nodeId } });
  }, []);

  const selectNode = useCallback((nodeId: string | null) => {
    dispatch({ type: 'SELECT_NODE', payload: nodeId });
  }, []);

  const nodesArray = Object.values(state.nodes);
  const selectedNode = state.selectedNodeId ? state.nodes[state.selectedNodeId] : null;

  return (
    <div className="tcc-app">
      <TitleBar connected={state.stats.connected} />

      <div className="tcc-main">
        <div className="panel panel--left">
          <NodeTelemetryPanel
            nodes={nodesArray}
            selectedNodeId={state.selectedNodeId}
            onSelectNode={selectNode}
            eventLog={state.eventLog}
          />
        </div>

        <div className="panel panel--center">
          <RadarMap
            nodes={nodesArray}
            selectedNodeId={state.selectedNodeId}
            onSelectNode={selectNode}
          />
        </div>

        <div className="panel panel--right">
          <C2Panel
            selectedNode={selectedNode}
            onSendCommand={sendCommand}
            onApproveNode={approveNode}
            onDeselectNode={() => selectNode(null)}
          />
        </div>
      </div>

      <StatusBar stats={state.stats} nodeCount={nodesArray.length} />
      <div className="crt-overlay" />
    </div>
  );
}
