import { Router, type IRouter } from "express";
import healthRouter from "./health";
import commuteRouter from "./commute";

const router: IRouter = Router();

router.use(healthRouter);
router.use(commuteRouter);

export default router;
