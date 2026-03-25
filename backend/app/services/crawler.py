# -*- coding: utf-8 -*-
"""
마이옥션 크롤링 서비스
- Selenium + BeautifulSoup 기반 사이트 정보 파싱
- final.py의 parse_myauction_detail, fetch_land_zoning_from_plan 등 통합
"""

import re
import logging
import requests
from typing import Optional
from urllib.parse import urljoin, urlparse, parse_qs
from bs4 import BeautifulSoup

from ..core.utils import (
    extract_number_before_won, extract_area_pair,
    split_address_old, clean_land_zoning_text, determine_mode,
)

logger = logging.getLogger(__name__)


# ============================================================
# HTML 파싱 유틸
# ============================================================
def fetch_soup(url: str) -> BeautifulSoup:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        )
    }
    resp = requests.get(url, headers=headers, timeout=20)
    resp.raise_for_status()
    resp.encoding = "utf-8"
    return BeautifulSoup(resp.text, "html.parser")


def fetch_soup_from_driver(driver) -> BeautifulSoup:
    html = driver.page_source or ""
    return BeautifulSoup(html, "html.parser")


# ============================================================
# 감정평가현황 블록
# ============================================================
def find_appraisal_block(soup: BeautifulSoup):
    h3 = soup.find("h3", string=lambda s: s and "감정평가현황" in s)
    if not h3:
        return None
    parent = h3
    while parent and parent.name != "body":
        if parent.get("id") == "dtl_stock":
            return parent
        parent = parent.parent
    return None


# ============================================================
# 건축물현황 테이블
# ============================================================
def find_building_status_table(soup: BeautifulSoup):
    def _is_building_status_h3(tag):
        if not tag or tag.name != "h3":
            return False
        txt = tag.get_text(" ", strip=True).replace(" ", "")
        return "건축물현황" in txt

    h3 = soup.find(_is_building_status_h3)
    if h3:
        dtl_title = h3.find_parent()
        if dtl_title:
            dtl_table = dtl_title.find_next_sibling()
            if dtl_table:
                tbl = dtl_table.find("table", class_="tbl_detail")
                if tbl:
                    return tbl
        tbl = h3.find_next("table", class_="tbl_detail")
        if tbl:
            return tbl

    dtl_stock = soup.find(id="dtl_stock")
    if dtl_stock:
        tbl = dtl_stock.find("table", class_="tbl_detail")
        if tbl:
            return tbl

    tables = soup.find_all("table", class_="tbl_detail")
    if len(tables) == 1:
        return tables[0]
    return None


