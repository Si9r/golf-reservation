"""사용법 (apps/api 폴더에서): python -m app.jobs B-01   (여러 개: B-02 B-04)"""
import sys

from . import JOBS

ids = sys.argv[1:]
if not ids or any(x not in JOBS for x in ids):
    sys.exit("배치 ID를 적어 주세요: " + ", ".join(JOBS))
for x in ids:
    print(x, JOBS[x]())
