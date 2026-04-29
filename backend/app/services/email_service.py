import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from ..config import settings

logger = logging.getLogger(__name__)


def send_invite_email(to_email: str, institution_name: str, invite_url: str) -> bool:
    """Send an institution admin invite email. Returns True if sent, False if skipped/failed."""
    if not settings.SMTP_HOST or not settings.SMTP_USER:
        logger.info("SMTP not configured — skipping invite email to %s", to_email)
        return False

    subject = f"You've been invited to manage {institution_name} on ExamMind"
    html = f"""
<!DOCTYPE html>
<html>
<body style="font-family: 'Segoe UI', sans-serif; background: #f4f6fb; margin: 0; padding: 32px;">
  <div style="max-width: 520px; margin: 0 auto; background: #fff; border-radius: 12px;
              padding: 40px; box-shadow: 0 2px 12px rgba(0,0,0,0.08);">
    <div style="font-size: 22px; font-weight: 700; color: #1a2744; margin-bottom: 4px;">
      🎓 ExamMind
    </div>
    <div style="font-size: 13px; color: #7a8aaa; margin-bottom: 28px;">
      AI-Powered Exam Moderation
    </div>

    <h2 style="font-size: 18px; color: #1a2744; margin: 0 0 12px;">
      You're invited to join ExamMind
    </h2>
    <p style="color: #4a5568; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      You have been set up as the <strong>Institution Admin</strong> for
      <strong>{institution_name}</strong> on ExamMind.
      Click the button below to create your account and get started.
    </p>
    <p style="color: #8a9ab0; font-size: 12px; margin: 0 0 24px;">
      This invitation expires in 72 hours.
    </p>

    <a href="{invite_url}"
       style="display: inline-block; background: #1a2744; color: #fff;
              text-decoration: none; font-size: 14px; font-weight: 600;
              padding: 12px 28px; border-radius: 8px; margin-bottom: 24px;">
      Accept Invitation
    </a>

    <p style="color: #a0aec0; font-size: 12px; margin: 0;">
      Or copy this link into your browser:<br>
      <span style="color: #4a90d9;">{invite_url}</span>
    </p>

    <hr style="border: none; border-top: 1px solid #e8edf5; margin: 28px 0 16px;">
    <p style="color: #c0cce0; font-size: 11px; margin: 0;">
      If you weren't expecting this email, you can safely ignore it.
    </p>
  </div>
</body>
</html>
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to_email
    msg.attach(MIMEText(html, "html"))

    try:
        if settings.SMTP_USE_TLS:
            server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
            server.starttls()
        else:
            server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)

        if settings.SMTP_USER and settings.SMTP_PASSWORD:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)

        server.sendmail(settings.SMTP_FROM, [to_email], msg.as_string())
        server.quit()
        logger.info("Invite email sent to %s", to_email)
        return True
    except Exception:
        logger.exception("Failed to send invite email to %s", to_email)
        return False
