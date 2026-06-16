# CV & Cover Letter Bulk Sender

Send hundreds or thousands of AI-tailored job applications from the command line.

Each cover letter is rewritten by Claude to match the specific job description — same tone and truth, different emphasis.

---

## Quick start

### 1. Install dependencies

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Add your credentials

```bash
cp .env.example .env
# Edit .env and fill in your keys
```

| Variable | What it's for |
|---|---|
| `ANTHROPIC_API_KEY` | AI tailoring (get one at console.anthropic.com) |
| `SMTP_USERNAME` | Your email address |
| `SMTP_PASSWORD` | App password (Gmail: myaccount.google.com/apppasswords) |
| `SENDGRID_API_KEY` | Only needed if using SendGrid for bulk sending |

### 3. Add your CV

Drop your CV PDF into `assets/cv.pdf`.

### 4. Edit your cover letter template

Open `templates/cover_letter.md` and replace the `[REPLACE THIS PARAGRAPH]` sections with your actual background, skills, and achievements. The AI will tailor each letter to the specific job while keeping your real experience intact.

### 5. Add your jobs

Create `data/jobs.csv` (copy from `data/jobs_sample.csv`):

```
id,company,title,job_description,contact_email,job_url,notes
1,Acme Corp,Engineer,"We need Python and cloud skills…",hr@acme.com,https://acme.com/jobs/1,
2,Cool Startup,Designer,"React and Figma expertise…",jobs@cool.io,,Portfolio required
```

**Tips for sourcing jobs at scale:**
- Export from LinkedIn / Indeed saved jobs
- Use a job board scraper (ask Claude to build one for your target boards)
- Leave `contact_email` blank for apply-through-portal jobs (they'll be flagged to handle manually)

### 6. Check your setup

```bash
python main.py check
```

### 7. Preview before sending

```bash
# Preview a specific job
python main.py preview 1

# Dry run all pending jobs (generates letters, logs them, sends nothing)
python main.py send --dry-run
```

### 8. Send

```bash
# Send all pending jobs
python main.py send

# Send up to 50 today
python main.py send --limit 50
```

---

## Commands

| Command | What it does |
|---|---|
| `python main.py check` | Verify config, files, and API keys |
| `python main.py send` | Send tailored applications |
| `python main.py send --dry-run` | Generate and log letters without sending |
| `python main.py send --limit N` | Cap how many go out this run |
| `python main.py send --no-tailor` | Skip AI, send template verbatim |
| `python main.py preview <id>` | Print the tailored letter for one job |
| `python main.py status` | Summary of sent / failed / pending |
| `python main.py status --export log.csv` | Export full application log |

---

## Sending at scale

### Gmail / Outlook (up to ~500/day)

Set `email.provider: smtp` in `config.yaml`. Use an App Password, not your main password.

### SendGrid (thousands/day — recommended for bulk)

1. Sign up at sendgrid.com (free tier: 100/day, paid: unlimited)
2. Set `email.provider: sendgrid` in `config.yaml`
3. Add `SENDGRID_API_KEY` to `.env`
4. Verify your sender domain for best deliverability

### Rate limiting

The tool respects `delay_between_emails` (default 30 s) and `batch_size` (default 50) from `config.yaml`. Adjust these to stay within your email provider's limits and avoid spam filters.

---

## How it works

1. Reads jobs from `data/jobs.csv`
2. Skips any job already marked `sent` in `data/tracking.db`
3. Calls Claude to rewrite your cover letter template for the specific job
4. Sends the letter + your CV attachment via SMTP or SendGrid
5. Logs every result (sent / failed / dry_run) to SQLite

Re-run safely at any time — already-sent jobs are never double-sent.

---

## File structure

```
├── main.py                  # CLI entry point
├── config.yaml              # All settings
├── .env                     # Secrets (never commit this)
├── requirements.txt
├── src/
│   ├── tailor.py            # Claude AI cover letter generation
│   ├── emailer.py           # SMTP + SendGrid sending
│   ├── tracker.py           # SQLite application log
│   └── jobs.py              # CSV loader
├── templates/
│   └── cover_letter.md      # Your cover letter template
├── assets/
│   └── cv.pdf               # Your CV (add this yourself)
└── data/
    ├── jobs.csv             # Your jobs list
    ├── jobs_sample.csv      # Example format
    └── tracking.db          # Auto-created, tracks sent applications
```
