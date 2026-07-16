#!/bin/bash
# Q Youth Site Editor — Linux/Mac launcher
# On Mac: rename to launch.command and double-click
# On Linux: mark executable (chmod +x launch.sh) then double-click
cd "$(dirname "$0")"
python3 editor.py