# ============================================================
# 구조/규모/지붕 파싱
# ============================================================
def parse_structure_scale_roof(soup: BeautifulSoup, appraisal_text: str):
    def _clean_text(s: str) -> str:
        return (s or "").replace("\xa0", " ").strip()

    def _norm_key(k: str) -> str:
        k = (k or "").replace("\xa0", "").strip()
        k = re.sub(r"\s+", "", k)
        k = re.sub(r"[()（）\[\]【】{}<>]", "", k)
        return k

    def norm_floor(v: str) -> str:
        v = (v or "").replace("\xa0", "").strip()
        if not v or v in ("공란", "-", "없음", "미기재"):
            return ""
        v = v.replace(" ", "")
        v = re.sub(r"^(지상|지하)", "", v)
        v = re.sub(r"층$", "", v)
        m = re.fullmatch(r"\d+", v)
        return f"{m.group(0)}층" if m else ""

    def _floor_to_str(v: str) -> str:
        v = (v or "").strip()
        if not v:
            return ""
        m = re.search(r"(\d+)", v)
        return f"{m.group(1)}층" if m else v

    def _extract_roof(text: str) -> str:
        text = text or ""
        m = re.search(r"([가-힣A-Za-z]+지붕(?:\([^)]+\))?)", text)
        return m.group(1).replace(" ", "").strip() if m else ""

    def _extract_structure_scale_from_text(text: str):
        text = text or ""
        structure = ""
        m_s = re.search(r"([가-힣A-Za-z]+구조)", text)
        if m_s:
            structure = m_s.group(1).replace(" ", "").strip()
        below, above = "", ""
        m_b = re.search(r"지하\s*(\d+)\s*층?", text)
        m_a = re.search(r"지상\s*(\d+)\s*층?", text)
        if m_b:
            below = f"{m_b.group(1)}층"
        if m_a:
            above = f"{m_a.group(1)}층"
        scale = ""
        if above and not below:
            scale = f"지상{_floor_to_str(above)}"
        elif below and not above:
            scale = f"지하{_floor_to_str(below)}"
        else:
            parts = []
            if below:
                parts.append(f"지하{_floor_to_str(below)}")
            if above:
                parts.append(f"지상{_floor_to_str(above)}")
            scale = ", ".join(parts)
        return structure, scale

    def _split_building_blocks_from_appraisal(text: str) -> list:
        text = text or ""
        idx = text.find("[건물]")
        t = text[idx:] if idx != -1 else text
        parts = re.split(r"(?=(?:기호)\s*\d+\s*:)", t)
        blocks = [p.strip() for p in parts if p.strip() and p.strip() != "[건물]"]
        if not blocks:
            t = t.strip()
            return [t] if t else []
        return blocks

    # 1) 건축물현황 테이블 파싱
    tbl = find_building_status_table(soup)
    kv = {}
    if tbl:
        for tr in tbl.find_all("tr"):
            cells = tr.find_all(["th", "td"], recursive=False)
            i = 0
            while i < len(cells) - 1:
                if cells[i].name == "th" and cells[i + 1].name == "td":
                    k = _norm_key(cells[i].get_text(strip=True))
                    v = _clean_text(cells[i + 1].get_text(" ", strip=True))
                    if k:
                        kv[k] = v
                    i += 2
                else:
                    i += 1

    # 2) 대표 구조/규모
    structure = (kv.get("구조") or "").strip()

    def _kv_get_floor_value(target: str) -> str:
        for k, v in kv.items():
            kk = _norm_key(k)
            if kk == target or kk.startswith(target) or target in kk:
                vv = (v or "").replace("\xa0", "").strip()
                if vv and vv not in ("공란", "-", "없음", "미기재"):
                    return vv
        return ""

    above = norm_floor(_kv_get_floor_value("지상층수") or _kv_get_floor_value("지상층") or kv.get("지상층수"))
    below = norm_floor(_kv_get_floor_value("지하층수") or _kv_get_floor_value("지하층") or kv.get("지하층수"))

    scale = ""
    if above and not below:
        scale = f"지상{_floor_to_str(above)}"
    elif below and not above:
        scale = f"지하{_floor_to_str(below)}"
    else:
        parts = []
        if below:
            parts.append(f"지하{_floor_to_str(below)}")
        if above:
            parts.append(f"지상{_floor_to_str(above)}")
        scale = ", ".join(parts)

    # 3) 부속 건축물
    annex_summaries = []
    MAX_ANNEX_SHOW = 3

    if not tbl:
        blocks = _split_building_blocks_from_appraisal(appraisal_text)
        if blocks:
            rep_structure, rep_scale = _extract_structure_scale_from_text(blocks[0])
            if not structure:
                structure = rep_structure
            if not scale:
                scale = rep_scale
            for b in blocks[1:]:
                s2, sc2 = _extract_structure_scale_from_text(b)
                r2 = _extract_roof(b)
                piece = ""
                if s2 and r2:
                    piece = f"{s2}, {r2}" if r2 not in s2 else s2
                elif s2:
                    piece = s2
                elif r2:
                    piece = r2
                if piece and sc2:
                    piece = f"{piece} / {sc2}"
                elif (not piece) and sc2:
                    piece = sc2
                if piece:
                    annex_summaries.append(piece)

    # 4) 지붕
    roof = _extract_roof(appraisal_text) if appraisal_text else ""

    # 5) 최종 조립
    final_structure = structure.strip() if structure else ""
    if roof:
        if final_structure:
            if roof not in final_structure:
                final_structure = f"{final_structure}, {roof}".strip()
        else:
            final_structure = roof

    if annex_summaries:
        shown = annex_summaries[:MAX_ANNEX_SHOW]
        remain = len(annex_summaries) - len(shown)
        annex_text = "; ".join(shown)
        if remain > 0:
            annex_text = f"{annex_text} 외 {remain}동"
        final_structure = (
            f"{final_structure} (부속: {annex_text})".strip()
            if final_structure
            else f"(부속: {annex_text})"
        )

    return final_structure, scale


