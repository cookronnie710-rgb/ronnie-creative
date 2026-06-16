#!/usr/bin/env python3
"""CV & Cover Letter Bulk Sender — send tailored job applications at scale."""

import sys
import time
from pathlib import Path

import click
import yaml
from dotenv import load_dotenv
from rich.console import Console
from rich.progress import BarColumn, Progress, SpinnerColumn, TaskProgressColumn, TextColumn
from rich.table import Table

from src.emailer import Emailer
from src.jobs import load_jobs
from src.tailor import CoverLetterTailor
from src.tracker import Tracker

load_dotenv()
console = Console()


def load_config(config_path: str) -> dict:
    p = Path(config_path)
    if not p.exists():
        console.print(f"[red]Config file not found: {config_path}[/red]")
        sys.exit(1)
    with open(p) as f:
        return yaml.safe_load(f)


# ─── CLI ──────────────────────────────────────────────────────────────────────

@click.group()
def cli():
    """CV & Cover Letter Bulk Sender\n\nSend AI-tailored job applications at scale."""
    pass


@cli.command()
@click.option("--jobs", "-j", default=None, help="Path to jobs CSV (overrides config)")
@click.option("--config", "-c", default="config.yaml", show_default=True)
@click.option("--dry-run", is_flag=True, help="Generate letters but do not send")
@click.option("--limit", "-l", default=None, type=int, help="Max jobs to process this run")
@click.option("--no-tailor", is_flag=True, help="Skip AI tailoring, use template verbatim")
def send(jobs, config, dry_run, limit, no_tailor):
    """Send tailored applications to jobs listed in your CSV."""
    cfg = load_config(config)
    jobs_file = jobs or cfg["files"]["jobs_csv"]

    tracker = Tracker(cfg["files"]["tracking_db"])
    emailer = None if dry_run else Emailer(cfg)
    tailor = None if no_tailor else CoverLetterTailor(cfg)

    all_jobs = load_jobs(jobs_file)
    pending = [j for j in all_jobs if j.get("contact_email") and not tracker.already_sent(j["id"])]
    skipped_no_email = [j for j in all_jobs if not j.get("contact_email")]

    if skipped_no_email:
        console.print(
            f"[yellow]⚠  Skipping {len(skipped_no_email)} job(s) with no contact_email "
            f"(apply manually via job_url)[/yellow]"
        )

    if limit:
        pending = pending[:limit]

    if not pending:
        console.print("[green]✓ Nothing pending — all jobs already sent or no email address found.[/green]")
        return

    label = "[bold cyan]DRY RUN[/bold cyan] — " if dry_run else ""
    console.print(
        f"\n{label}[bold]{len(pending)} application(s) to send[/bold] "
        f"(from {len(all_jobs)} total jobs)\n"
    )

    batch_size = cfg["sending"]["batch_size"]
    delay = cfg["sending"]["delay_between_emails"]
    batch_pause = cfg["sending"]["batch_pause"]
    sent = failed = 0

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TaskProgressColumn(),
        console=console,
    ) as progress:
        task = progress.add_task("Sending...", total=len(pending))

        for i, job in enumerate(pending):
            desc = f"[{i+1}/{len(pending)}] [bold]{job['company']}[/bold] — {job['title']}"
            progress.update(task, description=desc)

            # Generate cover letter
            if tailor:
                try:
                    cover_letter = tailor.generate(job)
                except Exception as e:
                    console.print(f"[red]  ✗ AI tailoring failed for {job['company']}: {e}[/red]")
                    tracker.log(job, status="failed", error=f"tailor: {e}")
                    failed += 1
                    progress.advance(task)
                    continue
            else:
                raw = Path(cfg["files"]["cover_letter_template"]).read_text(encoding="utf-8")
                cover_letter = raw.replace("{title}", job.get("title", "")).replace(
                    "{company}", job.get("company", "")
                )

            if dry_run:
                console.print(
                    f"\n[bold cyan]── DRY RUN: {job['company']} → {job['contact_email']} ──[/bold cyan]"
                )
                console.print(cover_letter[:600] + ("\n[dim]…[/dim]" if len(cover_letter) > 600 else ""))
                tracker.log(job, status="dry_run", cover_letter=cover_letter)
                sent += 1
            else:
                try:
                    msg_id = emailer.send(job, cover_letter, cfg["files"]["cv"])
                    tracker.log(job, status="sent", cover_letter=cover_letter, msg_id=msg_id)
                    console.print(f"  [green]✓[/green] {job['company']}")
                    sent += 1
                except Exception as e:
                    tracker.log(job, status="failed", cover_letter=cover_letter, error=str(e))
                    console.print(f"  [red]✗[/red] {job['company']}: {e}")
                    failed += 1

            progress.advance(task)

            # Rate limiting
            if not dry_run and i < len(pending) - 1:
                if (i + 1) % batch_size == 0:
                    console.print(f"[yellow]Batch of {batch_size} done — pausing {batch_pause}s…[/yellow]")
                    time.sleep(batch_pause)
                else:
                    time.sleep(delay)

    status_parts = [f"[green]{sent} sent[/green]"]
    if failed:
        status_parts.append(f"[red]{failed} failed[/red]")
    console.print(f"\n[bold]Done! {' | '.join(status_parts)}[/bold]")


