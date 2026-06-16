import csv
from pathlib import Path


def load_jobs(csv_path: str) -> list[dict]:
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Jobs file not found: {csv_path}\n"
            "Copy data/jobs_sample.csv to data/jobs.csv and fill in your jobs."
        )
    jobs = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            row = {k: v.strip() for k, v in row.items()}
            jobs.append(row)
    return jobs
