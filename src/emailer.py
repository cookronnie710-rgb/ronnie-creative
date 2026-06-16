import os
import smtplib
import uuid
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path


class Emailer:
    def __init__(self, config: dict):
        self.config = config
        self.sender = config["sender"]
        self.email_cfg = config["email"]

    def _subject(self, job: dict) -> str:
        template = self.email_cfg.get("subject_template", "Application for {title} – {sender_name}")
        return template.format(
            title=job.get("title", ""),
            company=job.get("company", ""),
            sender_name=self.sender["name"],
        )

    def _attach_cv(self, msg: MIMEMultipart, cv_path: str) -> None:
        cv_file = Path(cv_path)
        if not cv_file.exists():
            raise FileNotFoundError(
                f"CV not found at {cv_path}. Place your CV there or update config.yaml."
            )
        with open(cv_file, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{cv_file.name}"')
        msg.attach(part)

    def send(self, job: dict, cover_letter: str, cv_path: str) -> str:
        provider = self.email_cfg.get("provider", "smtp")
        if provider == "sendgrid":
            return self._send_sendgrid(job, cover_letter, cv_path)
        return self._send_smtp(job, cover_letter, cv_path)

    def _send_smtp(self, job: dict, cover_letter: str, cv_path: str) -> str:
        smtp_cfg = self.email_cfg["smtp"]
        username = smtp_cfg.get("username") or os.environ["SMTP_USERNAME"]
        password = smtp_cfg.get("password") or os.environ["SMTP_PASSWORD"]

        msg = MIMEMultipart()
        msg["From"] = f"{self.sender['name']} <{self.sender['email']}>"
        msg["To"] = job["contact_email"]
        msg["Subject"] = self._subject(job)
        msg["Message-ID"] = f"<{uuid.uuid4()}@job-applications>"

        msg.attach(MIMEText(cover_letter, "plain", "utf-8"))
        self._attach_cv(msg, cv_path)

        with smtplib.SMTP(smtp_cfg["host"], smtp_cfg["port"]) as server:
            server.ehlo()
            server.starttls()
            server.login(username, password)
            server.send_message(msg)

        return msg["Message-ID"]

    def _send_sendgrid(self, job: dict, cover_letter: str, cv_path: str) -> str:
        import base64
        import sendgrid
        from sendgrid.helpers.mail import (
            Attachment, Disposition, FileContent, FileName, FileType, Mail,
        )

        api_key = os.environ.get("SENDGRID_API_KEY")
        if not api_key:
            raise EnvironmentError("SENDGRID_API_KEY not set in .env")

        sg = sendgrid.SendGridAPIClient(api_key=api_key)

        message = Mail(
            from_email=f"{self.sender['name']} <{self.sender['email']}>",
            to_emails=job["contact_email"],
            subject=self._subject(job),
            plain_text_content=cover_letter,
        )

        cv_file = Path(cv_path)
        if not cv_file.exists():
            raise FileNotFoundError(f"CV not found at {cv_path}")
        with open(cv_file, "rb") as f:
            encoded = base64.b64encode(f.read()).decode()
        message.attachment = Attachment(
            FileContent(encoded),
            FileName(cv_file.name),
            FileType("application/pdf"),
            Disposition("attachment"),
        )

        response = sg.send(message)
        return response.headers.get("X-Message-Id", str(uuid.uuid4()))
