import { AutomationEdge } from "../types/automation";

export const getNextNodeId = (
  edges: AutomationEdge[],
  currentNodeId: string
): string | null => {
  return edges.find(e => e.from === currentNodeId)?.to || null;
};
