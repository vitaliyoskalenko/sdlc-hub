# PowerShell on Linux with Node.js 22 and git, to run a generated setup-<user>.ps1 (claim 17) without a Windows
# machine. It checks the script's PowerShell, not Windows itself: Git Credential Manager and paths with drive
# letters still need a real Windows run.
FROM node:22-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends wget ca-certificates git \
 && wget -q https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb \
 && dpkg -i packages-microsoft-prod.deb && rm packages-microsoft-prod.deb \
 && apt-get update && apt-get install -y --no-install-recommends powershell \
 && rm -rf /var/lib/apt/lists/*
