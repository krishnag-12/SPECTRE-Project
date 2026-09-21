export {};

declare global {
  interface Window {
    spectre?: {
      window?: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      serial?: {
        connect: (port: string) => Promise<{ ok: boolean; error?: string }>;
        disconnect: () => Promise<{ ok: boolean; error?: string }>;
        getStatus: () => Promise<unknown>;
        listPorts: () => Promise<Array<{ path: string; manufacturer?: string }>>;
      };
      platform?: string;
    };
  }

  // Web Serial API type declarations (Chrome/Edge)
  interface SerialPort {
    readonly readable: ReadableStream<Uint8Array> | null;
    readonly writable: WritableStream<Uint8Array> | null;
    open(options: SerialOptions): Promise<void>;
    close(): Promise<void>;
    getInfo(): SerialPortInfo;
    addEventListener(type: 'disconnect', listener: () => void): void;
    removeEventListener(type: 'disconnect', listener: () => void): void;
  }

  interface SerialOptions {
    baudRate: number;
    dataBits?: number;
    stopBits?: number;
    parity?: 'none' | 'even' | 'odd';
    bufferSize?: number;
    flowControl?: 'none' | 'hardware';
  }

  interface SerialPortInfo {
    usbVendorId?: number;
    usbProductId?: number;
  }

  interface SerialPortRequestOptions {
    filters?: Array<{ usbVendorId?: number; usbProductId?: number }>;
  }

  interface Serial extends EventTarget {
    requestPort(options?: SerialPortRequestOptions): Promise<SerialPort>;
    getPorts(): Promise<SerialPort[]>;
  }

  interface Navigator {
    readonly serial: Serial;
  }
}
