# Cappuccino interactive editor

A small PJSON-based editor for quiz answers, branching, Scene jumps, preview, and SCORM 1.2 export.

Open the GitHub Pages site: https://visla-jiaozebo.github.io/visla-training-demo/

## Public demo data

This repository contains only a deliberately simplified public PJSON example. Project, Scene, and question identifiers are demo identifiers. Original project data, account identifiers, signed URLs, stock videos, audio, and private documentation are not included.

The demo is text-only. It retains lesson text and three knowledge checks. Editing and preview work in the browser; drafts are stored in that browser's localStorage, not shared with other users or uploaded to a backend.

Use **保存并预览** to test the current flow and **导出 SCORM** to download the course package. The exported package contains the public PJSON and player files; it does not require this editor to run.

## Local preview

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open http://127.0.0.1:8765/ . Use localhost or HTTPS because the editor uses Web Crypto.

The local Runtime player is a small test simulator, not a SCORM certification suite. Real target-platform behavior should be validated separately.
