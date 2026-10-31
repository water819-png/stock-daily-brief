#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
update_daily_market.py - 全自動從台灣證交所 (TWSE) 官方 API 抓取大盤收盤與三大法人籌碼，並自動更新 data/briefs.json
"""

import sys
import ssl
import json
import urllib.request
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "briefs.json"

WEEKDAY_MAP = ["一", "二", "三", "四", "五", "六", "日"]

def tw_date_to_iso(tw_date_str: str) -> str:
    """民國年轉西元年 (如 115/10/30 -> 2026-10-30)"""
    try:
        parts = tw_date_str.strip().split('/')
        if len(parts) == 3:
            year = int(parts[0]) + 1911
            return f"{year}-{parts[1].zfill(2)}-{parts[2].zfill(2)}"
    except Exception:
        pass
    return datetime.now().strftime("%Y-%m-%d")

def get_twse_ssl_context():
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx

def fetch_twse_json(url: str, timeout: int = 15):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    req = urllib.request.Request(url, headers=headers)
    ctx = get_twse_ssl_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return json.loads(resp.read().decode("utf-8"))

def fetch_market_data():
    """抓取證交所官方行情與三大法人籌碼"""
    market_overview = {}
    
    # 1. 大盤收盤指數與成交量 (FMTQIK)
    print("[1/3] 抓取台股大盤指數與成交金額...")
    try:
        fmtqik = fetch_twse_json("https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?response=json")
        data_rows = fmtqik.get("data", [])
        if data_rows:
            last_row = data_rows[-1]
            # 日期 0, 成交股數 1, 成交金額 2, 成交筆數 3, 發行量加權股價指數 4, 漲跌點數 5
            tw_date = last_row[0].strip() # 如 115/10/30
            vol_raw = float(last_row[2].replace(",", "")) / 100_000_000
            close_idx = last_row[4].strip()
            change_pts = last_row[5].strip()
            
            # 計算漲跌幅
            try:
                c_val = float(close_idx.replace(",", ""))
                chg_val = float(change_pts.replace(",", ""))
                prev_close = c_val - chg_val
                pct = (chg_val / prev_close) * 100
                pct_str = f"{pct:+.2f}%"
            except Exception:
                pct_str = ""

            change_sign = "+" if not change_pts.startswith("-") and change_pts != "0.00" else ""
            market_overview["index_close"] = close_idx
            market_overview["index_change"] = f"{change_sign}{change_pts} ({pct_str})".strip()
            market_overview["volume"] = f"{vol_raw:,.2f} 億"
            market_overview["raw_tw_date"] = tw_date
            print(f"  -> 加權指數: {close_idx} ({market_overview['index_change']}) | 成交量: {market_overview['volume']}")
    except Exception as e:
        print(f"⚠️ 大盤指數抓取異常: {e}")

    # 2. 三大法人買賣金額 (BFI82U)
    print("[2/3] 抓取三大法人買賣金額...")
    try:
        bfi82u = fetch_twse_json("https://www.twse.com.tw/rwd/zh/fund/BFI82U?response=json")
        institutions = {}
        for r in bfi82u.get("data", []):
            name = r[0].strip()
            diff_raw = float(r[3].replace(",", "")) / 100_000_000
            diff_str = f"{diff_raw:+,.2f} 億"
            if "外資及陸資" in name:
                institutions["foreign"] = diff_str
            elif "投信" in name:
                institutions["investment_trust"] = diff_str
            elif "自營商" in name and "合計" in name:
                institutions["dealer"] = diff_str
            elif "合計" in name:
                institutions["total"] = diff_str
        
        market_overview["institutions"] = institutions
        print(f"  -> 三大法人: 外資 {institutions.get('foreign')} | 投信 {institutions.get('investment_trust')} | 合計 {institutions.get('total')}")
    except Exception as e:
        print(f"⚠️ 三大法人買賣金額抓取異常: {e}")

    # 3. 外資與投信買賣超 TOP 10 個股 (T86)
    print("[3/3] 抓取個股三大法人買賣超排行 (TOP 10)...")
    try:
        t86 = fetch_twse_json("https://www.twse.com.tw/rwd/zh/fund/T86?response=json&selectType=ALL")
        stocks = []
        for r in t86.get("data", []):
            code = r[0].strip()
            name = r[1].strip()
            # 排除權證與特殊長代碼，專注一般股票與核心 ETF
            if (len(code) == 4 and code.isdigit()) or (len(code) == 5 and code.startswith("00")):
                try:
                    f_net = int(r[4].replace(",", ""))
                    t_net = int(r[10].replace(",", ""))
                    stocks.append({"code": code, "name": name, "foreign": f_net, "trust": t_net})
                except Exception:
                    pass

        foreign_buy = sorted(stocks, key=lambda x: x["foreign"], reverse=True)[:10]
        foreign_sell = sorted(stocks, key=lambda x: x["foreign"])[:10]
        trust_buy = sorted(stocks, key=lambda x: x["trust"], reverse=True)[:10]
        trust_sell = sorted(stocks, key=lambda x: x["trust"])[:10]

        market_overview["foreign_top_buy"] = [s["name"] for s in foreign_buy]
        market_overview["foreign_top_sell"] = [s["name"] for s in foreign_sell]
        market_overview["trust_top_buy"] = [s["name"] for s in trust_buy]
        market_overview["trust_top_sell"] = [s["name"] for s in trust_sell]

        print(f"  -> 外資買超前三: {', '.join(market_overview['foreign_top_buy'][:3])}")
        print(f"  -> 外資賣超前三: {', '.join(market_overview['foreign_top_sell'][:3])}")
        print(f"  -> 投信買超前三: {', '.join(market_overview['trust_top_buy'][:3])}")
    except Exception as e:
        print(f"⚠️ 個股三大法人排行抓取異常: {e}")

    # 4. 生成引導前言（以實際交易日為準，防呆休市日）
    trade_iso = tw_date_to_iso(market_overview.get("raw_tw_date", ""))
    dt_obj = datetime.strptime(trade_iso, "%Y-%m-%d")
    month_day_str = f"{dt_obj.month}月{dt_obj.day}日"
    weekday_str = f"週{WEEKDAY_MAP[dt_obj.weekday()]}"
    close_idx = market_overview.get("index_close", "--")
    chg = market_overview.get("index_change", "")
    vol = market_overview.get("volume", "")
    f_val = market_overview.get("institutions", {}).get("foreign", "")
    t_val = market_overview.get("institutions", {}).get("investment_trust", "")

    lead_text = (
        f"今日（{month_day_str}，{weekday_str}）台股加權指數收在 {close_idx} 點（{chg}），"
        f"市場成交金額為 {vol}。三大法人籌碼動向方面，外資動態為 {f_val}，投信護盤買賣超為 {t_val}。"
        f"下方彙整今日外資與投信前十大核心進出個股，完整技術線型、關鍵支撐壓力與操作策略請參閱今日 VIP 報告。"
    )
    market_overview["lead_paragraph"] = lead_text
    return market_overview

def update_briefs_json(market_overview, force=False):
    """將今日最新大盤與籌碼資料同步至 briefs.json（含休市防呆）"""
    if not DATA_PATH.exists():
        print(f"⚠️ 未找到 {DATA_PATH}")
        return False

    # 防呆機制：比對證交所返回的最新實際交易日 vs 今日系統日期
    today_real_date = datetime.now().strftime("%Y-%m-%d")
    trade_date = tw_date_to_iso(market_overview.get("raw_tw_date", ""))

    if not force and trade_date != today_real_date:
        print(f"\n☕ [休市防呆] 今日（{today_real_date}）台股未開盤（國定連假 / 颱風假 / 週末休市）。")
        print(f"   證交所最新交易日仍為 [{trade_date}]，略過自動覆蓋以防誤更！")
        return False

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        briefs = json.load(f)

    # 以證交所官方實際交易日為基準
    today_date = trade_date
    dt_obj = datetime.strptime(today_date, "%Y-%m-%d")
    weekday_str = WEEKDAY_MAP[dt_obj.weekday()]
    today_disp = f"{dt_obj.strftime('%m/%d')} ({weekday_str})"
    today_title = f"{dt_obj.strftime('%m%d')} 盤後快訊 - VIP 版"

    # 先將其他舊項目取消 is_latest
    for b in briefs:
        b["is_latest"] = False

    # 檢查是否已存在該交易日項目
    existing_item = None
    existing_idx = None
    for idx, b in enumerate(briefs):
        if b.get("date") == today_date or b.get("id") == today_date:
            existing_item = b
            existing_idx = idx
            break

    if existing_item:
        # 若已存在該交易日項目，更新大盤籌碼模組並保留原有的 VIP Google Doc 連結與標題
        existing_item["market_overview"] = market_overview
        existing_item["is_latest"] = True
        print(f"🔄 成功將最新大盤數據更新至既有項目：{existing_item.get('title')}")
    else:
        # 若尚無該交易日項目，建立新一期快訊，保留預設 Google Doc 或沿用前一日
        prev_url = briefs[0].get("url") if briefs else "#"
        new_item = {
            "id": today_date,
            "date": today_date,
            "display_date": today_disp,
            "title": today_title,
            "url": prev_url,
            "summary": f"台股加權指數收 {market_overview.get('index_close', '--')}（{market_overview.get('index_change', '')}），三大法人籌碼變動與重點焦點股分析。",
            "tags": ["VIP專屬", "大盤解析", "三大法人籌碼", "關鍵價位"],
            "is_latest": True,
            "market_overview": market_overview
        }
        briefs.insert(0, new_item)
        print(f"✨ 成功自動建立（{today_date}）最新快訊戰報項目！")

    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(briefs, f, ensure_ascii=False, indent=2)

    print(f"💾 {DATA_PATH.name} 已成功儲存！共 {len(briefs)} 篇快訊。")
    return True

def main():
    import argparse
    parser = argparse.ArgumentParser(description="台股大盤與三大法人籌碼自動更新任務")
    parser.add_argument("--force", "-f", action="store_true", help="強制更新（略過休市防呆）")
    args = parser.parse_args()

    print("========================================")
    print("🚀 啟動台股大盤與三大法人籌碼自動更新任務")
    print("========================================")
    overview = fetch_market_data()
    if overview and "index_close" in overview:
        success = update_briefs_json(overview, force=args.force)
        if success:
            print("\n🎉 大盤行情與籌碼更新完成！")
    else:
        print("\n⚠️ 今日非交易日或證交所資料尚未發布。")

if __name__ == "__main__":
    main()
