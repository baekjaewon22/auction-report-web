# -*- coding: utf-8 -*-
"""브리핑자료 전용 권리분석 데이터 구성.

권리분석 보증서와 원자료 파싱 원리는 유사하지만, 문안과 구성은 브리핑자료
전용으로 분기한다. 이 모듈은 보증서용 template_data를 직접 재사용하지 않는다.
"""

from __future__ import annotations

from typing import Optional

from . import rights_certificate as rc


def extract_context(soup, driver=None, task_id: Optional[str] = None) -> dict:
    """브리핑자료에서 사용할 권리분석 원자료를 추출한다."""
    selector_fields = rc._extract_selector_fields(soup)
    rights_ocr_context = rc.extract_rights_context_by_ocr(driver, task_id=task_id) if driver else {}
    rights = rc.merge_rights(rc._extract_rights(soup), rights_ocr_context.get("rights") or [])
    tenant_context = rc.extract_tenant_context_by_ocr(driver, task_id=task_id) if driver else {}
    status_survey_context = rc.extract_status_survey_context_by_ocr(driver, task_id=task_id) if driver else {}

    context = {
        "rights": rights,
        "rights_ocr_text": rights_ocr_context.get("rights_ocr_text", ""),
        "rights_ocr_images": rights_ocr_context.get("rights_ocr_images", []),
        "tenants": tenant_context.get("tenants") or rc._extract_tenants(soup),
        "tenant_source": tenant_context.get("tenant_source", ""),
        "tenant_ocr_text": tenant_context.get("tenant_ocr_text", ""),
        "tenant_ocr_images": tenant_context.get("tenant_ocr_images", []),
        "sale_spec_remarks": tenant_context.get("sale_spec_remarks", ""),
        "status_survey_etc": status_survey_context.get("status_survey_etc")
        or rc._extract_status_survey_etc_from_text(soup.get_text("\n", strip=True)),
        "status_survey_text": status_survey_context.get("status_survey_text", ""),
        "dividend_requests": rc._extract_dividend_requests(soup),
        "related_cases": rc._extract_related_cases(soup),
        "auction_applicant_creditors": rc._extract_auction_applicant_creditors(soup, selector_fields.get("case_number") or ""),
        "management_fee": rc._extract_management_fee(soup),
        "market_data": rc._extract_market_data(soup),
    }
    context["expected_dividend"] = rc._extract_expected_dividend(
        soup,
        selector_fields.get("case_number") or "",
        context.get("auction_applicant_creditors") or [],
    )
    context.update(selector_fields)
    return context


def build_opinion_data(data: dict) -> dict:
    """브리핑자료 의견 작성에 필요한 전용 데이터로 변환한다."""
    rights = data.get("rights") or []
    tenants = data.get("tenants") or []
    valid_tenants = [tenant for tenant in tenants if not rc._is_no_tenant_record(tenant)]
    dividend_requests = data.get("dividend_requests") or []
    related_cases = data.get("related_cases") or []
    management_fee = data.get("management_fee") or {}
    market_data = data.get("market_data") or {}

    base_right = _select_base_right(data, rights)
    tenant_texts = rc.analyze_tenants(
        valid_tenants,
        base_right,
        dividend_requests,
        data.get("sale_spec_dividend_deadline") or "",
        data.get("address") or "",
    )
    registered_takeover_texts = rc.analyze_registered_takeover_rights(rights, base_right, dividend_requests)

    tenant_analysis_text = rc.build_tenant_analysis_text(
        tenants,
        tenant_texts,
        data.get("tenant_ocr_text") or "",
        data.get("tenant_source") or "",
    )
    if registered_takeover_texts:
        tenant_analysis_text = rc.combine_tenant_and_registered_takeover_texts(
            tenant_analysis_text,
            registered_takeover_texts,
        )

    sale_spec_remarks_text = rc._polite_optional_note(
        data.get("sale_spec_remarks"),
        "매각물건명세서 비고란에 별도로 기재된 사항은 없습니다.",
    )
    status_survey_etc_text = rc._polite_optional_note(
        data.get("status_survey_etc"),
        "현황조사서 기타란에 별도로 기재된 사항은 없습니다.",
    )
    case_notice_text = rc._clean_document_note(data.get("case_notice"), limit=500)
    no_tenants = tenant_analysis_text == rc.NO_TENANTS_TEXT

    return {
        "baseRightDescription": _build_base_right_description(base_right, registered_takeover_texts),
        "tenantAnalysisText": tenant_analysis_text,
        "tenantAnalyses": [] if no_tenants else [
            {"description": block.strip()}
            for block in tenant_analysis_text.split("\n\n")
            if block.strip()
        ],
        "noTenants": no_tenants,
        "surplusDescription": _build_surplus_description(data, rights, related_cases, base_right),
        "specialSummaryText": _build_special_summary_text(
            data,
            rights,
            valid_tenants,
            base_right,
            tenant_texts,
            tenant_analysis_text,
            registered_takeover_texts,
            management_fee,
            market_data,
            sale_spec_remarks_text,
            status_survey_etc_text,
            case_notice_text,
        ),
        "caseNoticeText": case_notice_text,
        "주의사항": case_notice_text,
    }


