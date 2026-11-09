"""
重大行事曆更新維護工具 (Macro Calendar Updater)
負責管理 stock-daily-brief 網站的「重大行事曆」資料 (calendar.json)。
支援時態狀態檢測、每週事件滾動更新、以及自動 Git Push 至 Vercel 雲端發布。
"""

import os
import sys
import json
import argparse
import subprocess
from datetime import datetime, date
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BRIEF_DIR = Path(r"c:\stock_dashboard\stock_daily_brief")
CALENDAR_PATH = BRIEF_DIR / "data" / "calendar.json"

def load_calendar():
    if not CALENDAR_PATH.exists():
        print(f"❌ 找不到行事曆檔案: {CALENDAR_PATH}")
        return None
    with open(CALENDAR_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def save_and_push(data, commit_msg="feat: update macro calendar"):
    with open(CALENDAR_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"✅ 行事曆資料已成功寫入: {CALENDAR_PATH}")

    # Git Push
    try:
        subprocess.run(["git", "add", "data/calendar.json"], cwd=str(BRIEF_DIR), capture_output=True, text=True, check=False)
        subprocess.run(["git", "commit", "-m", commit_msg], cwd=str(BRIEF_DIR), capture_output=True, text=True, check=False)
        push_res = subprocess.run(["git", "push", "origin", "main"], cwd=str(BRIEF_DIR), capture_output=True, text=True, check=False)
        if push_res.returncode == 0:
            print("🚀 已成功推播至 GitHub，Vercel 正在自動部署最新行事曆！")
        else:
            print(f"ℹ️ Git Push 提示: {push_res.stderr.strip() or push_res.stdout.strip()}")
    except Exception as e:
        print(f"⚠️ Git push 失敗: {e}")

def check_status():
    data = load_calendar()
    if not data:
        return
    updated_at = data.get("updated_at", "未知")
    theme_title = data.get("theme_title", "")
    stages = data.get("stages", [])
    today_str = datetime.now().strftime("%Y-%m-%d")
    today_mmdd = datetime.now().strftime("%m/%d")

    print("\n================ 📅 重大行事曆目前狀態 ================")
    print(f"📌 主題標題: {theme_title}")
    print(f"🕒 資料更新日: {updated_at} (今日系統日: {today_str})")
    print("-------------------------------------------------------")

    all_expired = True
    for st in stages:
        s_id = st.get("stage_id", "")
        s_num = st.get("stage_number", "")
        s_range = st.get("date_range", "")
        s_title = st.get("title", "")
        
        # 簡易判定時態
        import re
        dates = re.findall(r"\d{1,2}/\d{1,2}", s_range)
        max_date = dates[-1] if dates else "99/99"
        if len(max_date.split("/")[0]) == 1:
            max_date = "0" + max_date
        
        status = "即將登場 ⏳"
        if max_date < today_mmdd:
            status = "已結束/已出爐 ✔"
        else:
            all_expired = False
            
        print(f"[{s_num}] {s_range} | {s_title} -> 狀態: {status}")

    print("-------------------------------------------------------")
    if all_expired:
        print("⚠️ 提醒：目前三個關卡均已過期，建議更新本週或下週之最新宏觀關卡！")
    else:
        print("🟢 行事曆時程維持有效運作中。")
    print("=======================================================\n")

def main():
    parser = argparse.ArgumentParser(description="重大行事曆管理工具")
    parser.add_argument("--check", action="store_true", help="檢視目前行事曆狀態與是否過期")
    parser.add_argument("--touch-today", action="store_true", help="將更新日期刷為今日並發布")
    args = parser.parse_args()

    if args.check or len(sys.argv) == 1:
        check_status()
    elif args.touch_today:
        data = load_calendar()
        if data:
            today_str = datetime.now().strftime("%Y-%m-%d")
            data["updated_at"] = today_str
            save_and_push(data, f"chore: touch calendar updated_at to {today_str}")

if __name__ == "__main__":
    main()
