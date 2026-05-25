import type { HermesAPI } from "../shared/api-types";

interface ElectronAPI {
  process: {
    platform: NodeJS.Platform;
    versions: {
      chrome: string;
      electron: string;
      node: string;
    };
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
    hermesAPI: HermesAPI;
  }
}
