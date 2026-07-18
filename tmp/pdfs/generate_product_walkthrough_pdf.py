from __future__ import annotations

from datetime import datetime
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import BaseDocTemplate, Frame, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "product-walkthrough-origin-studios.pdf"


features = [
    ("Public landing page and studio catalog", "This introduces Origin Studios and lets a visitor choose a product room.", "Anyone.", "The visitor enters the studio catalog, sees Origin Frame as active, and sees Origin Sites and Origin Garage as coming soon.", "Sites and Garage are disabled placeholders."),
    ("Authentication and account access", "This lets people create accounts, sign in, sign out, and recover passwords without Supabase Auth.", "Public visitors and signed-in users.", "A user signs up with name, email, and password. The system creates the account, stores a protected password hash, and creates a personal workspace. Login creates a secure session. Password reset sends or logs a reset link and revokes old sessions after reset.", "Signup currently marks accounts verified immediately, while the UI still mentions inbox verification."),
    ("Origin Frame app shell", "This is the main logged-in workspace shell.", "Any signed-in user.", "The user enters Origin Frame and sees navigation for Projects, Video editor, Costs, Settings, Sign out, and identity.", "Settings is visible but not a full screen yet. Costs data is owner-only."),
    ("Workspaces and roles", "Workspaces group people, projects, media, costs, and permissions.", "Signed-in users; owners and admins have management access.", "Signup creates a personal workspace and owner membership. Users can also create team workspaces. Backend routes support members, roles, removals, invitations, and invite acceptance.", "Member and invite management are backend-ready but lack full frontend UI."),
    ("Project dashboard", "This is the project shelf for scene-based creative projects.", "Viewers can see projects. Editors can create projects.", "The dashboard loads accessible workspaces and projects. The user searches projects, creates a new project, chooses a workspace, adds a name and note, then opens the project.", "Project cards may show zero scenes because list data does not include full scene details."),
    ("Project workspace", "This is where a project is built as ordered scenes.", "Viewers can inspect. Editors can create and edit.", "Opening a project loads scenes into a workspace with top bar, left rail, center stage, right history, and bottom filmstrip.", "Library, Sequence, Settings, Collaborators, Comments, and Preview are present but not fully complete flows."),
    ("Scene creation and cards", "Scenes are ordered building blocks.", "Editors create; viewers inspect.", "The user adds a scene, chooses a starting format, and adds a note. The system creates the scene and its initial version.", "Video scenes show play; image scenes do not."),
    ("Scene media upload", "This attaches real media to a scene.", "Project editors.", "The browser requests a signed upload URL, uploads to Supabase Storage, confirms the upload, and creates a scene version pointing to the new asset.", "Only approved file types are accepted. Missing storage config causes upload failure."),
    ("Scene history and versions", "This preserves how a scene changes over time.", "Viewers can see history. Editors create versions.", "Uploads and generated outputs create new immutable scene versions, shown in the right history panel.", "Make-current exists in the backend but not in the UI."),
    ("Scene ordering and filmstrip", "This lets users arrange scene order.", "Editors reorder; viewers inspect.", "The user drags a filmstrip handle. The frontend updates immediately and the backend saves the new order if the project revision still matches.", "Revision conflicts reload canonical state but do not show a detailed conflict resolver."),
    ("Shot Design workflows", "This is the AI generation area.", "Project editors.", "The user picks one of seven workflows, enters prompt/settings/provider/model, and starts a job. A worker contacts the provider and returns outputs that can be attached to a scene.", "All modes share a generic form. Provider models are seeded disabled and require setup."),
    ("Provider jobs and worker", "This runs long AI and render jobs outside page requests.", "Triggered indirectly by editors; operated by the backend worker.", "Jobs move from queued to running to succeeded or failed. Successful generation can record cost events.", "Missing credentials fail jobs clearly. Polling has a bounded window."),
    ("Assets and storage", "Assets store media used by scenes, generated outputs, and edits.", "Workspace viewers can list. Editors can create versions/delete.", "Uploads and generation promotion create assets and asset versions stored in Supabase Storage.", "No full frontend asset library. Collections exist in the database but not the UI."),
    ("Live collaboration", "This keeps project screens roughly synchronized.", "Authenticated project viewers.", "The frontend joins a project room. Scene creation, reorder, and version events cause other clients to reload.", "Presence exists but is not displayed. Comments are backend-only for now."),
    ("Comments and mentions", "This supports feedback attached to project objects.", "Project viewers according to current backend rules.", "Comments can be created through the API and broadcast over realtime.", "No frontend comment UI. Viewer resolve permission may need product review."),
    ("Collaborators and share links", "These extend access beyond workspace membership.", "Project admins.", "Admins can add existing users as project collaborators or create public share tokens.", "No frontend UI and public shares only return limited metadata."),
    ("Video project library", "This is the entry point for timeline editing.", "Workspace viewers can list. Editors create.", "The user opens Video editor, creates an untitled edit in the first workspace, and opens it.", "No workspace picker. Scenes are not yet sent directly into a timeline."),
    ("Browser video editor", "This assembles media into a timeline and previews it in the browser.", "Viewers can open. Editors can import, edit, and save.", "Users import media, preview with Remotion, drag the playhead, trim, split, move clips, add captions, adjust volume/mute, undo/redo, autosave, and save.", "Export is disabled. Empty timelines start at 30 seconds; real timelines follow the last clip end."),
    ("Frame-level video instructions", "This lets users select exact frames and save edit instructions.", "Video project editors.", "The browser estimates FPS, calculates frame count, creates thumbnails, and lets the user select a frame and save an instruction.", "Instructions are metadata only and do not yet alter video pixels."),
    ("Remotion preview and future render path", "This previews timelines now and prepares future export.", "Video editor users for preview; editors for backend render jobs.", "Remotion renders video, images, audio, captions, and black gaps from the timeline document.", "Frontend export is disabled. Backend render needs AWS/Remotion configuration."),
    ("Cost observatory", "This shows observed provider costs.", "Workspace owners.", "Owners open Costs and see provider summaries and recent events.", "This is not billing. There are no credits, subscriptions, budgets, or payment flows."),
    ("Operational endpoints and clean-room safeguards", "These support deployment, docs, and source hygiene.", "Operators and developers.", "Health/readiness endpoints report service state. Clean-room scans fail on forbidden legacy identifiers or dependencies.", "OpenAPI is hand-authored and not a full source of truth."),
]

