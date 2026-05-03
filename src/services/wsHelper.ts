import { pushToAccountLocal } from "./localWsStore";

export const pushToAccount = async (accountId: string, data: any) => {
  try {
    pushToAccountLocal(accountId, data);
  } catch (_) {
    // WebSocket push is best-effort, never block main flow
  }
};
