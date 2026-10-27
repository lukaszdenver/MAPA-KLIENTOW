import nodemailer from 'nodemailer';

export async function sendMail({ to, subject, text, html }) {
  if (!to || to.length === 0) return 0;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });
  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_USER,
    bcc: to,
    subject,
    text,
    ...(html ? { html } : {}),
  });
  return to.length;
}
