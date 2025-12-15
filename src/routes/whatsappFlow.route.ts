import { Router } from "express";
import { whatsappFlowController } from "../controllers/whatsappFlow.controller";


const router = Router();

router.post("/:appName", whatsappFlowController);

export default router;
