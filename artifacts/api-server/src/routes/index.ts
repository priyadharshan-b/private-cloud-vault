import { Router, type IRouter } from "express";
import healthRouter from "./health";
import cloudRouter from "./cloud";

const router: IRouter = Router();

router.use(healthRouter);
router.use(cloudRouter);

export default router;
