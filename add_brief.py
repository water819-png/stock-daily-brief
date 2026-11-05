#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
add_brief.py - 每日盤後快訊快速發布工具
執行此腳本，只需貼上 Google Doc 連結與標題，可選擇性貼上 Gemini 產出的每日籌碼摘要，自動更新 data/briefs.json！
"""

import sys
import json
import re
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

def parse_gemini_text(text: str) -> dict:
    """自動解析 Gemini 每日 18:00 產出之大盤與三大法人籌碼摘要"""
    if not text or len(text.strip()) < 30:
        return None

    overview = {}
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if lines:
        overview["lead_paragraph"] = lines[0]

    close_m = re.search(r'收在\s*([\d,]+\.?\d*)\s*點', text)
    if close_m:
        overview["index_close"] = close_m.group(1)

    change_m = re.search(r'(大跌|下跌|大漲|上漲)\s*([\d,]+\.?\d*)\s*點.*?([（(][^）)]+[）)])', text)
    if change_m:
        overview["index_change"] = f"{change_m.group(1)} {change_m.group(2)} {change_m.group(3)}"

    vol_m = re.search(r'成交量.*?([\d,]+\.?\d*)\s*億', text)
    if vol_m:
        overview["volume"] = f"{vol_m.group(1)} 億"

    month_m = re.search(r'([^；。\n]*全月累計[^；。\n]*)', text)
    if month_m:
        overview["monthly_change"] = month_m.group(1).strip()

    institutions = {}
    f_m = re.search(r'外資及陸資[：:]\s*(?:狂賣|賣超|買超|狂買)?\s*([\d,]+\.?\d*)\s*億', text)
    if f_m:
        sign = "-" if any(k in text[max(0, f_m.start()-10):f_m.end()] for k in ["賣", "砍"]) else "+"
        institutions["foreign"] = f"{sign}{f_m.group(1)} 億"

    t_m = re.search(r'投信[：:]\s*(?:買超|賣超)?\s*([\d,]+\.?\d*)\s*億', text)
    if t_m:
        sign = "+" if "買" in text[max(0, t_m.start()-5):t_m.end()] else "-"
        institutions["investment_trust"] = f"{sign}{t_m.group(1)} 億"

    d_m = re.search(r'自營商[：:]\s*.*?([\d,]+\.?\d*)\s*億', text)
    if d_m:
        institutions["dealer"] = f"-{d_m.group(1)} 億"

    tot_m = re.search(r'三大法人合計.*?[：:]\s*.*?([\d,]+\.?\d*)\s*億', text)
    if tot_m:
        institutions["total"] = f"-{tot_m.group(1)} 億"

    futures_m = re.search(r'（[^）]*未平倉淨空單[^）]*）', text)
    if futures_m:
        institutions["foreign_futures"] = futures_m.group(0).strip("（）")

    overview["institutions"] = institutions

    # TOP 10 股票解析
    for sec_key, prefix in [("foreign", "外資買賣超前十大個股"), ("trust", "投信買賣超前十大個股")]:
        pos = text.find(prefix)
        if pos != -1:
            part = text[pos:pos+500]
            b_m = re.search(r'買超前十大[：:]\s*([^\n。]+)', part)
            s_m = re.search(r'賣超前十大[：:]\s*([^\n。]+)', part)
            if b_m:
                clean_b = re.sub(r'[\(（].*?[\)）]', '', b_m.group(1))
                overview[f"{sec_key}_top_buy"] = [s.strip() for s in clean_b.replace('、', ',').split(',') if s.strip()][:10]
            if s_m:
                clean_s = re.sub(r'[\(（].*?[\)）]', '', s_m.group(1))
                overview[f"{sec_key}_top_sell"] = [s.strip() for s in clean_s.replace('、', ',').split(',') if s.strip()][:10]

    return overview

def interactive_mode():
    now = datetime.now()
    default_date = now.strftime("%Y-%m-%d")
    weekday_str = WEEKDAY_MAP[now.weekday()]
    default_display = f"{now.strftime('%m/%d')} ({weekday_str})"
    default_title = f"{now.strftime('%m%d')} 盤後快訊 - VIP 版"

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

    print("\n3. （選填）是否有 Gemini 18:00 產出之文字摘要？")
    print("   直接貼上整篇文字（完成後在空行輸入 END 或直接按 Enter 略過）：")
    gemini_lines = []
    while True:
        line = input()
        if line.strip().upper() == "END" or (not line and not gemini_lines):
            break
        if not line and gemini_lines:
            break
        gemini_lines.append(line)

    gemini_raw = "\n".join(gemini_lines).strip()
    market_overview = parse_gemini_text(gemini_raw) if gemini_raw else None

    if market_overview:
        print("✨ 成功自動解析 Gemini 大盤數據與三大法人 TOP10！")
        summary = market_overview.get("lead_paragraph", "每日大盤分析與關鍵價位。")[:120] + "..."
    else:
        summary = input("\n4. 請輸入重點摘要（選填，直接按 Enter 採用預設）：\n👉 ").strip()
        if not summary:
            summary = "大盤技術線走勢觀察、權值股動態、多空關鍵防守價位及熱門焦點股策略。"

    tags = ["VIP專屬", "大盤解析", "關鍵價位", "三大法人籌碼"]

    add_new_brief(
        date=default_date,
        display_date=default_display,
        title=title,
        url=url,
        summary=summary,
        tags=tags,
        market_overview=market_overview
    )

def add_new_brief(date, display_date, title, url, summary, tags, market_overview=None):
    briefs = load_briefs()

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

    if market_overview:
        new_item["market_overview"] = market_overview

    existing_idx = None
    for idx, b in enumerate(briefs):
        if b.get("date") == date or b.get("id") == date:
            existing_idx = idx
            break

    if existing_idx is not None:
        old = briefs[existing_idx]
        if not new_item.get("title") and old.get("title"):
            new_item["title"] = old["title"]
        elif not new_item.get("title"):
            new_item["title"] = f"{datetime.now().strftime('%m%d')} 盤後快訊 - VIP 版"

        if not new_item.get("summary") and old.get("summary"):
            new_item["summary"] = old["summary"]
        elif not new_item.get("summary"):
            new_item["summary"] = "每日台股關鍵價位與進出場策略分析。"

        if not new_item.get("tags") and old.get("tags"):
            new_item["tags"] = old["tags"]
        elif not new_item.get("tags"):
            new_item["tags"] = ["VIP專屬", "大盤解析"]

        if "market_overview" in old and "market_overview" not in new_item:
            new_item["market_overview"] = old["market_overview"]
        briefs[existing_idx] = new_item
        print(f"🔄 已成功更新 {date} 的快訊紀錄！")
    else:
        if not new_item.get("title"):
            new_item["title"] = f"{datetime.now().strftime('%m%d')} 盤後快訊 - VIP 版"
        if not new_item.get("summary"):
            new_item["summary"] = "每日台股關鍵價位與進出場策略分析。"
        if not new_item.get("tags"):
            new_item["tags"] = ["VIP專屬", "大盤解析"]
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
        title_str = args.title or ""
        summary_str = args.summary or ""
        tag_list = [t.strip() for t in args.tags.split(",") if t.strip()] if args.tags else []
        add_new_brief(date_str, disp_str, title_str, args.url, summary_str, tag_list)
    else:
        interactive_mode()
