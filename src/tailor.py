import os
from pathlib import Path
import anthropic


class CoverLetterTailor:
    def __init__(self, config: dict):
        self.config = config
        self.sender = config["sender"]
        self.model = config["ai"]["model"]
        self.max_tokens = config["ai"]["max_tokens"]
        self.template = Path(config["files"]["cover_letter_template"]).read_text(encoding="utf-8")
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError("ANTHROPIC_API_KEY not set. Add it to your .env file.")
        self.client = anthropic.Anthropic(api_key=api_key)

    def generate(self, job: dict) -> str:
        prompt = f"""You are helping {self.sender['name']} write job application cover letters.

Rewrite the cover letter template below so it is tailored to the specific job posting.
Rules:
- Keep it professional, concise, and genuine — no fluff or clichés.
- Do NOT invent facts, skills, or experience not implied by the template.
- Replace placeholder instructions (text in [BRACKETS]) with real content based on the template's existing details and the job description.
- Fill in {{title}} and {{company}} with the actual values.
- The letter should feel personal to this company, not generic.
- Return ONLY the finished cover letter text — no commentary, no markdown fences.

JOB DETAILS
Company: {job['company']}
Role: {job['title']}
Job description: {job.get('job_description') or 'Not provided'}
Job URL: {job.get('job_url') or 'N/A'}
Notes: {job.get('notes') or 'None'}

COVER LETTER TEMPLATE
{self.template}

Write the tailored cover letter now:"""

        message = self.client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text.strip()
