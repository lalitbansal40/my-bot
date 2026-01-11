// routes/integration.routes.ts
import { Router } from "express";
import { configureBorzo, configureGoogleSheet } from "../controllers/integration.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.post(
    "/google-sheet",
    authMiddleware,
    configureGoogleSheet
);

router.post(
    "/borzo",
    authMiddleware,
    configureBorzo
);
export default router;
