import { Request, Response } from "express";
import Automation from "../models/automation.model";
import { AuthRequest } from "../types/auth.types";

/* =========================================
   1️⃣ GET ALL AUTOMATIONS (WITH FILTER)
========================================= */
export const getAutomations = async (req: AuthRequest, res: Response) => {
  try {
    const { channel_id } = req.query;
    const account_id = req.user?.account_id;

    const filter: any = {
      account_id,
      is_fallback_automation: false,
    };

    // 🔥 optional filter
    if (channel_id) {
      filter.channel_id = channel_id;
    }

    const automations = await Automation.find(filter)
      .select("_id name status channel_id channel_name createdAt updatedAt")
      .populate("channel_id", "name phone_number")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: automations,
    });
  } catch (error) {
    console.error("❌ getAutomations error:", error);
    return res.status(500).json({ success: false });
  }
};

/* =========================================
   2️⃣ PLAY / PAUSE AUTOMATION
========================================= */
export const toggleAutomationStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    console.log("👉 TOGGLE ID:", id);

    const automation = await Automation.findById(id);

    // ✅ MOST IMPORTANT FIX
    if (!automation) {
      return res.status(404).json({
        success: false,
        message: "Automation not found",
      });
    }

    automation.status =
      automation.status === "active" ? "paused" : "active";

    await automation.save();

    return res.json({
      success: true,
      data: automation,
    });

  } catch (error) {
    console.error("❌ TOGGLE ERROR:", error);

    // ✅ ALWAYS RETURN RESPONSE
    return res.status(500).json({
      success: false,
      message: "Internal error",
    });
  }
};

/* =========================================
   3️⃣ DELETE AUTOMATION
========================================= */
export const deleteAutomation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const automation = await Automation.findByIdAndDelete(id);

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: "Automation not found",
      });
    }

    return res.json({
      success: true,
      message: "Automation deleted successfully",
      data: {
        id,
      },
    });
  } catch (error) {
    console.error("❌ deleteAutomation error:", error);
    return res.status(500).json({ success: false });
  }
};

export const getAutomationById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const account_id = req.user?.account_id;

    const automation = await Automation.findOne({
      _id: id,
      account_id, // 🔥 security (important)
    })
      .populate("channel_id", "name phone_number")
      .lean();

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: "Automation not found",
      });
    }

    const triggerNode = automation.nodes?.find(
      (n: any) => n.type === "trigger"
    );

    if (triggerNode) {
      // 🔥 INJECT BACK INTO NODE
      triggerNode.triggerType =
        automation.keywords && automation.keywords.length > 0
          ? "keyword"
          : "all";

      triggerNode.keywords = automation.keywords || [];
    }

    return res.json({
      success: true,
      data: automation, // 🔥 full JSON (nodes + edges)
    });
  } catch (error) {
    console.error("❌ getAutomationById error:", error);
    return res.status(500).json({ success: false });
  }
};

