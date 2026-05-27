import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { authenticate }   from '../middleware/auth.middleware.js';

const router = Router();

// Step 1 – validate credentials → OTP sent to email (no JWT yet)
router.post('/login',      AuthController.login);

// Step 2 – submit OTP → receive JWT
router.post('/verify-otp', AuthController.verifyOtp);

// Session management
router.post('/logout', AuthController.logout);
router.get('/me',  authenticate, AuthController.me);

export default router;
