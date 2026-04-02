import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { Resend } from 'resend';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
  app.use(cors());

  // API Routes
  app.post('/api/invite', async (req, res) => {
    const { email, groupName, role, invitedBy, inviteLink } = req.body;

    if (!email || !groupName || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!resend || process.env.RESEND_API_KEY === 're_...') {
      console.log('--- MOCK EMAIL SENT ---');
      console.log(`To: ${email}`);
      console.log(`Subject: Invitation to join ${groupName}`);
      console.log(`Body: You have been invited by ${invitedBy} to join ${groupName} as a ${role}.`);
      console.log(`Link: ${inviteLink}`);
      console.log('-----------------------');
      return res.json({ success: true, message: 'Email logged to console (Mock mode)' });
    }

    try {
      const { data, error } = await resend.emails.send({
        from: 'DuesMaster <onboarding@resend.dev>',
        to: [email],
        subject: `Invitation to join ${groupName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
            <h1 style="color: #4f46e5; margin-bottom: 20px;">Welcome to DuesMaster!</h1>
            <p style="font-size: 16px; color: #1e293b;">You have been invited by <strong>${invitedBy}</strong> to join <strong>${groupName}</strong> as a <strong>${role.replace('_', ' ')}</strong>.</p>
            <p style="font-size: 16px; color: #1e293b; margin-bottom: 30px;">DuesMaster helps you track your dues and payments easily.</p>
            <a href="${inviteLink}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold;">Accept Invitation</a>
            <p style="font-size: 14px; color: #64748b; margin-top: 30px;">If you didn't expect this invitation, you can safely ignore this email.</p>
          </div>
        `,
      });

      if (error) {
        console.error('Resend API Error:', error);
        
        // Fallback to mock mode if it's a validation error (e.g. unverified domain/recipient)
        if ((error as any).name === 'validation_error' || (error as any).message?.includes('testing emails')) {
          console.log('--- FALLBACK TO MOCK EMAIL (Resend Restriction) ---');
          console.log(`To: ${email}`);
          console.log(`Link: ${inviteLink}`);
          console.log('--------------------------------------------------');
          return res.json({ 
            success: true, 
            message: 'Email logged to console (Resend restricted to account owner in test mode)',
            fallback: true 
          });
        }
        
        return res.status(400).json({ error });
      }

      res.json({ success: true, data });
    } catch (err) {
      console.error('Internal Server Error (Invite):', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
