/* =========================
   TYPES
========================= */

import { AutomationNode } from "../models/automation.model";

export interface AutomationEdge {
  from: string;
  to: string;
  condition?: string;
}

/* =========================
   EDGE RESOLVER
========================= */

export const getNextNodeByCondition = (
  edges: AutomationEdge[],
  from: string,
  condition: string
): string | undefined => {
  const edge = edges.find(
    (e) => e.from === from && e.condition === condition
  );

  return edge?.to;
};


export const doesTriggerMatch = (
  text: string | undefined,
  triggerNode: { keywords?: string[] }
): boolean => {
  if (!text) return false;

  // If no keywords → allow all (optional behaviour)
  if (!triggerNode.keywords || triggerNode.keywords.length === 0) {
    return true;
  }

  return triggerNode.keywords.some(keyword =>
    text.toLowerCase().includes(keyword.toLowerCase())
  );
};