def _select_base_right(data: dict, rights: list[dict]) -> Optional[dict]:
    sale_spec_base_right = data.get("sale_spec_base_right") or {}
    selector_base_right = data.get("selector_base_right") or {}
    if sale_spec_base_right.get("date"):
        base_right = sale_spec_base_right
    elif selector_base_right.get("date"):
        base_right = selector_base_right
    else:
        base_right = rc.find_base_right(rights)
    return rc.enrich_base_right_from_registry(base_right, rights)


def _build_base_right_description(base_right: Optional[dict], registered_takeover_texts: list[str]) -> str:
    if not base_right:
        return (
            "등기부현황과 매각물건명세서에서 말소기준권리 확인이 필요합니다. "
            "원본 문서를 기준으로 담당자 최종 확인이 필요합니다."
        )

    date = base_right.get("date") or "일자 확인 필요"
    right_type = base_right.get("type") or "권리종류 확인 필요"
    creditor = base_right.get("creditor") or "권리자 확인 필요"
    conclusion = "이후 권리는 모두 말소되며 등기부 상 낙찰자가 인수해야 하는 권리는 없습니다."
    if registered_takeover_texts:
        conclusion = "다만 최선순위 설정일보다 앞선 전세권은 임차권리 인수사항에서 별도 검토가 필요합니다."
    return f"최선순위 {date} 자 {creditor} {right_type}이 '말소기준권리'이므로, {conclusion}"


def _build_surplus_description(data: dict, rights: list[dict], related_cases: list[dict], base_right: Optional[dict] = None) -> str:
    min_bid = rc.parse_money(data.get("min_price"))
    appraised = rc.parse_money(data.get("appraised_price"))
    total_debt = sum(int(r.get("amount") or 0) for r in rights if r.get("amount"))
    expected_dividend = data.get("expected_dividend") or {}
    applicant_creditors = data.get("auction_applicant_creditors") or []
    expected_amount = int(expected_dividend.get("auctionApplicantDividendAmount") or 0)

    lines: list[str] = []
    if not appraised or not rights:
        lines.append("감정가 또는 등기부상 채권 총액 확인이 필요하여 취하 가능성을 확정하지 못했습니다.")
    else:
        debt_rate = total_debt / appraised
        debt_rate_text = _format_percent(debt_rate * 100)
        if debt_rate < 0.7:
            lines.append(
                f"확인된 채권 총액은 {rc.fmt_money(total_debt)}으로 감정가 {rc.fmt_money(appraised)} 대비 "
                f"{debt_rate_text}이며, 70% 미만이므로 취하 가능성이 있습니다."
            )
        else:
            lines.append(
                f"확인된 채권 총액은 {rc.fmt_money(total_debt)}으로 감정가 {rc.fmt_money(appraised)} 대비 "
                f"{debt_rate_text}이며, 70% 이상이므로 취하 가능성은 낮습니다."
            )

    if _has_duplicate_auction_case(related_cases):
        lines.append("중복경매 신청 사건이 확인되므로, 단순 무잉여를 이유로 한 절차 기각 가능성은 낮습니다.")
    elif expected_dividend.get("auctionApplicantDividendFound") and expected_amount > 0:
        lines.append("경매신청채권자는 순위배당시 배당을 받을 수 있으므로 무잉여 가능성은 없습니다.")
    elif rc._base_right_creditor_is_auction_applicant(base_right, applicant_creditors):
        lines.append("최선순위 설정권자와 경매신청채권자가 동일하여 우선 배당 가능성이 높으므로 무잉여 가능성은 없습니다.")
    else:
        lines.append(f"현재 경매 최저가는 {rc.fmt_money(min_bid)}이므로 무잉여 가능성이 존재합니다.")

    case_text = ", ".join(
        f"{c.get('type', '관련사건')} {c.get('caseNumber', '')}".strip()
        for c in related_cases
    )
    if case_text:
        lines.append(f"관련 사건은 {case_text}입니다.")
    return "\n".join(lines)


