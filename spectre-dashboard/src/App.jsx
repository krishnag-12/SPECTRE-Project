// =============================================================================
// S.P.E.C.T.R.E. TCC — Root Application Component
// Three-panel layout with Socket.IO real-time telemetry state management
// =============================================================================

import React, { useReducer, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import TitleBar from './components/TitleBar.jsx';
import NodeTelemetryPanel from './components/NodeTelemetryPanel.jsx';
import RadarMap from './components/RadarMap.jsx';
import C2Panel from './components/C2Panel.jsx';
import StatusBar from './components/StatusBar.jsx';

// ---- Telemetry State Reducer ----
const initialState = {
  nodes: {},            // Map of nodeId -> latest telemetry
  selectedNodeId: null, // Currently selected node for C2 panel
  eventLog: [],         // Reverse-chronological event stream
  stats: {
    packetsReceived: 0,
    droppedFrames: 0,
    uptime: 0,
    connected: false,
  },
};

function telemetryReducer(state, action) {
  switch (action.type) {
    case 'TELEMETRY_UPDATE': {
      const newNodes = { ...state.nodes };
      const newEvents = [...state.eventLog];

      action.payload.forEach((packet) => {
        const prev = newNodes[packet.nodeId];
        newNodes[packet.nodeId] = {
          ...packet,
          lastSeen: Date.now(),
          history: prev?.history
            ? [...prev.history.slice(-29), packet.rssi]
            : [packet.rssi],
        };

        // Log anomaly events
        if (packet.anomalyScore > 0.7) {
          newEvents.unshift({
            id: `${packet.nodeId}-${Date.now()}`,
            time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
            severity: 'critical',
            message: `⚠ EW THREAT: ${packet.nodeId} — Anomaly Score ${packet.anomalyScore} | RSSI ${packet.rssi} dBm`,
          });
        }

        // Log status changes
        if (prev && prev.status !== packet.status) {
          newEvents.unshift({
            id: `status-${packet.nodeId}-${Date.now()}`,
            time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
            severity: packet.status === 'COMPROMISED' ? 'critical' : packet.status === 'ZEROIZED' ? 'critical' : 'normal',
            message: `${packet.nodeId} status → ${packet.status}`,
          });
        }
      });

      // Cap event log at 100 entries
      if (newEvents.length > 100) newEvents.length = 100;

      return {
        ...state,
        nodes: newNodes,
        eventLog: newEvents,
        stats: {
          ...state.stats,
          packetsReceived: state.stats.packetsReceived + action.payload.length,
          connected: true,
        },
      };
    }

    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.payload };

    case 'COMMAND_ACK': {
      const newEvents = [
        {
          id: `cmd-${Date.now()}`,
          time: new Date().toLocaleTimeString('en-IN', { hour12: false }),
          severity: 'critical',
          message: `✦ COMMAND EXECUTED: ${action.payload.type} → ${action.payload.nodeId} [${action.payload.success ? 'SUCCESS' : 'FAILED'}]`,
        },
        ...state.eventLog,
      ];
      return { ...state, eventLog: newEvents };
    }

    case 'UPDATE_UPTIME':
      return {
        ...state,
        stats: { ...state.stats, uptime: action.payload },
      };

    case 'DISCONNECT':
      return {
        ...state,
        stats: { ...state.stats, connected: false },
      };

    default:
      return state;
  }
}

// ---- Main App Component ----
export default function App() {
  const [state, dispatch] = useReducer(telemetryReducer, initialState);
  const socketRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  // Socket.IO connection
  useEffect(() => {
    const socket = io('http://127.0.0.1:3001', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('telemetry_matrix', (packets) => {
      dispatch({ type: 'TELEMETRY_UPDATE', payload: packets });
    });

    socket.on('command_ack', (ack) => {
      dispatch({ type: 'COMMAND_ACK', payload: ack });
    });

    socket.on('disconnect', () => {
      dispatch({ type: 'DISCONNECT' });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Uptime ticker
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      dispatch({ type: 'UPDATE_UPTIME', payload: elapsed });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Command sender
  const sendCommand = useCallback((cmd) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('command', cmd);
    }
  }, []);

  // Node selection
  const selectNode = useCallback((nodeId) => {
    dispatch({ type: 'SELECT_NODE', payload: nodeId });
  }, []);

  const nodesArray = Object.values(state.nodes);
  const selectedNode = state.selectedNodeId ? state.nodes[state.selectedNodeId] : null;

  return (
    <div className="tcc-app">
      <TitleBar connected={state.stats.connected} />

      <div className="tcc-main">
        {/* Left Panel: Node Telemetry & EW Status */}
        <div className="panel panel--left">
          <NodeTelemetryPanel
            nodes={nodesArray}
            selectedNodeId={state.selectedNodeId}
            onSelectNode={selectNode}
            eventLog={state.eventLog}
          />
        </div>

        {/* Center Panel: Tactical Radar Map */}
        <div className="panel panel--center">
          <RadarMap
            nodes={nodesArray}
            selectedNodeId={state.selectedNodeId}
            onSelectNode={selectNode}
          />
        </div>

        {/* Right Panel: C2 Actions */}
        <div className="panel panel--right">
          <C2Panel
            selectedNode={selectedNode}
            onSendCommand={sendCommand}
            onDeselectNode={() => selectNode(null)}
          />
        </div>
      </div>

      <StatusBar stats={state.stats} nodeCount={nodesArray.length} />

      {/* CRT scanline overlay */}
      <div className="crt-overlay" />
    </div>
  );
}
