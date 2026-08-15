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
}
