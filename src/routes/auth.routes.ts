import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller.js';
import { authenticate }   from '../middleware/auth.middleware.js';

const router = Router();

// Validate credentials → issue JWT immediately
router.post('/login', AuthController.login);

// Session management
router.post('/logout', authenticate, AuthController.logout);
router.get('/me',  authenticate, AuthController.me);

export default router;
