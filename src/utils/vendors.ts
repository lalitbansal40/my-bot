import CakeArena from "../services/cakeArena.service";

/**
 * Interface every Flow App must implement
 */
export interface FlowApp {
  getNextScreen(payload: any, appName: string): Promise<any>;
}

/**
 * Vendor configuration structure
 */
export interface VendorConfig {
  flowAppClass: new () => FlowApp;
}

/**
 * Vendors map
 */
const vendors: Record<string, VendorConfig> = {
  "cake-arena": {
    flowAppClass: CakeArena,
  },
};

export default vendors;
