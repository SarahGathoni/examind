"""
ExamMind Moderation Service
============================
Handles:
  1. Text extraction from PDF/DOCX/TXT
  2. Claude AI moderation analysis
  3. PDF report generation with ReportLab
"""

import os
import json
import urllib.request
from datetime import datetime
from io import BytesIO

from ..config import settings

# ── DEFAULT MODERATION CRITERIA ───────────────────────────────────────────────

DEFAULT_FORM_TEXT = """
STANDARD UNIVERSITY EXAMINATION MODERATION CRITERIA

1. LEARNING OUTCOMES ALIGNMENT (20 marks)
   - Each question must clearly map to at least one module learning outcome
   - The paper should collectively cover all major learning outcomes

2. BLOOM'S TAXONOMY DISTRIBUTION (20 marks)
   - Remember/Understand: 20-30% of marks
   - Apply/Analyse: 40-50% of marks
   - Evaluate/Create: 20-30% of marks

3. MARK ALLOCATION (15 marks)
   - Marks must be clearly stated for each question and sub-question
   - Total marks must match the stated paper total
   - Mark allocation should reflect question complexity

4. QUESTION CLARITY & LANGUAGE (20 marks)
   - Questions must be unambiguous and clearly worded
   - No spelling or grammatical errors
   - Technical terms used correctly

5. DIFFICULTY BALANCE (15 marks)
   - Mix of straightforward, moderate and challenging questions
   - No questions that are trivially easy or impossibly hard

6. COVERAGE BREADTH (10 marks)
   - Paper should cover the breadth of the syllabus
   - No over-concentration on a single topic area
"""

# ── TEXT EXTRACTION ────────────────────────────────────────────────────────────

def extract_text_from_pdf(path: str) -> str:
    try:
        import pdfplumber
        text = []
        with pdfplumber.open(path) as pdf:
            for i, page in enumerate(pdf.pages):
                page_text = page.extract_text()
                if page_text:
                    text.append(f"--- Page {i+1} ---\n{page_text}")
        return "\n\n".join(text)
    except ImportError:
        from pypdf import PdfReader
        reader = PdfReader(path)
        return "\n".join(p.extract_text() or "" for p in reader.pages)


def extract_text_from_docx(path: str) -> str:
    try:
        import docx
        doc = docx.Document(path)
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except ImportError:
        raise RuntimeError("python-docx not installed.")


