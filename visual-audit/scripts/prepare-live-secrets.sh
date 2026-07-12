#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/volume2/docker_ssd/woodsmith"
cd "$ROOT"
umask 077

mkdir -p secrets
chmod 700 secrets

docker inspect woodsmith --format '{{json .Config.Env}}' \
| OUTPUT_PATH='secrets/woodsmith_audit_admin_password' python3 -c '
import json
import os
import tempfile
import sys

output = os.environ["OUTPUT_PATH"]
environment = json.load(sys.stdin)
matches = [entry.split("=", 1)[1] for entry in environment if entry.startswith("STUDIO_PASSWORD=")]
if len(matches) != 1 or not matches[0]:
    raise SystemExit(f"Expected one non-empty STUDIO_PASSWORD in the running woodsmith container; found {len(matches)}.")

directory = os.path.dirname(output) or "."
descriptor, temporary = tempfile.mkstemp(prefix=".woodsmith-audit-admin.", dir=directory, text=True)
try:
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as handle:
        handle.write(matches[0])
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, output)
    os.chmod(output, 0o600)
except BaseException:
    try:
        os.close(descriptor)
    except OSError:
        pass
    try:
        os.unlink(temporary)
    except FileNotFoundError:
        pass
    raise
'

OUTPUT_PATH='secrets/woodsmith_visual_audit_token' python3 -c '
from pathlib import Path
import os
import re
import tempfile

output = Path(os.environ["OUTPUT_PATH"])
pattern = re.compile(r"^[ \t]*VISUAL_AUDIT_TOKEN[ \t]*=[ \t]*(?P<quote>[\x27\x22]?)(?P<token>[0-9A-Fa-f]{64})(?P=quote)[ \t]*(?:\#[^\r\n]*)?$")
matches = []
for line_number, line in enumerate(Path(".env").read_text(encoding="utf-8").splitlines(), start=1):
    if not re.match(r"^[ \t]*VISUAL_AUDIT_TOKEN[ \t]*=", line):
        continue
    match = pattern.fullmatch(line)
    if not match:
        raise SystemExit(f"VISUAL_AUDIT_TOKEN on line {line_number} is not one 64-character hexadecimal token.")
    matches.append(match.group("token"))
if len(matches) != 1:
    raise SystemExit(f"Expected one VISUAL_AUDIT_TOKEN in .env; found {len(matches)}.")

descriptor, temporary_name = tempfile.mkstemp(prefix=".woodsmith-audit-token.", dir=output.parent, text=True)
temporary = Path(temporary_name)
try:
    os.fchmod(descriptor, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as handle:
        handle.write(matches[0])
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, output)
    os.chmod(output, 0o600)
except BaseException:
    try:
        os.close(descriptor)
    except OSError:
        pass
    temporary.unlink(missing_ok=True)
    raise
'

python3 - <<'PY'
from pathlib import Path
import stat

files = [
    Path("secrets/woodsmith_audit_admin_password"),
    Path("secrets/woodsmith_visual_audit_token"),
]
for path in files:
    if not path.is_file() or path.stat().st_size <= 0:
        raise SystemExit(f"Missing or empty private audit secret: {path}")
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode != 0o600:
        raise SystemExit(f"Audit secret has mode {mode:03o}, expected 600: {path}")
print("Visual-audit secret files are non-empty and mode 600.")
PY
