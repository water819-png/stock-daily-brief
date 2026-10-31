#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
add_brief.py - 每日盤後快訊快速發布工具
執行此腳本，只需貼上 Google Doc 連結與標題，自動更新 data/briefs.json！
"""

import sys
import json
import argparse
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "briefs.json"

WEEKDAY_MAP = ["一", "二", "三", "四", "五", "六", "日"]

def load_briefs():
    if not DATA_PATH.exists():
        return []
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except Exception:
            return []

def save_briefs(data):
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\n✅ 成功寫入：{DATA_PATH}")

def interactive_mode():
    now = datetime.now()
    default_date = now.strftime("%Y-%m-%d")
    weekday_str = WEEKDAY_MAP[now.weekday()]
    default_display = f"{now.strftime('%m/%d')} ({weekday_str})"
    default_title = f"{now.strftime('%m%d')} 盤後快訊 - 台股大盤關鍵轉折與焦點股分析"

    print("========================================")
    print("📰 發布今日盤後快訊小工具")
    print("========================================")

    url = input("\n1. 請貼上今日 Google Doc 共用連結：\n👉 ").strip()
    while not url:
        print("⚠️ 連結不能為空！")
        url = input("👉 請輸入 Google Doc 連結：").strip()

    title = input(f"\n2. 請輸入快訊標題 (直接按 Enter 採用預設: {default_title})：\n👉 ").strip()
    if not title:
        title = default_title

    summary = input("\n3. 請輸入重點摘要（選填，直接按 Enter 採用通用摘要）：\n👉 ").strip()
    if not summary:
        summary = "大盤技術線走勢觀察、權值股動態、多空關鍵防守價位及熱門焦點股策略。"

    tags_input = input("\n4. 請輸入標籤（逗號分隔，例如: 大盤解析,關鍵價位,進出場策略）：\n👉 ").strip()
    if tags_input:
        tags = [t.strip() for t in tags_input.replace("，", ",").split(",") if t.strip()]
    else:
        tags = ["大盤解析", "關鍵價位", "進出場策略", "焦點股"]

    add_new_brief(
        date=default_date,
        display_date=default_display,
        title=title,
        url=url,
        summary=summary,
        tags=tags
    )

def add_new_brief(date, display_date, title, url, summary, tags):
    briefs = load_briefs()

    # 先將其他舊項目取消 is_latest
    for b in briefs:
        b["is_latest"] = False

    new_item = {
        "id": date,
        "date": date,
        "display_date": display_date,
        "title": title,
        "url": url,
        "summary": summary,
        "tags": tags,
        "is_latest": True
    }

    # 檢查是否已存在同日項目，存在則更新，不存在則插入最前面
    existing_idx = None
    for idx, b in enumerate(briefs):
        if b.get("date") == date or b.get("id") == date:
            existing_idx = idx
            break

    if existing_idx is not None:
        if "market_overview" in briefs[existing_idx] and "market_overview" not in new_item:
            new_item["market_overview"] = briefs[existing_idx]["market_overview"]
        briefs[existing_idx] = new_item
        print(f"🔄 已覆蓋更新 {date} 的快訊紀錄！")
    else:
        briefs.insert(0, new_item)
        print(f"✨ 已新增 {date} 的全新快訊紀錄！")

    save_briefs(briefs)
    print("\n🎉 發布完畢！")
    print(f"📌 標題：{title}")
    print(f"🔗 連結：{url}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="快速新增每日盤後快訊")
    parser.add_argument("--url", "-u", type=str, help="Google Doc 網址")
    parser.add_argument("--title", "-t", type=str, help="快訊標題")
    parser.add_argument("--summary", "-s", type=str, default="", help="摘要")
    parser.add_argument("--tags", type=str, default="", help="標籤（逗號分隔）")
    args = parser.parse_args()

    if args.url:
        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        weekday_str = WEEKDAY_MAP[now.weekday()]
        disp_str = f"{now.strftime('%m/%d')} ({weekday_str})"
        title_str = args.title or f"{now.strftime('%m%d')} 盤後快訊"
        summary_str = args.summary or "每日台股關鍵價位與進出場策略分析。"
        tag_list = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else ["大盤解析", "關鍵價位"]
        add_new_brief(date_str, disp_str, title_str, args.url, summary_str, tag_list)
    else:
        interactive_mode()
