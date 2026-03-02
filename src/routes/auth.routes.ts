import { Router } from "express";
import { getMe, login, register } from "../controllers/auth.conroller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me",authMiddleware, getMe);


export default router;
