#!/usr/bin/env bash
# bench-report.sh — اجرای خودکار بنچمارک و ذخیره در گزارش markdown
#
# استفاده:
#   cd backend
#   bash bench-report.sh                       # ۴۰۰ کاربر — تست سریع
#   bash bench-report.sh 1500 3998 1 1        # پارامتر سفارشی
#   bash bench-report.sh read 2000             # فقط خواندن
#
# خروجی: بلوک جدید به benchmark-report.md اضافه می‌شود

set -euo pipefail

cd "$(dirname "$0")"
DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
COMMIT=$(git log --oneline -1 2>/dev/null || echo "unknown")
NODE_VER=$(node -e "console.log(process.version)" 2>/dev/null || echo "?")
REPORT="benchmark-report.md"

# ---------- پارامترها ----------
MODE="${1:-full}"       # full | write | read
N_WRITE="${2:-400}"
N_READ="${3:-400}"
PORT_W="${4:-3998}"
BYPASS="${5:-1}"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   بنچمارک اتومات — $DATE   ║"
echo "╚══════════════════════════════════════════╝"
echo "  Commit : $COMMIT"
echo "  Node   : $NODE_VER"
echo ""

# ---------- بنچمارک نوشتن ----------
run_write() {
  local N=$1 PORT=$2 BYP=$3
  echo ">> bench-load: $N خریدار همزمان | port $PORT"
  node bench-load.js "$N" "$PORT" "$BYP" "$BYP" 2>&1 | tee /tmp/bench-write.log
  echo ""
}

# ---------- بنچمارک خواندن ----------
run_read() {
  local N=$1 PORT=$2
  echo ">> bench-read: $N خواننده همزمان | port $PORT"
  node bench-read.js "$N" "$PORT" 2>&1 | tee /tmp/bench-read.log
  echo ""
}

# ---------- تجزیه‌ی خروجی ----------
parse_write() {
  local log="$1"
  local n="$2"
  # استخراج اعداد از خروجی bench-load
  local cart_ok cart_p50 cart_p90 cart_p95 cart_p99 cart_max
  local ord_ok ord_p50 ord_p90 ord_p95 ord_p99 ord_max wall rss

  cart_p50=$(grep  "GET /api/cart" -A2 "$log" | grep 'p50:' | grep -oP 'p50:\K\d+' || echo "?")
  cart_p90=$(grep  "GET /api/cart" -A2 "$log" | grep 'p50:' | grep -oP 'p90:\K\d+' || echo "?")
  cart_p95=$(grep  "GET /api/cart" -A2 "$log" | grep 'p50:' | grep -oP 'p95:\K\d+' || echo "?")
  cart_p99=$(grep  "GET /api/cart" -A2 "$log" | grep 'p50:' | grep -oP 'p99:\K\d+' || echo "?")
  cart_max=$(grep "GET /api/cart" -A2 "$log" | grep 'p50:' | grep -oP 'max:\K\d+' || echo "?")

  ord_ok=$(grep "POST /api/orders" -A1 "$log" | grep 'ok:' | grep -oP 'ok:\K\d+' || echo "?")
  ord_p50=$(grep "POST /api/orders" -A1 "$log" | grep 'p50:' | grep -oP 'p50:\K\d+' || echo "?")
  ord_p90=$(grep "POST /api/orders" -A1 "$log" | grep 'p50:' | grep -oP 'p90:\K\d+' || echo "?")
  ord_p95=$(grep "POST /api/orders" -A1 "$log" | grep 'p50:' | grep -oP 'p95:\K\d+' || echo "?")
  ord_p99=$(grep "POST /api/orders" -A1 "$log" | grep 'p50:' | grep -oP 'p99:\K\d+' || echo "?")
  ord_max=$(grep "POST /api/orders" -A1 "$log" | grep 'p50:' | grep -oP 'max:\K\d+' || echo "?")
  wall=$(grep "wall time" "$log" | grep -oP '\d+(?= ms)' | head -1 || echo "?")
  rss=$(grep "post-load health" "$log" | grep -oP 'rss=\K\d+' || echo "?")
  local success="✅"
  [ "$ord_ok" != "$n" ] && success="❌"

  cat <<ROWS
| **$n** | ${ord_p50} ms | ${ord_p90} ms | ${ord_p95} ms | ${ord_p99} ms | ${ord_max} ms | $(printf '%.0f' $(echo "scale=0; $n / ($wall / 1000)" | bc 2>/dev/null || echo "?")) | ${rss} MB | $success |
ROWS
}

parse_read() {
  local log="$1"
  local n="$2" route="$3"
  local name ok p50 p90 p95 p99 max
  # نام مسیر + آمار
  local line=$(grep -A1 "$route" "$log" | tail -1)
  p50=$(echo "$line" | grep -oP 'p50:\K\d+' || echo "?")
  p90=$(echo "$line" | grep -oP 'p90:\K\d+' || echo "?")
  p95=$(echo "$line" | grep -oP 'p95:\K\d+' || echo "?")
  p99=$(echo "$line" | grep -oP 'p99:\K\d+' || echo "?")
  max=$(echo "$line" | grep -oP 'max:\K\d+' || echo "?")
  ok=$(echo "$line" | grep -oP 'ok:\K\d+' || echo "?")
  local success="✅"
  [ "$ok" != "$n" ] && success="❌"
  echo "| **$n** | ${p50} ms | ${p90} ms | ${p95} ms | ${p99} ms | ${max} ms | $success |"
}

# ---------- ساخت بلوک ----------
build_block() {
  cat <<BLOCK

## اجرای $DATE

| مورد | مقدار |
|---|---|
| کامیت | \`$COMMIT\` |
| Node | $NODE_VER |

### نتایج

BLOCK

  if [ "$MODE" = "write" ] || [ "$MODE" = "full" ]; then
    run_write "$N_WRITE" "$PORT_W" "$BYPASS"
    echo "### POST /api/orders"
    echo "| کاربر | p50 | p90 | p95 | p99 | max | throughput | RSS | موفقیت |"
    echo "|---|---|---|---|---|---|---|---|---|"
    parse_write /tmp/bench-write.log "$N_WRITE"
    echo ""
  fi

  if [ "$MODE" = "read" ] || [ "$MODE" = "full" ]; then
    run_read "$N_READ" "$((PORT_W + 1))"
    echo "### خواندن"
    for ROUTE in "listing" "filtered" "search" "facets" "detail" "related" "categories"; do
      echo "| $ROUTE | p50 | p90 | p95 | p99 | max | موفقیت |"
      echo "|---|---|---|---|---|---|---|"
      parse_read /tmp/bench-read.log "$N_READ" "$ROUTE"
    done
    echo ""
  fi

  cat <<BLOCK
> ⏱ اجرا: $DATE | Commit: \`$COMMIT\`

BLOCK
}

# ---------- افزودن به گزارش ----------
BLOCK=$(build_block)

echo ""
echo "═══ افزودن به $REPORT ═══"
echo "$BLOCK" >> "$REPORT"
echo "✅ بلوک جدید به انتهای $REPORT اضافه شد"
echo ""

# خلاصه
echo "═══ خلاصه ═══"
if [ "$MODE" = "write" ] || [ "$MODE" = "full" ]; then
  echo "  نوشتن: $(grep -c 'p50:' /tmp/bench-write.log 2>/dev/null || echo '?') مسیر تست شد"
fi
if [ "$MODE" = "read" ] || [ "$MODE" = "full" ]; then
  echo "  خواندن: $(grep -c 'p50:' /tmp/bench-read.log 2>/dev/null || echo '?') مسیر تست شد"
fi
echo ""