# ============================================================
# 사진 URL
# ============================================================
def parse_main_photo_url(soup: BeautifulSoup, base_url: str) -> str:
    img = soup.find("img", alt=lambda s: s and "물건사진" in s)
    if not img:
        img = soup.find("img", src=lambda s: s and "thumb_1.php" in s)
    if not img or not img.get("src"):
        return ""
    thumb_src = img["src"]
    full_thumb = urljoin(base_url, thumb_src)
    if "thumb_1.php" in full_thumb:
        parsed = urlparse(full_thumb)
        qs = parse_qs(parsed.query)
        q_string = qs.get("q_string", [""])[0]
        if q_string:
            return urljoin("https://photo.nuriauction.com", q_string)
    return full_thumb


# ============================================================
# 토지이용계획 (지역지구)
# ============================================================
def fetch_land_zoning_from_plan(driver, *args) -> str:
    if len(args) == 1:
        landplan_url = args[0]
    elif len(args) == 2:
        landplan_url = args[1]
    else:
        return ""

    landplan_url = (landplan_url or "").strip()
    if not landplan_url:
        return ""

    s = requests.Session()
    try:
        for c in driver.get_cookies():
            name, value = c.get("name"), c.get("value")
            domain = c.get("domain")
            if name and value is not None and domain:
                s.cookies.set(name, value, domain=domain, path=c.get("path", "/"))
    except Exception:
        pass

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": landplan_url,
    }

    try:
        r = s.get(landplan_url, headers=headers, timeout=20, allow_redirects=True)
        r.raise_for_status()
        html = r.text or ""
    except Exception:
        return ""

    soup = BeautifulSoup(html, "html.parser")

    def _clean_label(txt: str) -> str:
        if not txt:
            return ""
        t = txt.replace("\xa0", " ").strip()
        bad = {"연도별보기", "변경", "도면크게보기", "보기", "닫기", "자세히", "새창으로", "새창으로열기"}
        for b in list(bad):
            t = t.replace(b, " ")
        t = re.sub(r"\([^)]*\)", "", t)
        t = re.sub(r"\<[^>]*\>", "", t)
        t = re.sub(r"\[[^\]]*\]", "", t)
        t = re.sub(r"\{[^}]*\}", "", t)
        t = re.sub(r"\s+", " ", t).strip(" ,")
        return t.strip()

    def _is_inside_layer_pop(tag) -> bool:
        try:
            return tag.find_parent(class_="layer_pop") is not None
        except Exception:
            return False

    results, seen = [], set()
    for td_id in ("present_mark1", "present_mark2"):
        td = soup.find("td", id=td_id)
        if not td:
            continue
        for a in td.find_all("a"):
            if _is_inside_layer_pop(a):
                continue
            cls = " ".join(a.get("class", []) or [])
            if "link" not in cls:
                onclick = a.get("onclick") or ""
                if "openLandLayer" not in onclick:
                    continue
            txt = _clean_label(a.get_text(" ", strip=True) or "")
            if not txt or txt in {"보기", "닫기", "자세히", "연도별보기", "변경", "도면크게보기"}:
                continue
            if txt not in seen:
                seen.add(txt)
                results.append(txt)

    return ", ".join(results).strip()