def _format_percent(value: float) -> str:
    if abs(value - round(value)) < 0.05:
        return f"{round(value)}%"
    return f"{value:.1f}%"


def _has_duplicate_auction_case(related_cases: list[dict]) -> bool:
    for case in related_cases or []:
        if "중복" in str(case.get("type") or ""):
            return True
    return False


def _build_special_summary_text(
    data: dict,
    rights: list[dict],
    tenants: list[dict],
    base_right: Optional[dict],
    tenant_texts: list[str],
    tenant_analysis_text: str,
    registered_takeover_texts: list[str],
    management_fee: dict,
    market_data: dict,
    sale_spec_remarks_text: str,
    status_survey_etc_text: str,
    case_notice_text: str,
) -> str:
    lines = ["4) 물건별 특이사항"]
    lines.extend(_property_special_issue_lines(
        data,
        rights,
        tenant_texts,
        tenant_analysis_text,
        registered_takeover_texts,
        sale_spec_remarks_text,
        status_survey_etc_text,
        case_notice_text,
    ))
    lines.extend(rc._bid_check_lines(data, tenants, management_fee))
    return "\n".join(lines)


def _property_special_issue_lines(
    data: dict,
    rights: list[dict],
    tenant_texts: list[str],
    tenant_analysis_text: str,
    registered_takeover_texts: list[str],
    sale_spec_remarks_text: str,
    status_survey_etc_text: str,
    case_notice_text: str,
) -> list[str]:
    issues: list[str] = []
    source_text = " ".join(
        str(value or "")
        for value in (
            data.get("item_type"),
            data.get("address"),
            data.get("appraisal_raw"),
            data.get("sale_spec_remarks"),
            data.get("status_survey_etc"),
            data.get("case_notice"),
            sale_spec_remarks_text,
            status_survey_etc_text,
            case_notice_text,
            tenant_analysis_text,
        )
    )
    if case_notice_text:
        issues.append(f"- 주의사항: {case_notice_text}")
    if any("임차권등기" in (right.get("type") or "") or "임차권등기" in (right.get("rawText") or "") for right in rights):
        issues.append("- 임차권등기: 실제 점유관계와 배당·인수 여부를 원본 문서로 확인해 주시기 바랍니다.")
    if "대지권미등기" in source_text.replace(" ", ""):
        issues.append(rc._land_right_unregistered_issue_text())
    if rc._text_has_priority_repayment("\n".join(tenant_texts + [tenant_analysis_text])):
        issues.append(rc._small_tenant_priority_issue_text())
    if rc._text_has_takeover_tenant("\n".join(tenant_texts + [tenant_analysis_text])):
        issues.append("- 대항력 임차인: 보증금 잔액 인수 가능성을 입찰가 산정에 반영해 주시기 바랍니다.")
    if registered_takeover_texts:
        issues.append("- 선순위 전세권: 배당요구 여부에 따라 낙찰자 인수 가능성이 있으므로 별도 확인이 필요합니다.")
    return issues


__all__ = ["extract_context", "build_opinion_data"]
