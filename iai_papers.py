import os
import re
import json
import asyncio
from urllib.parse import urljoin
import aiohttp
import aiofiles
from bs4 import BeautifulSoup

BASE_URL = "https://actuariesindia.org/question-paper-solutions"
PDF_DIR = "./pdfs"
OUTPUT_JSON = "./iai_papers.json"

# High-concurrency network configuration
TCP_LIMIT = 50          # Max simultaneous open TCP connections
DOWNLOAD_WORKERS = 30   # Parallel file download streams
TIMEOUT = aiohttp.ClientTimeout(total=25)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Encoding": "gzip, deflate"
}

MONTH_MAP = {
    "JAN": "Jan", "FEB": "Feb", "MAR": "Mar", "APR": "Apr",
    "MAY": "May", "JUN": "Jun", "JUL": "Jul", "AUG": "Aug",
    "SEP": "Sep", "OCT": "Oct", "NOV": "Nov", "DEC": "Dec"
}

def clean_month(text):
    m = re.search(r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)", text, re.I)
    return MONTH_MAP.get(m.group(1).upper(), "Nov") if m else "Nov"

def clean_subject_code(raw_name):
    m = re.search(r"\b(C[BMPS]\d[A-Z]?|S[AP]\d|CT\d)\b", raw_name, re.I)
    if m:
        return m.group(1).upper()
    return raw_name.split("-")[0].strip().replace(" ", "").upper()

async def download_worker(sem, session, url, dest_path):
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 1000:
        return True
    async with sem:
        try:
            async with session.get(url, headers=HEADERS, timeout=TIMEOUT) as res:
                if res.status == 200:
                    async with aiofiles.open(dest_path, "wb") as f:
                        async for chunk in res.content.iter_chunked(32768):
                            await f.write(chunk)
                    print(f"  [SAVED] {os.path.basename(dest_path)}")
                    return True
        except Exception:
            pass
    return False

async def fetch_html(session, url):
    try:
        async with session.get(url, headers=HEADERS, timeout=TIMEOUT) as res:
            if res.status == 200:
                return await res.text()
    except Exception:
        pass
    return None

async def parse_and_collect_subject(session, subject_id, subject_name, sem, download_queue, catalog):
    subj_code = clean_subject_code(subject_name)
    page_idx = 0

    while True:
        url = f"{BASE_URL}?field_year_target_id=All&field_subject_target_id={subject_id}&page={page_idx}"
        html = await fetch_html(session, url)
        if not html:
            break

        soup = BeautifulSoup(html, "html.parser")
        table = soup.find("table")
        if not table:
            break

        rows = table.find_all("tr")
        papers_found = 0

        for row in rows:
            cols = row.find_all("td")
            if len(cols) < 4:
                continue

            papers_found += 1
            name_text = cols[1].get_text(strip=True)
            row_code = clean_subject_code(name_text) or subj_code

            session_text = cols[2].get_text(strip=True)
            yr_match = re.search(r"\b(20[0-2][0-9])\b", session_text)
            if not yr_match:
                continue
            year = yr_match.group(1)
            month = clean_month(session_text)
            key = (row_code, year, month)

            # Question Paper Link (Column 3)
            qp_a = cols[3].find("a", href=True)
            if qp_a and any(ext in qp_a["href"].lower() for ext in [".pdf", ".zip"]):
                ext = ".zip" if ".zip" in qp_a["href"].lower() else ".pdf"
                qp_name = f"IAI_{row_code}_{year}_{month}_QP{ext}"
                qp_dest = os.path.join(PDF_DIR, qp_name)

                if key not in catalog:
                    catalog[key] = {"QP": None, "Sol": None}
                catalog[key]["QP"] = f"./pdfs/{qp_name}"

                full_qp_url = urljoin(BASE_URL, qp_a["href"])
                download_queue.append(download_worker(sem, session, full_qp_url, qp_dest))

            # Solution Paper Link (Column 4)
            if len(cols) >= 5:
                sol_a = cols[4].find("a", href=True)
                if sol_a and any(ext in sol_a["href"].lower() for ext in [".pdf", ".zip"]):
                    ext = ".zip" if ".zip" in sol_a["href"].lower() else ".pdf"
                    sol_name = f"IAI_{row_code}_{year}_{month}_Sol{ext}"
                    sol_dest = os.path.join(PDF_DIR, sol_name)

                    if key not in catalog:
                        catalog[key] = {"QP": None, "Sol": None}
                    catalog[key]["Sol"] = f"./pdfs/{sol_name}"

                    full_sol_url = urljoin(BASE_URL, sol_a["href"])
                    download_queue.append(download_worker(sem, session, full_sol_url, sol_dest))

        if papers_found == 0:
            break

        # Stop if no 'next' page button
        if not (soup.find("li", class_=re.compile(r"pager__item--next", re.I)) or soup.find("a", rel="next")):
            break
        page_idx += 1

async def main():
    os.makedirs(PDF_DIR, exist_ok=True)
    sem = asyncio.Semaphore(DOWNLOAD_WORKERS)
    catalog = {}
    download_queue = []

    # Connection pool optimized for maximum concurrency
    connector = aiohttp.TCPConnector(limit=TCP_LIMIT, limit_per_host=TCP_LIMIT, ssl=False)
    async with aiohttp.ClientSession(connector=connector) as session:
        print("Scraping subject directories...")
        init_url = f"{BASE_URL}?field_year_target_id=All"
        init_html = await fetch_html(session, init_url)

        if not init_html:
            print("[ERROR] Could not load base portal. Check network connection.")
            return

        soup = BeautifulSoup(init_html, "html.parser")
        subj_select = soup.find("select", {"name": "field_subject_target_id"})
        if not subj_select:
            all_sel = soup.find_all("select")
            subj_select = all_sel[1] if len(all_sel) > 1 else all_sel[0]

        subjects = []
        visited = set()
        for opt in subj_select.find_all("option"):
            val = opt.get("value", "").strip()
            name = opt.get_text(strip=True)
            if val and val.lower() not in ["all", "", "none", "- select -", "select"]:
                if val not in visited:
                    visited.add(val)
                    subjects.append((val, name))

        print(f"Discovered {len(subjects)} subjects. Querying pages in parallel...")

        # Phase 1: Query every subject and all paginations simultaneously
        parse_tasks = [
            parse_and_collect_subject(session, s_id, s_name, sem, download_queue, catalog)
            for s_id, s_name in subjects
        ]
        await asyncio.gather(*parse_tasks)

        # Phase 2: Stream all discovered papers in parallel
        print(f"\nDiscovered {len(download_queue)} documents. Starting parallel downloads...")
        await asyncio.gather(*download_queue)

    # Phase 3: Write iai_papers.json
    records = []
    for (subj, yr, mo), docs in catalog.items():
        records.append({
            "board": "IAI",
            "subjectCode": subj,
            "year": str(yr),
            "month": mo,
            "questionUrl": docs["QP"] or "",
            "solutionUrl": docs["Sol"] or ""
        })

    records.sort(key=lambda x: (x["subjectCode"], -int(x["year"]), x["month"]))

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)

    print(f"\n[DONE] Finished in seconds! Updated {OUTPUT_JSON} with {len(records)} records.")

if __name__ == "__main__":
    asyncio.run(main())