# ============================================================
# 메인 파서
# ============================================================
def parse_myauction_detail(soup: BeautifulSoup, base_url: str, driver=None) -> dict:
    data = {
        "court": "", "case_number": "", "address": "", "address_old": "",
        "land_zoning": "", "appraisal_raw": "", "item_type": "",
        "land_area_m2": "", "land_area_py": "",
        "building_area_m2": "", "building_area_py": "", "xx평형": "",
        "building_structure": "", "building_scale": "",
        "auction_date": "", "appraised_price": "", "min_price": "",
        "min_rate": "", "deposit": "", "claim_amount": "",
        "photo_url": "", "landplan_url": "",
    }

    # 법원/사건번호
    h2 = soup.find("h2")
    if h2:
        span_case = h2.find("span", class_="blue")
        if span_case:
            data["case_number"] = span_case.get_text(strip=True)
        full_text = h2.get_text(" ", strip=True)
        if data["case_number"]:
            full_text = full_text.replace(data["case_number"], "")
        full_text = re.sub(r"\[.*?\]", "", full_text)
        data["court"] = full_text.strip()

    # 소재지
    dtl_stock = soup.find("div", id="detail_left") or soup
    tables = dtl_stock.find_all("table", class_="tbl_detail")

    if tables:
        th = tables[0].find("th", string=lambda s: s and "소재지" in s)
        if th:
            td = th.find_next("td")
            if td:
                raw_addr = td.get_text(" ", strip=True)
                main_addr, old_addr = split_address_old(raw_addr)
                data["address"] = main_addr
                data["address_old"] = old_addr

    # 기본 정보 테이블
    basic_table = None
    for tbl in tables:
        th = tbl.find("th", string=lambda s: s and "경매종류" in s)
        if th:
            basic_table = tbl
            break

    if basic_table:
        for field, th_text, extractor in [
            ("item_type", "물건종류", lambda td: td.get_text(" ", strip=True)),
            ("appraised_price", "감정가", lambda td: extract_number_before_won(td.get_text(" ", strip=True)) + "원"),
            ("deposit", "입찰보증금", lambda td: extract_number_before_won(td.get_text(" ", strip=True)) + "원"),
            ("claim_amount", "청구금액", lambda td: extract_number_before_won(td.get_text(" ", strip=True)) + "원"),
        ]:
            th = basic_table.find("th", string=lambda s, t=th_text: s and t in s)
            if th:
                td = th.find_next("td")
                if td:
                    data[field] = extractor(td)

        # 토지/건물면적
        th = basic_table.find("th", string=lambda s: s and "토지면적" in s)
        if th:
            td = th.find_next("td")
            if td:
                m2, py = extract_area_pair(td.get_text(" ", strip=True))
                data["land_area_m2"] = m2
                data["land_area_py"] = py

        th = basic_table.find("th", string=lambda s: s and "건물면적" in s)
        if th:
            td = th.find_next("td")
            if td:
                cell_text = td.get_text(" ", strip=True)
                m2, py = extract_area_pair(cell_text)
                data["building_area_m2"] = m2
                data["building_area_py"] = py
                m_type = re.search(r"\[?\s*([0-9.,]+평형)\s*\]?", cell_text)
                data["xx평형"] = f"[{m_type.group(1)}]" if m_type else ""

        # 최저가
        th = basic_table.find("th", string=lambda s: s and "최저가" in s)
        if th:
            td = th.find_next("td")
            if td:
                data["min_price"] = extract_number_before_won(td.get_text(" ", strip=True)) + "원"
                span = td.find("span", class_="down_p")
                if span:
                    m = re.search(r"(\d+)\s*%", span.get_text())
                    if m:
                        data["min_rate"] = m.group(1) + "%"

    # 입찰/매각기일
    auction_date = ""
    plan_day_p = soup.find("p", class_="plan_day")
    if plan_day_p:
        span = plan_day_p.find_next("span", class_="pink")
        if span:
            auction_date = span.get_text(strip=True)
    if not auction_date:
        th = soup.find(["th", "td"], string=lambda s: s and ("매각기일" in s or "입찰기일" in s))
        if th:
            td = th.find_next("td")
            if td:
                m = re.search(r"\d{4}-\d{2}-\d{2}", td.get_text(" ", strip=True))
                if m:
                    auction_date = m.group(0)
    data["auction_date"] = auction_date

    # 감정평가현황
    jraw_td = soup.find("td", id="jraw")
    if jraw_td:
        data["appraisal_raw"] = jraw_td.get_text(" ", strip=True)

    appraisal_block = find_appraisal_block(soup)
    appraisal_text = appraisal_block.get_text(" ", strip=True) if appraisal_block else ""
    final_structure, scale = parse_structure_scale_roof(soup, appraisal_text)
    if final_structure:
        data["building_structure"] = final_structure
    if scale:
        data["building_scale"] = scale

    # 토지이용계획 URL
    a_landplan = soup.find("a", string=lambda s: s and "토지이용계획" in s)
    if a_landplan and a_landplan.get("href"):
        href = a_landplan["href"]
        data["landplan_url"] = href if href.startswith("http") else urljoin(base_url, href)

    # 대표사진
    data["photo_url"] = parse_main_photo_url(soup, base_url)

    # MODE 판별
    land_mode, building_mode = determine_mode(data.get("item_type", ""), data.get("building_area_m2", ""))
    data["LAND_MODE"] = land_mode
    data["BUILDING_MODE"] = building_mode

    logger.info(f"MODE: {'토지' if land_mode else '건축물'} | {data.get('item_type')}")
    return data
