#!/bin/bash
# Job Search OS — Start Dashboard
# Run this anytime to launch the dashboard: bash start.sh

cd "$(dirname "$0")"

echo ""
echo "  🎯 Job Search OS — Starting Dashboard"
echo "  ======================================"
echo ""

# Kill any existing instances
pkill -f "node server.mjs" 2>/dev/null
pkill -f "vite" 2>/dev/null
sleep 1

# Start dashboard (Express + Vite)
cd dashboard
npm run dev &

echo "  ⏳ Starting servers..."
sleep 5

echo "  ✅ Dashboard running at: http://localhost:5173"
echo "  ✅ API running at:       http://localhost:3001"
echo ""
echo "  Press Ctrl+C to stop."
echo ""

# Keep script alive so Ctrl+C kills the servers cleanly
wait
