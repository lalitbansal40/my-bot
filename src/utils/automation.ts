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
  edges: any[],
  currentNode: string,
  condition: string,
) => {
  const matched = edges.find(
    (edge) =>
      edge.from === currentNode &&
      String(edge.condition).trim() === String(condition).trim(),
  );

  console.log("👉 MATCHED EDGE:", matched);

  return matched?.to || null;
};

export const doesTriggerMatch = (
  text: string | undefined,
  triggerNode: { keywords?: string[] },
): boolean => {
  if (!text) return false;

  // If no keywords → allow all (optional behaviour)
  if (!triggerNode.keywords || triggerNode.keywords.length === 0) {
    return true;
  }

  return triggerNode.keywords.some((keyword) =>
    text.toLowerCase().includes(keyword.toLowerCase()),
  );
};