def extract_text(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pdf":
        return extract_text_from_pdf(path)
    elif ext in (".docx", ".doc"):
        return extract_text_from_docx(path)
    elif ext == ".txt":
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    else:
        raise ValueError(f"Unsupported file type: {ext}")


# ── CLAUDE AI ANALYSIS ─────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are an expert university examination moderator with 20+ years of experience
in higher education quality assurance. You analyze exam papers rigorously against moderation criteria
and produce detailed, actionable reports. You are thorough, fair, and constructive.
Always return valid JSON only — no markdown fences, no explanations outside the JSON."""


def build_prompt(exam_text: str, form_text: str, meta: dict) -> str:
    return f"""Analyze this university examination paper against the provided moderation form/criteria.

=== MODERATION FORM / CRITERIA ===
{form_text}

=== EXAM PAPER ===
{exam_text}

=== METADATA ===
Course: {meta.get('course', 'Not specified')}
Department: {meta.get('department', 'Not specified')}
Level/Year: {meta.get('level', 'Not specified')}
Total Marks: {meta.get('total_marks', '100')}
Duration: {meta.get('duration', 'Not specified')}
Examiner: {meta.get('examiner', 'Not specified')}
Academic Year: {meta.get('academic_year', datetime.now().year)}

=== INSTRUCTIONS ===
Evaluate the exam paper STRICTLY against the criteria in the moderation form above.
Return a JSON object with this EXACT structure:

{{
  "overall_score": <integer 0-100>,
  "verdict": "Approved for Use" | "Approved with Minor Revisions" | "Major Revision Required" | "Not Approved",
  "verdict_justification": "<2-3 sentence justification>",
  "question_count": <integer>,
  "section_count": <integer>,
  "criteria_scores": [
    {{"criterion": "<name>", "score": <int>, "max_score": <int>, "rating": "Excellent"|"Good"|"Satisfactory"|"Needs Improvement"|"Unsatisfactory", "comment": "<specific comment>"}}
  ],
  "blooms_distribution": [
    {{"level": "Remember", "count": <int>, "marks": <int>, "percentage": <float>, "adequate": <bool>}},
    {{"level": "Understand", "count": <int>, "marks": <int>, "percentage": <float>, "adequate": <bool>}},
    {{"level": "Apply", "count": <int>, "marks": <int>, "percentage": <float>, "adequate": <bool>}},
    {{"level": "Analyse", "count": <int>, "marks": <int>, "percentage": <float>, "adequate": <bool>}},
    {{"level": "Evaluate", "count": <int>, "marks": <int>, "percentage": <float>, "adequate": <bool>}},
    {{"level": "Create", "count": <int>, "marks": <int>, "percentage": <float>, "adequate": <bool>}}
  ],
  "question_analysis": [
    {{"reference": "<e.g. Q1(a)>", "marks": <int>, "bloom_level": "<level>", "clarity_rating": "Clear"|"Acceptable"|"Unclear", "comment": "<feedback>"}}
  ],
  "strengths": ["<strength 1>", "<strength 2>"],
  "weaknesses": ["<weakness 1>"],
  "critical_issues": ["<must-fix issue>"],
  "moderator_remarks": {{
    "paragraph_1_overview": "<overview>",
    "paragraph_2_academic_quality": "<quality assessment>",
    "paragraph_3_specific_feedback": "<specific feedback>",
    "paragraph_4_recommendation": "<recommendation>"
  }},
  "required_actions": [
    {{"priority": "High"|"Medium"|"Low", "action": "<action>", "deadline": "Before printing"|"Before next sitting"|"For future papers"}}
  ],
  "moderation_checklist": [
    {{"item": "<item>", "status": "Pass"|"Fail"|"Partial", "note": "<note>"}}
  ]
}}"""


def call_claude(prompt: str, api_key: str) -> dict:
    payload = json.dumps({
        "model": "claude-sonnet-4-6",
        "max_tokens": 4096,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": prompt}],
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        data = json.loads(resp.read())

    raw = data["content"][0]["text"].strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


# ── PDF REPORT GENERATION ──────────────────────────────────────────────────────

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm, mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    HRFlowable, PageBreak,
)
from reportlab.pdfgen import canvas as rl_canvas

NAVY    = colors.HexColor("#0f1c3f")
BLUE    = colors.HexColor("#2563eb")
BLUE_LT = colors.HexColor("#eff6ff")
GREEN   = colors.HexColor("#059669")
GREEN_LT= colors.HexColor("#ecfdf5")
AMBER   = colors.HexColor("#d97706")
AMBER_LT= colors.HexColor("#fffbeb")
RED     = colors.HexColor("#dc2626")
RED_LT  = colors.HexColor("#fef2f2")
GREY    = colors.HexColor("#64748b")
LGREY   = colors.HexColor("#f1f5f9")
BORDER  = colors.HexColor("#e2e8f0")
WHITE   = colors.white
BLACK   = colors.HexColor("#0f172a")


class HeaderFooterCanvas(rl_canvas.Canvas):
    def __init__(self, *args, meta=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.meta = meta or {}
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_header_footer(num_pages)
            super().showPage()
        super().save()

    def draw_header_footer(self, page_count):
        w, h = A4
        pg = self._pageNumber
        if pg == 1:
            return
        self.setFillColor(NAVY)
        self.rect(0, h - 28*mm, w, 18*mm, fill=1, stroke=0)
        self.setFillColor(WHITE)
        self.setFont("Helvetica-Bold", 9)
        self.drawString(20*mm, h - 22*mm, "EXAMINATION MODERATION REPORT")
        self.setFont("Helvetica", 8)
        self.drawRightString(w - 20*mm, h - 22*mm, self.meta.get("course", ""))
        self.setFillColor(BLUE)
        self.rect(0, h - 30*mm, w, 2*mm, fill=1, stroke=0)
        self.setFillColor(LGREY)
        self.rect(0, 0, w, 14*mm, fill=1, stroke=0)
        self.setFillColor(GREY)
        self.setFont("Helvetica", 7.5)
        dept = self.meta.get("department", "University")
        date = self.meta.get("date", datetime.now().strftime("%d %B %Y"))
        self.drawString(20*mm, 5*mm, f"{dept}  |  Generated: {date}  |  CONFIDENTIAL")
        self.drawRightString(w - 20*mm, 5*mm, f"Page {pg} of {page_count}")
        self.setStrokeColor(BORDER)
        self.setLineWidth(0.5)
        self.line(20*mm, 14*mm, w - 20*mm, 14*mm)


def _s(name, **kw):
    return ParagraphStyle(name, **kw)


def build_styles():
    return {
        "cover_institution": _s("ci", fontName="Helvetica-Bold", fontSize=11, textColor=WHITE, alignment=TA_CENTER, spaceAfter=4),
        "cover_title": _s("ct", fontName="Helvetica-Bold", fontSize=22, textColor=WHITE, alignment=TA_CENTER, spaceAfter=8, leading=28),
        "cover_sub": _s("cs", fontName="Helvetica", fontSize=11, textColor=colors.HexColor("#94a3b8"), alignment=TA_CENTER, spaceAfter=6),
        "cover_course": _s("cc", fontName="Helvetica-Bold", fontSize=14, textColor=WHITE, alignment=TA_CENTER, spaceAfter=4),
        "section_heading": _s("sh", fontName="Helvetica-Bold", fontSize=11, textColor=NAVY, spaceBefore=14, spaceAfter=6),
        "body": _s("b", fontName="Helvetica", fontSize=9.5, textColor=BLACK, leading=15, spaceAfter=6, alignment=TA_JUSTIFY),
        "body_bold": _s("bb", fontName="Helvetica-Bold", fontSize=9.5, textColor=BLACK, leading=15, spaceAfter=4),
        "small": _s("sm", fontName="Helvetica", fontSize=8.5, textColor=GREY, leading=12, spaceAfter=3),
        "table_header": _s("th", fontName="Helvetica-Bold", fontSize=8.5, textColor=WHITE, alignment=TA_CENTER),
        "table_cell": _s("tc", fontName="Helvetica", fontSize=8.5, textColor=BLACK, leading=12),
        "table_cell_bold": _s("tcb", fontName="Helvetica-Bold", fontSize=8.5, textColor=BLACK, leading=12),
        "remark_para": _s("rp", fontName="Helvetica", fontSize=9.5, textColor=BLACK, leading=16, spaceAfter=8, alignment=TA_JUSTIFY, leftIndent=6, rightIndent=6),
        "bullet_item": _s("bi", fontName="Helvetica", fontSize=9.5, textColor=BLACK, leading=14, spaceAfter=4, leftIndent=12),
    }


def _verdict_color(verdict: str):
    v = verdict.lower()
    if "approved for use" in v: return GREEN, GREEN_LT
    if "minor" in v:            return AMBER, AMBER_LT
    return RED, RED_LT


def _score_color(score: float, mx: float = 100):
    p = score / mx if mx else 0
    if p >= 0.75: return GREEN
    if p >= 0.50: return AMBER
    return RED


def _rating_color(rating: str):
    r = rating.lower()
    if r == "excellent": return GREEN
    if r == "good":      return colors.HexColor("#0891b2")
    if r == "satisfactory": return AMBER
    return RED


def _make_cover(story, result, meta, styles):
    w, _ = A4
    accent = Table([[""]], colWidths=[w], rowHeights=[8*mm])
    accent.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), BLUE)]))
    story.append(accent)
    story.append(Spacer(1, 1.5*cm))
    story.append(Paragraph("UNIVERSITY EXAMINATION QUALITY ASSURANCE", styles["cover_institution"]))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph("EXAMINATION MODERATION REPORT", styles["cover_title"]))
    story.append(HRFlowable(width="60%", thickness=2, color=BLUE, spaceAfter=12))
    story.append(Paragraph(meta.get("course", "Course"), styles["cover_course"]))
    story.append(Paragraph(meta.get("department", ""), styles["cover_sub"]))
    story.append(Spacer(1, 1*cm))

    overall = result.get("overall_score", 0)
    sc = _score_color(overall)
    score_tbl = Table([[
        Paragraph(f"{overall}", ParagraphStyle("sc", fontName="Helvetica-Bold", fontSize=42, textColor=sc, alignment=TA_CENTER)),
        Paragraph("/ 100", ParagraphStyle("sd", fontName="Helvetica", fontSize=16, textColor=GREY, alignment=TA_CENTER, leading=60)),
    ]], colWidths=[3.5*cm, 2*cm])
    score_tbl.setStyle(TableStyle([("ALIGN",(0,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"MIDDLE")]))
    story.append(Table([[score_tbl]], colWidths=[w-4*cm]))

    story.append(Spacer(1, 0.4*cm))
    verdict = result.get("verdict", "Pending")
    vc, _ = _verdict_color(verdict)
    vt = Table([[Paragraph(verdict.upper(), ParagraphStyle("vv", fontName="Helvetica-Bold", fontSize=12, textColor=WHITE, alignment=TA_CENTER))]],
               colWidths=[10*cm], rowHeights=[1*cm])
    vt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),vc),("ALIGN",(0,0),(-1,-1),"CENTER"),("VALIGN",(0,0),(-1,-1),"MIDDLE")]))
    story.append(Table([[vt]], colWidths=[w-4*cm]))

    story.append(Spacer(1, 0.8*cm))
    story.append(Paragraph(
        "This report was generated by the ExamMind AI Moderation System. "
        "It is intended for internal academic quality assurance purposes only. CONFIDENTIAL.",
        ParagraphStyle("fn", fontName="Helvetica-Oblique", fontSize=7.5, textColor=colors.HexColor("#475569"), alignment=TA_CENTER)
    ))
    story.append(PageBreak())


def _make_summary(story, result, styles):
    story.append(Spacer(1, 0.8*cm))
    story.append(Paragraph("1. OVERALL ASSESSMENT SUMMARY", styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=10))
    just = result.get("verdict_justification", "")
    if just:
        story.append(Paragraph(just, styles["body"]))
        story.append(Spacer(1, 0.4*cm))

    criteria = result.get("criteria_scores", [])
    if criteria:
        story.append(Paragraph("Criteria Evaluation", styles["body_bold"]))
        rows = [[Paragraph(h, styles["table_header"]) for h in ["CRITERION","SCORE","RATING","COMMENT"]]]
        for c in criteria:
            sv, mv = c.get("score", 0), c.get("max_score", 10)
            rows.append([
                Paragraph(c.get("criterion",""), styles["table_cell_bold"]),
                Paragraph(f"{sv}/{mv}", ParagraphStyle("sc2", fontName="Helvetica-Bold", fontSize=9, textColor=_score_color(sv,mv), alignment=TA_CENTER)),
                Paragraph(c.get("rating",""), ParagraphStyle("rt2", fontName="Helvetica-Bold", fontSize=8, textColor=_rating_color(c.get("rating","")), alignment=TA_CENTER)),
                Paragraph(c.get("comment",""), styles["table_cell"]),
            ])
        t = Table(rows, colWidths=[5*cm,1.5*cm,2.5*cm,8.2*cm], repeatRows=1)
        t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),NAVY),("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,LGREY]),("GRID",(0,0),(-1,-1),0.4,BORDER),("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),("LEFTPADDING",(0,0),(-1,-1),6)]))
        story.append(t)


def _make_blooms(story, result, styles):
    story.append(Spacer(1, 0.8*cm))
    story.append(Paragraph("2. BLOOM'S TAXONOMY ANALYSIS", styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=10))
    blooms = result.get("blooms_distribution", [])
    if not blooms:
        story.append(Paragraph("Not available.", styles["small"]))
        return
    bloom_colors = {"Remember":colors.HexColor("#bfdbfe"),"Understand":colors.HexColor("#ddd6fe"),"Apply":colors.HexColor("#fde68a"),"Analyse":colors.HexColor("#bbf7d0"),"Evaluate":colors.HexColor("#fbcfe8"),"Create":colors.HexColor("#fecaca")}
    rows = [[Paragraph(h, styles["table_header"]) for h in ["COGNITIVE LEVEL","QUESTIONS","MARKS","% OF PAPER","STATUS"]]]
    for b in blooms:
        lvl = b.get("level","")
        adequate = b.get("adequate", True)
        rows.append([
            Paragraph(lvl, ParagraphStyle("bl2", fontName="Helvetica-Bold", fontSize=9, textColor=NAVY)),
            Paragraph(str(b.get("count",0)), ParagraphStyle("bc2", fontName="Helvetica", fontSize=9, alignment=TA_CENTER)),
            Paragraph(str(b.get("marks",0)), ParagraphStyle("bm2", fontName="Helvetica", fontSize=9, alignment=TA_CENTER)),
            Paragraph(f"{b.get('percentage',0):.1f}%", ParagraphStyle("bp2", fontName="Helvetica-Bold", fontSize=9, alignment=TA_CENTER)),
            Paragraph("Adequate" if adequate else "Review", ParagraphStyle("bs2", fontName="Helvetica-Bold", fontSize=8.5, textColor=GREEN if adequate else AMBER, alignment=TA_CENTER)),
        ])
    t = Table(rows, colWidths=[5*cm,3*cm,3*cm,3.5*cm,2.7*cm], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),NAVY),("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,LGREY]),("GRID",(0,0),(-1,-1),0.4,BORDER),("VALIGN",(0,0),(-1,-1),"MIDDLE"),("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7),("LEFTPADDING",(0,0),(-1,-1),8)]))
    for i, b in enumerate(blooms):
        t.setStyle(TableStyle([("BACKGROUND",(0,i+1),(0,i+1),bloom_colors.get(b.get("level",""),WHITE))]))
    story.append(t)


def _make_questions(story, result, styles):
    story.append(Spacer(1, 0.8*cm))
    story.append(Paragraph("3. QUESTION-BY-QUESTION ANALYSIS", styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=10))
    qs = result.get("question_analysis", [])
    if not qs:
        story.append(Paragraph("No question analysis available.", styles["small"]))
        return
    clarity_colors = {"Clear":GREEN,"Acceptable":AMBER,"Unclear":RED}
    rows = [[Paragraph(h, styles["table_header"]) for h in ["REF","MARKS","BLOOM'S LEVEL","CLARITY","FEEDBACK"]]]
    for q in qs:
        cl = q.get("clarity_rating","Acceptable")
        rows.append([
            Paragraph(q.get("reference",""), ParagraphStyle("qr2", fontName="Helvetica-Bold", fontSize=9)),
            Paragraph(str(q.get("marks","")), ParagraphStyle("qm2", fontName="Helvetica", fontSize=9, alignment=TA_CENTER)),
            Paragraph(q.get("bloom_level",""), ParagraphStyle("qb2", fontName="Helvetica", fontSize=9)),
            Paragraph(cl, ParagraphStyle("qc2", fontName="Helvetica-Bold", fontSize=8.5, textColor=clarity_colors.get(cl,GREY), alignment=TA_CENTER)),
            Paragraph(q.get("comment",""), styles["table_cell"]),
        ])
    t = Table(rows, colWidths=[2*cm,1.6*cm,3*cm,2.2*cm,8.4*cm], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),NAVY),("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,LGREY]),("GRID",(0,0),(-1,-1),0.4,BORDER),("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),("LEFTPADDING",(0,0),(-1,-1),6)]))
    story.append(t)


def _make_findings(story, result, styles):
    story.append(Spacer(1, 0.8*cm))
    story.append(Paragraph("4. FINDINGS & REQUIRED ACTIONS", styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=10))

    def block(title, items, bg, border_c, icon):
        if not items: return
        rows = [[Paragraph(f"{icon}  {title.upper()}", ParagraphStyle("fh2", fontName="Helvetica-Bold", fontSize=9, textColor=NAVY))]]
        for item in items:
            rows.append([Paragraph(f"• {item}", styles["bullet_item"])])
        t = Table(rows, colWidths=[17.2*cm])
        t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),bg),("BACKGROUND",(0,1),(-1,-1),WHITE),("BOX",(0,0),(-1,-1),1,border_c),("LEFTPADDING",(0,0),(-1,-1),10),("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6)]))
        story.append(t)
        story.append(Spacer(1, 0.4*cm))

    block("Strengths", result.get("strengths",[]), GREEN_LT, colors.HexColor("#a7f3d0"), "✓")
    block("Areas for Improvement", result.get("weaknesses",[]), AMBER_LT, colors.HexColor("#fde68a"), "△")
    block("Critical Issues (Must Fix)", result.get("critical_issues",[]), RED_LT, colors.HexColor("#fecaca"), "!")

    actions = result.get("required_actions",[])
    if actions:
        story.append(Paragraph("Required Actions", styles["body_bold"]))
        rows = [[Paragraph(h, styles["table_header"]) for h in ["PRIORITY","ACTION REQUIRED","DEADLINE"]]]
        priority_c = {"High":RED,"Medium":AMBER,"Low":GREEN}
        for a in actions:
            pc = priority_c.get(a.get("priority","Medium"), GREY)
            rows.append([
                Paragraph(a.get("priority",""), ParagraphStyle("ap2", fontName="Helvetica-Bold", fontSize=9, textColor=pc, alignment=TA_CENTER)),
                Paragraph(a.get("action",""), styles["table_cell"]),
                Paragraph(a.get("deadline",""), ParagraphStyle("ad2", fontName="Helvetica", fontSize=8.5, textColor=GREY)),
            ])
        t = Table(rows, colWidths=[2.5*cm,11*cm,3.7*cm], repeatRows=1)
        t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),NAVY),("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,LGREY]),("GRID",(0,0),(-1,-1),0.4,BORDER),("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),("LEFTPADDING",(0,0),(-1,-1),6)]))
        story.append(t)


def _make_remarks(story, result, styles):
    story.append(Spacer(1, 0.8*cm))
    story.append(Paragraph("5. MODERATOR'S REMARKS", styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=10))
    remarks = result.get("moderator_remarks", {})
    paras = [
        remarks.get("paragraph_1_overview",""),
        remarks.get("paragraph_2_academic_quality",""),
        remarks.get("paragraph_3_specific_feedback",""),
        remarks.get("paragraph_4_recommendation",""),
    ]
    rows = [[Paragraph(p, styles["remark_para"])] for p in paras if p]
    if rows:
        rt = Table(rows, colWidths=[16.4*cm])
        rt.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),LGREY),("BOX",(0,0),(-1,-1),1.5,BLUE),("LEFTPADDING",(0,0),(-1,-1),14),("RIGHTPADDING",(0,0),(-1,-1),14),("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),4)]))
        story.append(rt)


def _make_checklist(story, result, styles):
    checklist = result.get("moderation_checklist", [])
    if not checklist: return
    story.append(Spacer(1, 0.8*cm))
    story.append(Paragraph("6. MODERATION CHECKLIST", styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=10))
    sc = {"Pass":GREEN,"Fail":RED,"Partial":AMBER}
    rows = [[Paragraph(h, styles["table_header"]) for h in ["CHECKLIST ITEM","STATUS","NOTE"]]]
    for item in checklist:
        st = item.get("status","")
        rows.append([
            Paragraph(item.get("item",""), styles["table_cell"]),
            Paragraph(st, ParagraphStyle("cs2", fontName="Helvetica-Bold", fontSize=9, textColor=sc.get(st,GREY), alignment=TA_CENTER)),
            Paragraph(item.get("note",""), styles["small"]),
        ])
    t = Table(rows, colWidths=[8*cm,2.5*cm,6.7*cm], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),NAVY),("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,LGREY]),("GRID",(0,0),(-1,-1),0.4,BORDER),("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6),("LEFTPADDING",(0,0),(-1,-1),6)]))
    story.append(t)


def _make_signatures(story, meta, styles):
    story.append(PageBreak())
    story.append(Spacer(1, 0.8*cm))
    story.append(Paragraph("7. SIGNATURES & APPROVAL", styles["section_heading"]))
    story.append(HRFlowable(width="100%", thickness=1, color=BORDER, spaceAfter=20))
    sig_data = [
        ["Role","Name","Signature","Date"],
        ["Examiner", meta.get("examiner",""), "_"*30, "_"*20],
        ["Internal Moderator","","_"*30,"_"*20],
        ["Head of Department","","_"*30,"_"*20],
        ["Dean / Academic Registrar","","_"*30,"_"*20],
    ]
    rows = []
    for i, row in enumerate(sig_data):
        rows.append([Paragraph(str(c), styles["table_header"] if i==0 else styles["table_cell"]) for c in row])
    t = Table(rows, colWidths=[4.5*cm,4.5*cm,4.5*cm,3.7*cm], repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),NAVY),("ROWBACKGROUNDS",(0,1),(-1,-1),[WHITE,LGREY]),("GRID",(0,0),(-1,-1),0.4,BORDER),("TOPPADDING",(0,0),(-1,-1),14),("BOTTOMPADDING",(0,0),(-1,-1),14),("LEFTPADDING",(0,0),(-1,-1),8)]))
    story.append(t)
    story.append(Spacer(1, 1.5*cm))
    story.append(Paragraph(
        f"Generated by ExamMind AI Moderation System. Human sign-off required before printing. "
        f"Reference: MOD-{datetime.now().strftime('%Y%m%d')}",
        ParagraphStyle("disc2", fontName="Helvetica-Oblique", fontSize=8, textColor=GREY, alignment=TA_CENTER, leading=12)
    ))


def generate_pdf_report(result: dict, meta: dict, output_path: str) -> str:
    styles = build_styles()
    story = []
    _make_cover(story, result, meta, styles)
    _make_summary(story, result, styles)
    _make_blooms(story, result, styles)
    _make_questions(story, result, styles)
    _make_findings(story, result, styles)
    _make_remarks(story, result, styles)
    _make_checklist(story, result, styles)
    _make_signatures(story, meta, styles)

    doc = SimpleDocTemplate(
        output_path, pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=3.5*cm, bottomMargin=2*cm,
        title=f"Moderation Report – {meta.get('course','')}",
        author="ExamMind AI Moderation System",
    )
    doc.build(story, canvasmaker=lambda *a, **kw: HeaderFooterCanvas(*a, meta=meta, **kw))
    return output_path


# ── MAIN ENTRY POINT ──────────────────────────────────────────────────────────

def moderate_exam(
    exam_path: str,
    form_text: str | None,
    meta: dict,
    api_key: str,
    provider: str,
    submission_id: str,
) -> str:
    """
    Run the full moderation pipeline.
    Returns the report filename (not full path).
    Also writes <submission_id>_result.json alongside the report.
    """
    os.makedirs(settings.REPORTS_DIR, exist_ok=True)

    exam_text = extract_text(exam_path)
    criteria_text = form_text or DEFAULT_FORM_TEXT

    prompt = build_prompt(exam_text, criteria_text, meta)

    # For now only Claude is supported; extend here for Gemini/OpenAI later
    result = call_claude(prompt, api_key)

    # Save raw result JSON for the submissions router to read
    result_json_path = os.path.join(settings.REPORTS_DIR, f"{submission_id}_result.json")
    with open(result_json_path, "w") as f:
        json.dump(result, f)

    # Generate PDF report
    report_filename = f"report_{submission_id}.pdf"
    report_path = os.path.join(settings.REPORTS_DIR, report_filename)
    generate_pdf_report(result, meta, report_path)

    return report_filename