@cli.command()
@click.argument("job_id")
@click.option("--config", "-c", default="config.yaml", show_default=True)
def preview(job_id, config):
    """Preview the AI-tailored cover letter for a specific job ID."""
    cfg = load_config(config)
    all_jobs = load_jobs(cfg["files"]["jobs_csv"])
    job = next((j for j in all_jobs if str(j["id"]) == str(job_id)), None)
    if not job:
        console.print(f"[red]Job ID '{job_id}' not found in CSV.[/red]")
        sys.exit(1)

    console.print(f"[bold]Tailoring cover letter for:[/bold] {job['company']} — {job['title']}\n")
    tailor = CoverLetterTailor(cfg)
    letter = tailor.generate(job)
    console.print(letter)


@cli.command()
@click.option("--config", "-c", default="config.yaml", show_default=True)
@click.option("--export", "export_path", default=None, help="Export log to CSV file")
def status(config, export_path):
    """Show a summary of sent applications."""
    cfg = load_config(config)
    tracker = Tracker(cfg["files"]["tracking_db"])
    stats = tracker.get_stats()

    if not stats:
        console.print("[yellow]No applications logged yet. Run 'send' first.[/yellow]")
        return

    table = Table(title="Application Status", show_header=True, header_style="bold magenta")
    table.add_column("Status", style="cyan", min_width=10)
    table.add_column("Count", justify="right")

    colour = {"sent": "green", "failed": "red", "dry_run": "yellow"}
    total = 0
    for s, count in sorted(stats.items()):
        c = colour.get(s, "white")
        table.add_row(f"[{c}]{s}[/{c}]", str(count))
        total += count
    table.add_row("[bold]TOTAL[/bold]", f"[bold]{total}[/bold]")

    console.print(table)

    recent = tracker.get_recent(15)
    if recent:
        console.print("\n[bold]15 most recent:[/bold]")
        for app in recent:
            c = colour.get(app["status"], "white")
            date = (app["sent_at"] or "")[:10]
            console.print(
                f"  {date}  [{c}]{app['status']:8}[/{c}]  "
                f"{app['company'] or '':20}  {app['title'] or '':30}  "
                f"{app['contact_email'] or ''}"
            )

    if export_path:
        tracker.export_csv(export_path)
        console.print(f"\n[green]Exported to {export_path}[/green]")


@cli.command()
@click.option("--config", "-c", default="config.yaml", show_default=True)
def check(config):
    """Verify your setup before sending (config, CV file, API keys)."""
    cfg = load_config(config)
    import os

    ok = True

    def row(label, value, good=True):
        nonlocal ok
        icon = "[green]✓[/green]" if good else "[red]✗[/red]"
        console.print(f"  {icon}  {label}: {value}")
        if not good:
            ok = False

    console.print("\n[bold]Setup check[/bold]\n")

    cv = Path(cfg["files"]["cv"])
    row("CV file", str(cv), cv.exists())

    tpl = Path(cfg["files"]["cover_letter_template"])
    row("Cover letter template", str(tpl), tpl.exists())

    jobs_csv = Path(cfg["files"]["jobs_csv"])
    row("Jobs CSV", str(jobs_csv), jobs_csv.exists())
    if jobs_csv.exists():
        jobs = load_jobs(str(jobs_csv))
        row("  Jobs loaded", f"{len(jobs)} rows", len(jobs) > 0)

    row("ANTHROPIC_API_KEY", "set" if os.environ.get("ANTHROPIC_API_KEY") else "MISSING",
        bool(os.environ.get("ANTHROPIC_API_KEY")))

    provider = cfg["email"]["provider"]
    row("Email provider", provider)
    if provider == "smtp":
        row("SMTP_USERNAME", "set" if os.environ.get("SMTP_USERNAME") else "MISSING",
            bool(os.environ.get("SMTP_USERNAME")))
        row("SMTP_PASSWORD", "set" if os.environ.get("SMTP_PASSWORD") else "MISSING",
            bool(os.environ.get("SMTP_PASSWORD")))
    elif provider == "sendgrid":
        row("SENDGRID_API_KEY", "set" if os.environ.get("SENDGRID_API_KEY") else "MISSING",
            bool(os.environ.get("SENDGRID_API_KEY")))

    sender = cfg["sender"]
    row("Sender name", sender.get("name") or "MISSING", bool(sender.get("name")))
    row("Sender email", sender.get("email") or "MISSING", bool(sender.get("email")))

    console.print()
    if ok:
        console.print("[bold green]All checks passed — you're ready to send![/bold green]")
    else:
        console.print("[bold red]Fix the issues above before sending.[/bold red]")
    console.print()


if __name__ == "__main__":
    cli()
