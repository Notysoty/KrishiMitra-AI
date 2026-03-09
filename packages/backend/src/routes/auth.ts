import { Router, Request, Response } from 'express';
import { AuthService, AuthError } from '../services/auth';
import { authenticate, AuthenticatedRequest, requireHttps } from '../middleware/authenticate';

const router = Router();
const authService = new AuthService();

// Enforce HTTPS on all auth routes
router.use(requireHttps);

// POST /api/v1/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { phone, name, tenant_id, email, language_preference, roles } = req.body;
    if (!phone || !name || !tenant_id) {
      res.status(400).json({ error: 'phone, name, and tenant_id are required.' });
      return;
    }
    await authService.register({ phone, name, tenant_id, email, language_preference, roles });
    // Send OTP immediately after registration so the user can verify in one step
    const result = await authService.login(phone, tenant_id);
    res.status(201).json({ message: 'Account created. OTP sent to your mobile number.', ...result });
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, tenant_id } = req.body;
    if (!phone || !tenant_id) {
      res.status(400).json({ error: 'phone and tenant_id are required.' });
      return;
    }
    const result = await authService.login(phone, tenant_id);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/v1/auth/verify-otp
router.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { phone, tenant_id, otp } = req.body;
    if (!phone || !tenant_id || !otp) {
      res.status(400).json({ error: 'phone, tenant_id, and otp are required.' });
      return;
    }
    const tokens = await authService.verifyOtp(
      phone,
      tenant_id,
      otp,
      req.headers['user-agent'],
      req.ip
    );
    res.json(tokens);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/v1/auth/logout (requires auth)
router.post('/logout', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const result = await authService.logout(user.id);
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// GET /api/v1/auth/me (requires auth)
router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = (req as AuthenticatedRequest).user!;
    const profile = await authService.me(user.id);
    res.json(profile);
  } catch (err) {
    handleError(res, err);
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ error: 'refreshToken is required.' });
      return;
    }
    const tokens = await authService.refreshToken(refreshToken);
    res.json(tokens);
  } catch (err) {
    handleError(res, err);
  }
});

function handleError(res: Response, err: unknown) {
  if (err instanceof AuthError) {
    res.status(err.statusCode).json({ error: err.message });
  } else {
    console.error('Auth route error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
}

export default router;
