#!/usr/bin/env python3
import pathlib, subprocess, sys, zipfile

root = pathlib.Path.cwd()
outdir = root / ".codex" / "gemini"
outdir.mkdir(parents=True, exist_ok=True)
bundle = outdir / "changed_files.zip"

def run_git(args):
    try:
        return subprocess.check_output(["git", *args], cwd=root)
    except Exception:
        return b""

paths = set()
for args in [
    ["diff", "--name-only", "-z"],
    ["diff", "--name-only", "--cached", "-z"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
]:
    out = run_git(args)
    for p in out.split(b"\0"):
        if p:
            paths.add(p.decode("utf-8", "surrogateescape"))

if not paths:
    print("NO_CHANGES")
    sys.exit(0)

if bundle.exists():
    bundle.unlink()

with zipfile.ZipFile(bundle, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for p in sorted(paths):
        fp = root / p
        if fp.is_file():
            z.write(fp, arcname=p)

print(str(bundle))
