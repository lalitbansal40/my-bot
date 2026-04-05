import { Router } from "express";
import {
  verifyWebhook,
  receiveMessage,
  // recievePayment,
} from "../controllers/webhook.controller";

const router = Router();


router.get("/instagram/callback", async (req, res) => {
  try {
    const code = req.query.code;

    console.log("INSTAGRAM AUTH CODE:", code);

    if (!code) {
      return res.send("No code received ❌");
    }

    // 👉 Yaha tu access token exchange karega (next step)
    res.send("Instagram connected successfully ✅");
  } catch (err) {
    console.error(err);
    res.send("Error ❌");
  }
});

router.get("/", verifyWebhook);
router.post("/", receiveMessage);
// router.post("/payment",recievePayment)

export default router;