flows = [
    "Signup to first project: signup creates a user and personal workspace, then the user creates and opens a project.",
    "Scene upload to version history: upload goes to Supabase Storage, becomes an asset, then becomes a new scene version.",
    "Shot Design to scene media: prompt creates a job, provider output is imported, and a result is promoted to a selected scene.",
    "Scene ordering to realtime updates: reorder saves a sequence and broadcasts reload events to connected clients.",
    "Video import to saved timeline: imported media becomes a timeline item, can be edited, and is saved as a timeline version.",
    "Generation to costs: successful generation records a cost event visible to workspace owners.",
    "Workspace invitation: an invited email accepts a token and joins the workspace with the assigned role.",
]

working = [
    "Landing page and catalog.",
    "Custom signup, login, logout, and password reset.",
    "Secure sessions and CSRF handling.",
    "Personal workspace creation.",
    "Project listing and creation.",
    "Scene creation, uploads, versions, history, and reorder.",
    "Basic realtime project invalidation.",
    "Shot Design job creation and polling.",
    "Provider worker architecture.",
    "Generation output promotion to scenes.",
    "Supabase Storage upload and confirmation.",
    "Video project listing and creation.",
    "Browser video editor import, preview, trim, split, captions, frame selection, undo/redo, autosave, and save.",
    "Owner-only cost observatory.",
    "Clean-room source scan.",
]

incomplete = [
    "Origin Sites and Origin Garage are placeholders.",
    "Email verification UI conflicts with currently bypassed backend verification.",
    "Workspace members, invitations, collaborators, comments, share links, and presence need frontend UI.",
    "Project Library, Sequence, Settings, Collaborators, Comments, and Preview are not complete flows.",
    "Shot Design modes need dedicated forms and reference selection.",
    "Provider models are disabled by default and need admin/configuration UX.",
    "Video export is disabled in the frontend.",
    "Backend render jobs need AWS/Remotion Lambda setup.",
    "Frame instructions are saved but not applied to video pixels.",
    "Timeline transitions and transform editing are not fully exposed.",
    "Collections, activity events, and global admin exist but are not active product flows.",
]

questions = [
    "Should email verification remain disabled, or should the signup UI change?",
    "Should viewers be able to resolve comments?",
    "What should public share-link roles allow?",
    "Should project collaborators require existing accounts?",
    "What belongs in Project Settings first?",
    "Should each Shot Design mode get a dedicated flow?",
    "Who enables provider models and credentials in production?",
    "Should timeline FPS follow source FPS, output FPS, or both?",
    "Should frame thumbnails be persisted as sprites?",
    "Should frame instructions apply only to one frame or become keyframes over a range?",
    "Should export use Remotion Lambda only, local worker fallback, or both?",
    "Should project scenes be inserted directly into a video timeline?",
    "What is the intended use of global admin?",
]


