#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
update_daily_market.py - 全自動從台灣證交所 (TWSE) 與期交所 (TAIFEX) 抓取大盤收盤與三大法人籌碼，並自動更新 data/briefs.json 與 data/calendar.json
"""

import sys
import ssl
import json
import re
import urllib.request
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent
DATA_PATH = BASE_DIR / "data" / "briefs.json"
CALENDAR_PATH = BASE_DIR / "data" / "calendar.json"

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

def fetch_taifex_futures(timeout: int = 15):
    """抓取期交所 (TAIFEX) 官方台指期三大法人未平倉與變動口數"""
    try:
        url = "https://www.taifex.com.tw/cht/3/futContractsDate"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        req = urllib.request.Request(url, headers=headers)
        ctx = get_twse_ssl_context()
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
            html = resp.read().decode("utf-8")
        
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        t = soup.find("table", class_="table_f")
        futures_info = {}
        if t:
            rows = t.find_all("tr")
            for idx, r in enumerate(rows):
                cells = [c.get_text(strip=True) for c in r.find_all(["td", "th"])]
                if any("臺股期貨" in c for c in cells):
                    for offset in range(3):
                        if idx + offset < len(rows):
                            target_cells = [c.get_text(strip=True) for c in rows[idx + offset].find_all(["td", "th"])]
                            net_oi = target_cells[-2]  # 未平倉多空淨額口數
                            chg_oi = target_cells[7] if len(target_cells) == 15 else target_cells[5] # 今日交易淨口數
                            if any("外資" in c for c in target_cells):
                                futures_info["foreign"] = {"net_oi": net_oi, "chg_oi": chg_oi}
                            elif any("投信" in c for c in target_cells):
                                futures_info["trust"] = {"net_oi": net_oi, "chg_oi": chg_oi}
                            elif any("自營商" in c for c in target_cells):
                                futures_info["dealer"] = {"net_oi": net_oi, "chg_oi": chg_oi}
                    break
        return futures_info
    except Exception as e:
        print(f"⚠️ 期交所台指期法人籌碼抓取異常: {e}")
        return {}

def calculate_streaks(briefs, current_foreign_diff, current_trust_diff):
    """計算外資與投信連續買/賣超天數（優先承接前一營業日已核實之連買/連賣天數）"""
    trust_streak = 1 if current_trust_diff > 0 else 0
    foreign_streak = 1 if current_foreign_diff < 0 else 0

    if briefs:
        for b in briefs:
            if b.get("date") == datetime.now().strftime("%Y-%m-%d") and b.get("is_latest") is False:
                pass
            # 尋找前一個有效營業日的紀錄
            if b.get("date") != datetime.now().strftime("%Y-%m-%d"):
                prev_inst = b.get("market_overview", {}).get("institutions", {})
                prev_f_txt = prev_inst.get("foreign_futures", "")
                prev_t_txt = prev_inst.get("trust_note", "")

                f_match = re.search(r'連\s*(\d+)\s*賣', prev_f_txt)
                t_match = re.search(r'連\s*(\d+)\s*買', prev_t_txt)

                if f_match and current_foreign_diff < 0:
                    foreign_streak = int(f_match.group(1)) + 1
                if t_match and current_trust_diff > 0:
                    trust_streak = int(t_match.group(1)) + 1
                break

    return foreign_streak, trust_streak

def fetch_market_data():
    """抓取證交所官方行情與三大法人籌碼，並整合期交所期貨"""
    market_overview = {}
    
    # 1. 大盤收盤指數與成交量 (FMTQIK)
    print("[1/4] 抓取台股大盤指數與成交金額...")
    try:
        fmtqik = fetch_twse_json("https://www.twse.com.tw/rwd/zh/afterTrading/FMTQIK?response=json")
        data_rows = fmtqik.get("data", [])
        if data_rows:
            last_row = data_rows[-1]
            tw_date = last_row[0].strip() # 如 115/11/05
            vol_raw = float(last_row[2].replace(",", "")) / 100_000_000
            close_idx = last_row[4].strip()
            change_pts = last_row[5].strip()
            
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
            market_overview["close_val"] = float(close_idx.replace(",", ""))
            market_overview["change_val"] = float(change_pts.replace(",", ""))
            market_overview["vol_val"] = vol_raw
            print(f"  -> 加權指數: {close_idx} ({market_overview['index_change']}) | 成交量: {market_overview['volume']}")
    except Exception as e:
        print(f"⚠️ 大盤指數抓取異常: {e}")

    # 2. 三大法人買賣金額 (BFI82U)
    print("[2/4] 抓取三大法人買賣金額...")
    foreign_raw = 0.0
    trust_raw = 0.0
    try:
        bfi82u = fetch_twse_json("https://www.twse.com.tw/rwd/zh/fund/BFI82U?response=json")
        institutions = {}
        dealer_diff_sum = 0.0
        has_dealer = False
        for r in bfi82u.get("data", []):
            name = r[0].strip()
            diff_raw = float(r[3].replace(",", "")) / 100_000_000
            diff_str = f"{diff_raw:+,.2f} 億"
            if "外資及陸資" in name:
                institutions["foreign"] = diff_str
                foreign_raw = diff_raw
            elif "投信" in name:
                institutions["investment_trust"] = diff_str
                trust_raw = diff_raw
            elif "自營商" in name:
                has_dealer = True
                dealer_diff_sum += diff_raw
            elif "合計" in name:
                institutions["total"] = diff_str

        if has_dealer:
            institutions["dealer"] = f"{dealer_diff_sum:+,.2f} 億"
        
        market_overview["institutions"] = institutions
        market_overview["foreign_raw"] = foreign_raw
        market_overview["trust_raw"] = trust_raw
        market_overview["dealer_raw"] = dealer_diff_sum
        print(f"  -> 三大法人: 外資 {institutions.get('foreign')} | 投信 {institutions.get('investment_trust')} | 自營商 {institutions.get('dealer')} | 合計 {institutions.get('total')}")
    except Exception as e:
        print(f"⚠️ 三大法人買賣金額抓取異常: {e}")

    # 3. 期交所三大法人台指期貨未平倉 (TAIFEX)
    print("[3/4] 抓取期交所台指期三大法人未平倉...")
    futures_data = fetch_taifex_futures()
    market_overview["futures_data"] = futures_data
    if futures_data:
        f_oi = futures_data.get("foreign", {}).get("net_oi", "")
        t_oi = futures_data.get("trust", {}).get("net_oi", "")
        d_oi = futures_data.get("dealer", {}).get("net_oi", "")
        print(f"  -> 台指期未平倉口數: 外資 {f_oi} 口 | 投信 {t_oi} 口 | 自營商 {d_oi} 口")

    # 4. 外資與投信買賣超 TOP 10 個股 (T86)
    print("[4/4] 抓取個股三大法人買賣超排行 (TOP 10)...")
    try:
        t86 = fetch_twse_json("https://www.twse.com.tw/rwd/zh/fund/T86?response=json&selectType=ALL")
        stocks = []
        for r in t86.get("data", []):
            code = r[0].strip()
            name = r[1].strip()
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

    return market_overview

def enrich_market_overview(market_overview, briefs):
    """補齊連買連賣數據、細部註解與專業摘要引言"""
    foreign_raw = market_overview.get("foreign_raw", 0.0)
    trust_raw = market_overview.get("trust_raw", 0.0)
    f_streak, t_streak = calculate_streaks(briefs, foreign_raw, trust_raw)

    trade_iso = tw_date_to_iso(market_overview.get("raw_tw_date", ""))
    dt_obj = datetime.strptime(trade_iso, "%Y-%m-%d")
    month_day_str = f"{dt_obj.month}月{dt_obj.day}日"
    weekday_str = f"週{WEEKDAY_MAP[dt_obj.weekday()]}"
    close_idx = market_overview.get("index_close", "--")
    chg = market_overview.get("index_change", "")
    vol = market_overview.get("volume", "")
    
    inst = market_overview.get("institutions", {})
    f_val = inst.get("foreign", "")
    t_val = inst.get("investment_trust", "")
    d_val = inst.get("dealer", "")
    tot_val = inst.get("total", "")

    futures = market_overview.get("futures_data", {})
    f_fut = futures.get("foreign", {})
    t_fut = futures.get("trust", {})
    f_oi = f_fut.get("net_oi", "")
    t_oi = t_fut.get("net_oi", "")

    # 籌碼細部小標籤
    if f_oi:
        inst["foreign_futures"] = f"外資現貨單日再砍 {abs(foreign_raw):,.0f} 億 (連 {f_streak} 賣)，台指期淨空單 {f_oi.replace(\"-\", \"\").strip()} 口高檔警戒"
    else:
        inst["foreign_futures"] = f"外資現貨賣超 {f_val} (連 {f_streak} 賣)，期貨空單維持高水位避險"

    if t_oi:
        inst["trust_note"] = f"投信買超 {t_val} (連 {t_streak} 買逆勢護盤)，台指期淨多單 {t_oi} 口"
    else:
        inst["trust_note"] = f"投信買超 {t_val} 連續第 {t_streak} 個交易日買超力挺"

    inst["dealer_note"] = f"自營商自行買賣與避險操作合計調節 {d_val}"
    inst["total_note"] = f"三大法人單日合計調節 {tot_val}"

    # 專業前言
    chg_val = market_overview.get("change_val", 0.0)
    c_val = market_overview.get("close_val", 0.0)
    
    if chg_val < -500:
        market_overview["monthly_change"] = f"加權指數單日重挫 {abs(chg_val):,.0f} 點摜破關鍵整數關卡，爆出 {vol} 巨量，外資現貨與期貨空單全面高壓壟罩"
        lead_action = f"遭遇沈重賣壓，指數開低走低狂瀉 {abs(chg_val):,.0f} 點"
    elif chg_val > 500:
        market_overview["monthly_change"] = f"加權指數強勢飆漲 {chg_val:,.0f} 點收復整數關卡，多方買盤強勢表態"
        lead_action = f"多方氣勢如虹，指數跳空開高強彈 {chg_val:,.0f} 點"
    else:
        market_overview["monthly_change"] = f"全月加權指數震盪洗盤，多空於整數關卡展開激烈攻防"
        lead_action = f"呈現區間震盪整理，指數終場變動 {chg}"

    lead_text = (
        f"今日（{month_day_str}，{weekday_str}）台股{lead_action}，終場收在 {close_idx} 點（{chg}），"
        f"市場成交金額為 {vol}。三大法人籌碼動向方面，外資動態為 {f_val}（連 {f_streak} 賣），台指期未平倉淨空單來到 {f_oi or '高檔'} 口；"
        f"投信買超 {t_val} 達成連續第 {t_streak} 個交易日逆勢護盤，自營商調節 {d_val}，三大法人合計調節 {tot_val}。"
        f"下方彙整今日外資與投信前十大核心進出個股，完整技術線型、關鍵支撐壓力與操作策略請參閱今日 VIP 報告。"
    )
    market_overview["lead_paragraph"] = lead_text
    market_overview["f_streak"] = f_streak
    market_overview["t_streak"] = t_streak
    return market_overview

def update_calendar_json(today_date: str):
    """自動同步重大行事曆時程狀態"""
    if not CALENDAR_PATH.exists():
        return
    try:
        with open(CALENDAR_PATH, "r", encoding="utf-8") as f:
            cal = json.load(f)
        
        cal["updated_at"] = today_date
        
        # 若當前日期已推進至 11/05，更新關卡三的戰報引導
        for stage in cal.get("stages", []):
            if stage.get("stage_id") == "stage-3":
                stage["tactical_observation"] = (
                    "【最新戰報】今晚（11/05）21:30 美國公布最新單週初領失業金人數，"
                    "明晚（11/06）21:30 迎來重磅 10 月非農就業報告。在通膨依然具備黏性的當下，"
                    "這份就業數據將為美國實質經濟是否陷入硬著陸給出關鍵定音，直接主導 12 月聯準會利率路徑與美債長端殖利率走向。"
                )
        
        with open(CALENDAR_PATH, "w", encoding="utf-8") as f:
            json.dump(cal, f, ensure_ascii=False, indent=2)
        print(f"📅 重大行事曆狀態已同步更新至 {CALENDAR_PATH.name}！")
    except Exception as e:
        print(f"⚠️ 更新行事曆異常: {e}")


def sync_snapshot_3m(today_date: str):
    """將 stock_3m_highlow 最新的 snapshot CSV 同步轉換為 snapshot_3m.json"""
    import csv
    snapshot_dir = Path("c:/stock_dashboard/stock_3m_highlow/reports")
    target_csv = snapshot_dir / f"snapshot_3m_{today_date}.csv"
    if not target_csv.exists():
        csv_files = sorted(snapshot_dir.glob("snapshot_3m_*.csv"))
        if csv_files:
            target_csv = csv_files[-1]
        else:
            print("⚠️ 未找到任何 3M snapshot CSV 檔案。")
            return

    try:
        stocks = []
        with open(target_csv, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                stocks.append({
                    "date": row.get("日期", ""),
                    "code": str(row.get("代號", "")),
                    "name": row.get("名稱", ""),
                    "market": row.get("市場", ""),
                    "direction": row.get("方向", ""),
                    "price": str(row.get("觸發價", "")),
                    "key_price": str(row.get("關鍵價位", ""))
                })
        
        high_count = sum(1 for s in stocks if s["direction"] == "紅K")
        low_count = sum(1 for s in stocks if s["direction"] == "黑K")
        out_data = {
            "date": target_csv.stem.replace("snapshot_3m_", ""),
            "total_count": len(stocks),
            "high_count": high_count,
            "low_count": low_count,
            "stocks": stocks
        }
        out_json = BASE_DIR / "data" / "snapshot_3m.json"
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(out_data, f, ensure_ascii=False, indent=2)
        print(f"⚡ 成功同步 3M 新高低快照：{out_data['date']}，共 {len(stocks)} 檔（創高 {high_count}｜破低 {low_count}）")
    except Exception as e:
        print(f"⚠️ 同步 3M 新高低快照失敗：{e}")

def update_briefs_json(market_overview, force=False):
    """將今日最新大盤與籌碼資料同步至 briefs.json（含休市防呆）"""
    if not DATA_PATH.exists():
        print(f"⚠️ 未找到 {DATA_PATH}")
        return False

    today_real_date = datetime.now().strftime("%Y-%m-%d")
    trade_date = tw_date_to_iso(market_overview.get("raw_tw_date", ""))

    if not force and trade_date != today_real_date:
        print(f"\n☕ [休市防呆] 今日（{today_real_date}）台股未開盤（國定連假 / 颱風假 / 週末休市）。")
        print(f"   證交所最新交易日仍為 [{trade_date}]，略過自動覆蓋以防誤更！")
        return False

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        briefs = json.load(f)

    # 豐富化籌碼與引言
    market_overview = enrich_market_overview(market_overview, briefs)

    today_date = trade_date
    dt_obj = datetime.strptime(today_date, "%Y-%m-%d")
    weekday_str = WEEKDAY_MAP[dt_obj.weekday()]
    today_disp = f"{dt_obj.strftime('%m/%d')} ({weekday_str})"
    
    chg_val = market_overview.get("change_val", 0.0)
    c_val = market_overview.get("close_val", 0.0)
    f_streak = market_overview.get("f_streak", 1)
    t_streak = market_overview.get("t_streak", 1)
    f_val_str = market_overview.get("institutions", {}).get("foreign", "")
    vol_str = market_overview.get("volume", "")

    # 動態產生吸睛專業標題
    if chg_val < -1000:
        action_verb = f"台股狂瀉 {abs(chg_val):,.0f} 點摜破 42,000 關卡"
    elif chg_val < -500:
        action_verb = f"重挫 {abs(chg_val):,.0f} 點失守關鍵支撐"
    elif chg_val > 1000:
        action_verb = f"驚天狂飆 {chg_val:,.0f} 點強勢收復整數大關"
    elif chg_val > 500:
        action_verb = f"大漲 {chg_val:,.0f} 點多頭強勢反攻"
    else:
        action_verb = f"震盪收 {c_val:,.0f} 點"

    today_title = f"{dt_obj.strftime('%m%d')} 盤後快訊 - {action_verb}！外資砍 {f_val_str.replace('+', '').replace('-', '')}、投信連 {t_streak} 買力挺"

    summary_text = (
        f"今日台股開低走低，終場狂瀉 {abs(chg_val):,.0f} 點（{market_overview.get('index_change', '')}）收在 {c_val:,.2f} 點摜破 42,000 大關，"
        f"成交金額放大至 {vol_str} 巨量。權值股承壓，外資現貨再砍 {f_val_str.replace('-', '')}（連 {f_streak} 賣），"
        f"台指期淨空單攀升至 {market_overview.get('futures_data', {}).get('foreign', {}).get('net_oi', '高檔')} 口歷史警戒；"
        f"投信買超 {market_overview.get('institutions', {}).get('investment_trust', '')} 達成連 {t_streak} 買力挺護盤。"
        f"今晚聚焦美國初領失業金人數，明晚迎戰 10 月非農就業定音。"
    )

    tags = [
        "大盤解析",
        f"狂瀉{abs(chg_val):,.0f}點" if chg_val < 0 else f"大漲{chg_val:,.0f}點",
        "失守42000" if c_val < 42000 else "守穩42000",
        f"外資連{f_streak}賣",
        f"投信連{t_streak}買",
        "期貨空單9.5萬口",
        "聚焦非農與失業金"
    ]

    for b in briefs:
        b["is_latest"] = False

    existing_item = None
    existing_idx = None
    for idx, b in enumerate(briefs):
        if b.get("date") == today_date or b.get("id") == today_date:
            existing_item = b
            existing_idx = idx
            break

    # 清理暫存數值避免污染 JSON
    for k in ["close_val", "change_val", "vol_val", "foreign_raw", "trust_raw", "dealer_raw", "f_streak", "t_streak"]:
        market_overview.pop(k, None)

    if existing_item:
        existing_item["market_overview"] = market_overview
        existing_item["is_latest"] = True
        existing_item["title"] = today_title
        existing_item["summary"] = summary_text
        existing_item["tags"] = tags
        # 若原先為複製的舊連結，重置為待上線狀態
        if existing_item.get("url") == briefs[1].get("url") if len(briefs) > 1 else False:
            existing_item["url"] = ""
        print(f"🔄 成功將最新大盤數據與標題更新至既有項目：{existing_item.get('title')}")
    else:
        new_item = {
            "id": today_date,
            "date": today_date,
            "display_date": today_disp,
            "title": today_title,
            "url": "",  # 初始待發布，待作者提供 Google Doc
            "summary": summary_text,
            "tags": tags,
            "is_latest": True,
            "market_overview": market_overview
        }
        briefs.insert(0, new_item)
        print(f"✨ 成功自動建立（{today_date}）最新快訊戰報項目！")

    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(briefs, f, ensure_ascii=False, indent=2)

    print(f"💾 {DATA_PATH.name} 已成功儲存！共 {len(briefs)} 篇快訊。")

    # 同步更新行事曆
    update_calendar_json(today_date)
    sync_snapshot_3m(today_date)
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
