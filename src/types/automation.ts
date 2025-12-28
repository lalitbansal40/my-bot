import { AutomationNode } from "../models/automation.model";

export type NodeType =
  | "trigger"
  | "auto_reply"
  | "ask_location"
  | "send_flow"
  | "send_utility_template";

export interface AutomationButton {
  id: string;      // payload / reply id
  title: string;   // button text (max 20 chars for WhatsApp)
}




export interface AutomationEdge {
  from: string;
  to: string;
}

export interface Automation {
  _id: string;
  channel_id: string;
  trigger: string;
  status: "active" | "paused";
  nodes: AutomationNode[];
  edges: AutomationEdge[];
}
