import { Router } from "express";
import { GSTRate } from "../models/index.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/gst-rates", async (req, res) => {
  try {
    const rates = await GSTRate.find();
    res.json({ success: true, data: rates });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post("/gst-rates", authenticate, async (req, res) => {
  try {
    const { label } = req.body;

    if (label) {
      const exists = await GSTRate.findOne({ label });
      if (exists)
        return res.status(400).json({ success: false, message: "Already exists" });
      const gstRate = await GSTRate.create({ label });
      return res.json({ success: true, data: gstRate });
    }

    const rate = Number(String(req.body.rate).replace("%", "").trim());
    if (isNaN(rate) || rate < 0 || rate > 100)
      return res.status(400).json({ success: false, message: "Invalid GST rate" });
    const exists = await GSTRate.findOne({ rate });
    if (exists)
      return res.status(400).json({ success: false, message: "Rate already exists" });
    const gstRate = await GSTRate.create({ rate });
    res.json({ success: true, data: gstRate });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.delete("/gst-rates/:id", authenticate, async (req, res) => {
  try {
    await GSTRate.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
