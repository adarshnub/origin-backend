import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const transport = env.SMTP_HOST
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER && env.SMTP_PASSWORD
        ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
        : undefined,
    })
  : null;

async function send(to: string, subject: string, text: string) {
  if (!transport) {
    if (env.NODE_ENV !== "production") console.info(`[email:${subject}] ${to} ${text}`);
    return;
  }
  await transport.sendMail({ from: env.SMTP_FROM, to, subject, text });
}

export function sendVerificationEmail(email: string, token: string) {
  return send(email, "Verify your Origin account", `Verify your email: ${env.APP_ORIGIN}/auth/verify?token=${token}`);
}

export function sendPasswordResetEmail(email: string, token: string) {
  return send(email, "Reset your Origin password", `Reset your password: ${env.APP_ORIGIN}/auth/reset-password?token=${token}`);
}

export function sendWorkspaceInviteEmail(email: string, token: string) {
  return send(email, "Join an Origin workspace", `Accept your invitation after signing in: ${env.APP_ORIGIN}/studio/frame?invite=${token}`);
}