def make_styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=24, leading=30, textColor=colors.HexColor("#0B111A"), spaceAfter=8),
        "subtitle": ParagraphStyle("subtitle", parent=base["BodyText"], fontSize=10.5, leading=15, textColor=colors.HexColor("#526174"), spaceAfter=14),
        "h1": ParagraphStyle("h1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=15, leading=20, textColor=colors.HexColor("#0B111A"), spaceBefore=12, spaceAfter=7),
        "h2": ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=11.3, leading=15, textColor=colors.HexColor("#0B111A"), spaceBefore=9, spaceAfter=4),
        "label": ParagraphStyle("label", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=8.6, leading=11.5, textColor=colors.HexColor("#0F766E")),
        "body": ParagraphStyle("body", parent=base["BodyText"], fontSize=9.1, leading=12.8, textColor=colors.HexColor("#1C2735"), spaceAfter=5),
        "bullet": ParagraphStyle("bullet", parent=base["BodyText"], fontSize=9, leading=12.5, leftIndent=10, firstLineIndent=-6, textColor=colors.HexColor("#1C2735"), spaceAfter=4),
        "small": ParagraphStyle("small", parent=base["BodyText"], fontSize=8.1, leading=11, textColor=colors.HexColor("#64748B"), spaceAfter=5),
    }


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def p(text, style):
    return Paragraph(esc(text), style)


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setStrokeColor(colors.HexColor("#D7DEE8"))
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, height - 15 * mm, width - 18 * mm, height - 15 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#64748B"))
    canvas.drawString(18 * mm, height - 11 * mm, "Product Walkthrough: Origin Studios")
    canvas.drawRightString(width - 18 * mm, 10 * mm, f"Page {doc.page}")
    canvas.restoreState()


def add_feature(story, st, feature):
    title, what, access, journey, edge = feature
    story.append(p(title, st["h2"]))
    rows = [
        ["What it is for", what],
        ["Who can access it", access],
        ["User journey", journey],
        ["Conditional logic and edge cases", edge],
    ]
    data = [[p(a, st["label"]), p(b, st["body"])] for a, b in rows]
    table = Table(data, colWidths=[38 * mm, 121 * mm], hAlign="LEFT")
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E2E8F0")),
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F1F5F9")),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(table)
    story.append(Spacer(1, 4))


def build():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    st = make_styles()
    doc = BaseDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=21 * mm, bottomMargin=17 * mm, title="Product Walkthrough: Origin Studios")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=header_footer)])

    story = [
        Spacer(1, 7 * mm),
        p("Product Walkthrough: Origin Studios", st["title"]),
        p("A plain-English walkthrough of the current codebase for a non-technical stakeholder.", st["subtitle"]),
        p(f"Generated: {datetime.now().strftime('%B %d, %Y')}", st["small"]),
        Spacer(1, 5 * mm),
        p("Security note", st["h1"]),
        p("This document intentionally excludes pasted secrets, database passwords, service-role keys, and private environment values.", st["body"]),
        p("Overview", st["h1"]),
        p("Origin Studios is a creative platform for planning, generating, organizing, and editing visual scenes. The active product today is Origin Frame, which combines scene-based project creation, AI-assisted Shot Design, media storage, and a browser video editor.", st["body"]),
        p("The roles and personas found in the code are: public visitor, registered user, workspace owner, workspace admin, workspace editor, workspace viewer, project collaborator editor, project collaborator viewer, and global admin. The global admin flag exists but does not currently drive a visible product flow.", st["body"]),
        p("Feature-by-feature breakdown", st["h1"]),
    ]

    for feature in features:
        add_feature(story, st, feature)

    story.append(PageBreak())
    story.append(p("Cross-feature flows", st["h1"]))
    for item in flows:
        story.append(p(f"- {item}", st["bullet"]))

    story.append(p("What is fully working or substantially wired", st["h1"]))
    for item in working:
        story.append(p(f"- {item}", st["bullet"]))

    story.append(p("What is stubbed, incomplete, or partially wired", st["h1"]))
    for item in incomplete:
        story.append(p(f"- {item}", st["bullet"]))

    story.append(p("Open questions", st["h1"]))
    for item in questions:
        story.append(p(f"- {item}", st["bullet"]))

    doc.build(story)
    return OUTPUT


if __name__ == "__main__":
    print(build())