export const createAutomation = async (req: AuthRequest, res: Response) => {
  try {
    const account_id = req.user?.account_id;

    const {
      name,
      channel_id,
      channel_name,
      nodes,
      edges,
      keywords = [],
      trigger, // 🔥
      trigger_config, // 🔥 carries slug + trigger_key for integration triggers
    } = req.body;

    // =========================
    // 🔒 BASIC VALIDATION
    // =========================
    if (!name || !channel_id || !nodes || !edges) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (!Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Nodes must be a non-empty array",
      });
    }

    if (!Array.isArray(edges)) {
      return res.status(400).json({
        success: false,
        message: "Edges must be an array",
      });
    }

    // =========================
    // 🔥 TRIGGER VALIDATION
    // =========================
    const allowedTriggers = [
      "new_message_received",
      "outgoing_message",
      "webhook_received",
      "call_completed",
      "call_missed",
      "integration_trigger",
    ];

    if (!trigger || !allowedTriggers.includes(trigger)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing trigger",
      });
    }

    // Integration triggers must include slug + trigger_key
    if (trigger === "integration_trigger") {
      if (!trigger_config?.slug || !trigger_config?.trigger_key) {
        return res.status(400).json({
          success: false,
          message: "integration_trigger requires trigger_config.slug and trigger_config.trigger_key",
        });
      }
    }

    // =========================
    // 🔥 CHECK TRIGGER NODE
    // =========================
    const hasTrigger = nodes.find((n: any) => n.type === "trigger");

    if (!hasTrigger) {
      return res.status(400).json({
        success: false,
        message: "Trigger node is required",
      });
    }

    // =========================
    // 🔥 SANITIZE NODES
    // =========================
    const sanitizedNodes = nodes.map((node: any) => ({
      ...node,
      id: node.id,
      type: node.type,
      position: node.position || { x: 0, y: 0 }
    }));

    // =========================
    // 🔥 SANITIZE EDGES
    // =========================
    const sanitizedEdges = edges.map((edge: any) => ({
      from: edge.from,
      to: edge.to,
      condition: edge.condition || "",
    }));

    // =========================
    // 🔥 CREATE AUTOMATION
    // =========================
    const automation = await Automation.create({
      name,
      channel_id,
      channel_name,
      account_id,
      nodes: sanitizedNodes,
      edges: sanitizedEdges,
      keywords,
      trigger, // ✅ FIXED (dynamic)
      ...(trigger_config && { trigger_config }),
      automation_type: "builder",
      status: "active",
      disable_automation: false,
      is_fallback_automation: false,
    });

    // =========================
    // ✅ RESPONSE
    // =========================
    return res.status(200).json({
      success: true,
      message: "Automation created successfully",
      data: automation,
    });

  } catch (error: any) {
    console.error("❌ createAutomation error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const updateAutomation = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const account_id = req.user?.account_id;

    const { name, nodes, edges, status, trigger_config } = req.body;

    const automation = await Automation.findOne({
      _id: id,
      account_id,
    });

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: "Automation not found",
      });
    }

    /* =========================
       VALIDATION
    ========================= */

    if (nodes) {
      const triggerNode = nodes.find((n: any) => n.type === "trigger");

      if (!triggerNode) {
        return res.status(400).json({
          success: false,
          message: "Trigger node is required",
        });
      }

      // ✅ SAVE KEYWORDS (MAIN FIX)
      automation.keywords =
        triggerNode.triggerType === "keyword"
          ? triggerNode.keywords || []
          : [];

      const sanitizeNodes = (nodes: any[]) => {
        return JSON.parse(JSON.stringify(nodes)).map((n: any) => {

          // 🔥 FIX NODE LEVEL BUTTONS
          if (typeof n.buttons === "string") {
            n.buttons = [];
          }
          if (!Array.isArray(n.buttons)) {
            n.buttons = [];
          }

          // 🔥 FIX CARDS
          if (Array.isArray(n.cards)) {
            n.cards = n.cards.map((card: any) => {
              let buttons = card.buttons;

              if (typeof buttons === "string") {
                buttons = [];
              }

              if (!Array.isArray(buttons)) {
                buttons = [];
              }

              buttons = buttons
                .filter((button: any) => button && typeof button === "object")
                .map((button: any) => ({
                  id: String(button.id || ""),
                  title: String(button.title || ""),
                  type: String(button.type || "quick_reply"),
                  nextNode: String(button.nextNode || ""),
                  ...(button.url && { url: String(button.url) }),
                }))
                .filter((button: any) => button.id && button.title);

              return {
                ...card,
                buttons,
              };
            });
          }

          return n;
        });
      };

      const cleanNodes = sanitizeNodes(nodes);

      await Automation.updateOne(
        { _id: id, account_id },
        {
          $set: {
            nodes: cleanNodes,
            ...(name !== undefined && { name }),
            ...(status !== undefined && { status }),
            ...(trigger_config !== undefined && { trigger_config }),
            ...(edges && {
              edges: edges.map((e: any) => ({
                from: e.from,
                to: e.to,
                condition: e.condition || "",
              })),
            }),
            keywords:
              triggerNode.triggerType === "keyword"
                ? triggerNode.keywords || []
                : [],
          },
        },
        { strict: false } // 🔥 VERY IMPORTANT
      );


    }

    /* =========================
       UPDATE BASIC FIELDS
    ========================= */

    if (name !== undefined) automation.name = name;
    if (status !== undefined) automation.status = status;

    /* =========================
       SAVE EDGES
    ========================= */

    if (edges) {
      automation.edges = edges.map((e: any) => ({
        from: e.from,
        to: e.to,
        condition: e.condition || "",
      }));
    }


    return res.json({
      success: true,
      message: "Automation updated successfully",
      data: automation,
    });

  } catch (error) {
    console.error("❌ updateAutomation error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
