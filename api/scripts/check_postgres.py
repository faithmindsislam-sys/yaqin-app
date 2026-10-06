"""Run all checks in an isolated, temporary local Postgres cluster with verified TLS.

Requires installed Postgres binaries and openssl. No production URL or credentials
are used. The runner creates and removes only its own temporary cluster.
"""
import getpass
import os
import shutil
import socket
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import quote

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root))


def main():
    for executable in ("initdb", "pg_ctl", "openssl", "psql"):
        if not shutil.which(executable):
            raise SystemExit(f"Install local Postgres and openssl; missing {executable}")
    with TemporaryDirectory(prefix="faithminds-jobs-") as directory:
        base = Path(directory)
        data = base / "pg"
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        with (base / "setup.log").open("w") as output:
            def command(*args):
                subprocess.run(args, check=True, stdout=output, stderr=subprocess.STDOUT)
            command("initdb", "-D", str(data), "-A", "trust", "--no-locale", "-E", "UTF8")
            command("openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes",
                    "-keyout", str(data / "server.key"), "-out", str(data / "server.crt"),
                    "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost")
            (data / "server.key").chmod(0o600)
            command("pg_ctl", "-D", str(data), "-l", str(base / "server.log"), "-o",
                    f"-h 127.0.0.1 -p {port} -k {base} -c ssl=on", "-w", "start")
            try:
                url = f"postgresql://{quote(getpass.getuser())}:local-test@localhost:{port}/postgres"
                env = {**os.environ, "DATABASE_URL": url, "TEST_DATABASE_URL": url, "SOURCE_STORE_TEST_DATABASE_URL": url, "OPERATIONS_TEST_DATABASE_URL": url,
                       "DATABASE_SSL_CA_FILE": str(data / "server.crt"), "AWS_EC2_METADATA_DISABLED": "true"}
                os.environ.update({key: env[key] for key in ("DATABASE_URL", "DATABASE_SSL_CA_FILE")})
                subprocess.run(["psql", url, "-v", "ON_ERROR_STOP=1", "-c",
                                "CREATE ROLE anon; CREATE ROLE authenticated;"], check=True, stdout=output, stderr=output)
                return subprocess.run([sys.executable, "-m", "pytest", "-q"], cwd=root, env=env).returncode
            finally:
                command("pg_ctl", "-D", str(data), "-m", "immediate", "-w", "stop")


if __name__ == "__main__":
    raise SystemExit(main())
