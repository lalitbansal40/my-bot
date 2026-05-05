import { Router } from "express";
import {
  creditWallet,
  getWallet,
  syncWalletMetaRates,
  updateWalletSettings,
} from "../controllers/wallet.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.use(authMiddleware);

router.get("/", getWallet);
router.put("/settings", updateWalletSettings);
router.post("/credit", creditWallet);
router.post("/sync-meta-rates", syncWalletMetaRates);

export default router;
