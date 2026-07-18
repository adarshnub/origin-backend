from __future__ import annotations

from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    BaseDocTemplate,
    Flowable,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "origin-frame-story-to-anime-plan.pdf"

CARBON = colors.HexColor("#08131F")
CARBON_2 = colors.HexColor("#0E1D2B")
TEAL = colors.HexColor("#20D4C3")
TEAL_DARK = colors.HexColor("#0A887F")
CORAL = colors.HexColor("#FF6B5E")
PAPER = colors.HexColor("#F5F8FA")
INK = colors.HexColor("#122233")
MUTED = colors.HexColor("#607181")
LINE = colors.HexColor("#D8E2E8")
PALE_TEAL = colors.HexColor("#E7F9F6")
PALE_CORAL = colors.HexColor("#FFF0EE")


PLAN = r"""
## Summary

Origin Frame will pivot from a collection of separate shot-design tools into one focused creative workflow:

[[WORKFLOW]]

The core promise is: "Describe your story, turn it into a polished comic, then convert it into an editable animated episode."

The existing authentication, workspaces, projects, Supabase Storage, immutable versions, generation jobs, collaboration infrastructure, cost tracking, and video editor will be retained. The current seven Shot Design modes and generic scene-first interface will be retired from the primary UI.

### Product boundaries

- Optimize the first release for 8-24-page short stories.
- Support left-to-right comics and right-to-left manga.
- Use guided stages with approval before expensive generation.
- Allow "Generate all" inside an approved stage.
- Generate artwork without baked-in dialogue.
- Render dialogue, captions, narration, and sound effects as editable lettering.
- Export comics as PDF, CBZ, and page-image ZIP.
- Generate a 1-3-minute anime draft with motion, voices, captions, and an editable timeline.
- Defer final cloud MP4 export until the editor and generation handoff are stable.
- Remove or hide UI controls that are not genuinely functional.

## Product Experience

### 1. Origin Frame dashboard

Keep `/studio/frame` as the main dashboard, but divide it into:

- Story Projects
- Video Edits
- Recent Exports

Each story card shows:

- Cover or latest page
- Title
- Comic or manga format
- Current stage
- Page count
- Generation progress
- Last edited date
- Continue button

Creating a project opens a short setup flow:

1. Enter the initial story prompt.
2. Select Comic or Manga.
3. Select genre, tone, intended audience, language, and approximate page count.
4. Optionally upload writing, character references, PDFs, or visual references.
5. Create the project and begin outline generation.

The existing owner, admin, editor, and viewer permissions remain unchanged. Viewers may read and comment; editors may revise and generate; admins and owners manage access.

### 2. Project navigation

Replace Library, Scenes, Shot Design, and Sequence with a guided project stepper:

1. Idea
2. Script
3. Characters & Style
4. Comic
5. Export
6. Anime

The project route resumes at the most recently active stage. Direct stage routes should be available:

- `/studio/frame/projects/:projectId/idea`
- `/studio/frame/projects/:projectId/script`
- `/studio/frame/projects/:projectId/characters`
- `/studio/frame/projects/:projectId/comic`
- `/studio/frame/projects/:projectId/export`
- `/studio/frame/projects/:projectId/anime`

Existing project-level collaborators, comments, save status, history, and realtime updates remain available throughout these screens.

### 3. Idea and outline generation

The Idea screen contains one prominent prompt field and optional creative controls.

Users can specify:

- Premise
- Genre and subgenre
- Tone
- Audience
- Comic or manga
- Page target
- Language
- Character or world notes
- Required themes
- Content to avoid
- Uploaded references

The first generation produces a structured outline containing:

- Working title
- Logline
- Short synopsis
- Main characters
- Beginning, middle, and ending
- Major story beats
- Proposed page distribution
- Recommended visual direction

The outline remains editable. Regenerating it creates an immutable child version. Users can compare versions, restore an older version, or approve one version for script generation.

No comic images are generated until the user approves the outline.

### 4. Script generation and editing

The approved outline is converted into a structured comic script.

The script editor presents:

- Story acts or chapters
- Ordered scenes
- Page breakdown
- Panels within each page
- Panel action
- Camera framing
- Dialogue
- Narration
- Sound effects
- Estimated timing for animation

Users can:

- Edit any text directly
- Add, delete, duplicate, split, merge, and reorder scenes or panels
- Regenerate only one scene or panel
- Ask the system to shorten or expand the story
- Lock sections that must not change
- Compare script versions
- Approve a script version

The system must preserve stable character, scene, page, and panel IDs when revising unaffected sections. This allows existing artwork and anime shots to remain attached after small script edits.

Changing approved dialogue marks affected comic pages and audio tracks as outdated without deleting them.

### 5. Characters and visual style

Before comic generation, users review a generated story bible.

Each character includes:

- Name and role
- Personality
- Appearance
- Clothing and accessories
- Color palette
- Expressions
- Important continuity rules
- Relationships
- Voice assignment
- Uploaded and generated references

Users can generate character sheets containing front, side, expression, and pose references. Character sheets become versioned project assets.

The Style section controls:

- Color or black-and-white
- Line treatment
- Shading
- Detail level
- Background complexity
- Era and atmosphere
- Global palette
- Page borders and gutters
- Speech-balloon style
- Caption and sound-effect typography

An approved character version and approved style version are included in every panel-generation request. Individual panels may override camera, lighting, mood, and composition without changing the global identity.

Provider names and logos are not displayed in the creator interface. The UI displays capability-oriented model names such as "Fast Draft," "Consistent Character," and "High Detail."

### 6. Comic and manga creation

The Comic screen provides two connected views:

- Page overview
- Focused page editor

Each page contains ordered panels generated from the approved script. The initial layout is selected automatically based on pacing and panel descriptions, but users can switch between tested templates.

Supported page operations include:

- Reorder pages
- Reorder panels
- Change panel layout
- Resize or crop panel art
- Regenerate one panel
- Upload replacement art
- Select a previous art version
- Move or resize speech balloons
- Edit dialogue, captions, narration, and sound effects
- Change lettering style
- Add or remove page numbers
- Mark a page approved

Manga projects use right-to-left page and panel reading order. Comic projects use left-to-right reading order.

### 7. Professional lettering

Image-generation prompts explicitly request clean artwork without words, logos, signatures, or watermarks.

Writing is rendered separately using editable page elements:

- Speech balloons
- Thought balloons
- Narration boxes
- Sound effects
- Labels
- Page numbers

Every text element stores its content, panel association, position, dimensions, tail position, typography, alignment, and reading order.

The page editor warns about:

- Overflowing text
- Balloons outside safe areas
- Balloons covering important faces
- Unresolved speaker assignments
- Missing fonts
- Empty panels
- Low-resolution artwork

This separation allows users to correct spelling or translate the story without regenerating artwork.

### 8. Story exports

The Export screen performs a preflight check before allowing publication.

Initial export formats:

- PDF
- CBZ
- ZIP containing numbered page images

PDF options include:

- Cover inclusion
- Page size
- Margins and bleed
- Image quality
- Page numbering
- Metadata
- Reading direction

Exports run as durable background jobs. The backend renders every page from the approved `PageDocument`, stores the finished artifact in Supabase Storage, and provides a time-limited download URL.

Export history records:

- Source script version
- Character/style versions
- Page versions
- Export settings
- Status
- File size
- Checksum
- Creation time
- Creator

An old export remains downloadable even after the project changes.

## One-Click Anime Generation

### Anime preflight

The Anime screen uses the approved script, character bible, page layouts, panel artwork, and dialogue.

Before generation, the system checks:

- Every required panel has usable artwork
- The script and comic versions are approved
- Character references are available
- Dialogue speakers are assigned
- Required text, image, video, and voice capabilities are configured
- Estimated generation count and cost
- Expected episode length

The user may select:

- Aspect ratio
- Target duration
- Frame rate
- Voice for each character
- Narration voice
- Motion intensity
- Subtitle style
- Whether to use lip-sync
- Whether to include user-provided music or sound effects

The confirmation screen shows an estimate but does not block generation based on quotas or credits.

### Anime production graph

Clicking "Generate anime" creates one parent production run with dependent steps:

1. Convert comic panels into an ordered anime shot plan.
2. Create motion prompts using panel action, camera direction, character references, and continuity context.
3. Generate image-to-video clips for appropriate shots.
4. Use controlled camera movement on still panels when video generation is unnecessary or fails.
5. Generate dialogue and narration audio.
6. Apply lip-sync where configured and appropriate.
7. Place captions using the approved script.
8. Add user-provided music and sound effects where available.
9. Assemble every successful result into a video project.
10. Open the completed draft in the existing video editor.

A failed individual shot does not discard the entire run. The system retries it within configured limits and then uses the approved still panel with a camera move as a visible fallback. The completed run lists all warnings and substitutions.

No dummy media, silent placeholder clips, or fake completion states are permitted.

### Anime review

The Anime screen displays shots in story order with:

- Source page and panel
- Generated preview
- Dialogue
- Duration
- Generation status
- Voice status
- Retry and regenerate actions
- Open in video editor action

Regenerating a shot creates a new version. The user chooses which version becomes current.

## Video Editor Direction

### Story integration

Add "Create anime draft" and "Open in editor" actions that create a `video_project` linked to the source story and anime run.

The generated timeline contains separate tracks for:

- Video and animated panels
- Still-image fallbacks
- Dialogue
- Narration
- Music
- Sound effects
- Captions
- Visual overlays

Timeline items retain their originating page, panel, character, generation job, and asset-version IDs. The editor can therefore offer "Regenerate this shot" or "Open source panel" without losing timing.

Replacing a generated shot preserves the current timeline position, trim, transitions, volume, and captions unless the user explicitly resets them.

### TimelineDocument version 2

Replace millisecond-first timing with frame-accurate timing:

- `schemaVersion: 2`
- Rational output frame rate using numerator and denominator
- `startFrame`
- `durationFrames`
- `sourceInFrame`
- Source-media frame rate and timebase
- Stable track and item IDs
- Story and generation lineage
- Transitions, transforms, captions, and audio envelopes
- Real frame-edit results

Provide a deterministic migration adapter from existing `TimelineDocument` version 1. Existing video projects must continue opening without destructive migration.

### Professional media preparation

After upload or generation, a worker should:

- Probe duration, codec, dimensions, audio channels, and exact frame rate
- Detect variable-frame-rate media
- Generate browser-friendly proxy media when necessary
- Generate thumbnail sprites
- Generate audio waveforms
- Store source and proxy metadata
- Preserve the original asset

The editor uses proxy media for smooth interaction and original assets for future export.

### Editor capabilities to complete

Retain and harden:

- Playback and synchronized playhead
- Smooth pointer scrubbing
- Zoom
- Dragging clips
- Snapping
- Trim handles
- Split at playhead
- Reordering
- Multiple video and audio tracks
- Volume and mute
- Captions
- Transitions
- Undo and redo
- Autosave
- Immutable saved versions
- Unsaved, saving, saved, and conflict states

The current prompt-only frame-edit control must not remain as a metadata-only feature. Selecting a frame should offer real actions:

- Replace exactly one output frame with a generated or uploaded image overlay
- Use the edited frame as a keyframe and regenerate the surrounding shot
- Revert to the original frame or shot version

The resulting generated asset and timeline operation must be visible in playback and retained in saved versions.

Until cloud MP4 export is ready, remove the disabled "Export later" control from the production UI. Keep the existing render backend behind a feature flag for a later milestone.

## Data Model Changes

### Story tables

Add:

- `story_profiles` - one-to-one project configuration, format, reading direction, language, target length, current stage, and approved-version pointers.
- `story_versions` - immutable outline and script documents with parent lineage, source prompt, model/settings snapshots, approval status, and author.
- `story_characters` - stable character identities.
- `story_character_versions` - immutable descriptions, continuity data, voice settings, and reference asset IDs.
- `story_pages` - stable ordered page identities.
- `story_page_versions` - immutable page-layout and lettering documents.
- `story_panels` - stable ordered panel identities linked to script elements and pages.
- `story_panel_versions` - immutable action, dialogue, prompts, approved artwork, and generation lineage.
- `production_runs` - parent script, comic, export, or anime workflows.
- `production_steps` - dependency-aware units inside a run.
- `story_exports` - source versions, format, settings, status, storage path, checksum, and size.
- `anime_runs` - anime-level settings and source-version pointers.
- `anime_shots` - ordered source panels, timing, prompts, voice assets, video assets, status, and current version.

Extend `generation_jobs` with nullable `production_run_id` and `production_step_id`. Keep the existing Shot Design relationship nullable for compatibility.

Extend comments to support story version, character, page, panel, anime shot, and timeline-item targets.

Extend `video_projects` with optional source story, anime run, and production run IDs.

### Important contracts

Define and validate shared Zod/OpenAPI contracts for:

- `StoryDocument`
- `CharacterDocument`
- `PageDocument`
- `LetteringElement`
- `ProductionRun`
- `ProductionStep`
- `AnimePlan`
- `AnimeShot`
- `TimelineDocumentV2`

`StoryDocument` uses stable IDs and contains metadata, characters, scenes, pages, panels, dialogue, narration, sound effects, visual direction, and timing hints.

`PageDocument` uses normalized coordinates for panels and text elements. Text wrapping and final line positions are calculated deterministically so browser previews and exported pages match.

## API Changes

All routes continue using `/api/v1`, Zod validation, custom sessions, CSRF protection, permission policies, idempotency keys, and `{ data, error, meta }` envelopes.

Add:

- `GET/PATCH /projects/:id/story-profile`
- `GET /projects/:id/story`
- `POST /projects/:id/story-versions`
- `GET /projects/:id/story-versions`
- `POST /story-versions/:id/approve`
- `POST /story-versions/:id/regenerate-section`
- `GET/POST /projects/:id/characters`
- `POST /characters/:id/versions`
- `POST /character-versions/:id/approve`
- `GET /projects/:id/pages`
- `GET /pages/:id`
- `POST /pages/:id/versions`
- `POST /panels/:id/generations`
- `POST /panel-versions/:id/make-current`
- `POST /production-runs`
- `GET /production-runs/:id`
- `POST /production-runs/:id/cancel`
- `POST /production-steps/:id/retry`
- `POST /projects/:id/story-exports`
- `GET /story-exports/:id`
- `POST /projects/:id/anime-runs`
- `GET /anime-runs/:id`
- `POST /anime-shots/:id/regenerate`
- `POST /anime-runs/:id/create-video-project`

All editable resources carry a revision. Mutations require `expectedRevision`; conflicts return the canonical document for reconciliation.

WebSocket project rooms broadcast production progress, version changes, page approvals, comment events, anime-shot completion, and editor handoff.

## Provider and Job Architecture

Change the provider registry from workflow-specific behavior to capability matching:

- `text.structured`
- `text.rewrite`
- `image.generate`
- `image.reference`
- `image.edit`
- `video.image_to_video`
- `voice.tts`
- `video.lip_sync`
- `audio.music`
- `audio.sound_effect`

The UI selects an Origin capability preset. The backend resolves it to an enabled model from the database catalog.

Structured text generation must:

- Request schema-constrained output where supported
- Validate every response
- Attempt bounded repair for invalid responses
- Reject unresolved malformed output
- Store prompt, response, settings, model, and validation failures

Generated provider media must be imported into Supabase Storage immediately after completion. Projects must not depend permanently on expiring provider URLs.

Production runs are dependency graphs processed through pg-boss. Each production step supports queued, running, retrying, succeeded, failed, canceled, and skipped states.

Use bounded concurrency per provider and project so a 24-page comic does not overwhelm provider limits. Idempotency keys prevent duplicated media or cost events during retries.

Missing provider credentials disable the affected capability during preflight instead of failing halfway through the workflow.

## Comic Rendering

Create a server-side page renderer driven entirely by `PageDocument`.

Use:

- Deterministic panel rectangles
- SVG-based balloon and text geometry
- Embedded licensed fonts with Unicode support
- High-resolution artwork from Supabase Storage
- PDF generation with page metadata
- Raster page generation for CBZ and ZIP
- Checksums for completed artifacts

The frontend page editor manipulates normalized coordinates and already-calculated text lines. The backend uses the same positions for export, preventing layout differences between preview and PDF.

Export workers write temporary files outside tracked source directories, upload the completed artifact to Supabase Storage, and remove temporary files after successful import.

## Migration and Compatibility

- Add all new tables through forward-only Drizzle migrations.
- Do not delete existing projects, assets, scenes, video projects, or histories.
- Existing projects appear as "Legacy project" and offer an explicit conversion action.
- Conversion creates a story profile and maps ordered scenes into initial story beats or panels.
- Existing Shot Design routes remain temporarily available for old records but disappear from new-project navigation.
- Existing `TimelineDocument` version 1 records are upgraded in memory and saved as version 2 only after the first edit.
- Do not rewrite historical timeline versions.
- Keep Origin Sites and Origin Garage unchanged as Coming Soon products.

## Implementation Sequence

### Phase 1 - Product pivot and contracts

- Add story schemas, database migrations, OpenAPI contracts, feature flags, and timeline-v1 migration.
- Replace new-project creation and project navigation with the guided story workflow.
- Hide the seven Shot Design modes for new projects.
- Preserve existing project access and conversion.

### Phase 2 - Prompt, outline, and script

- Add structured text provider capabilities.
- Implement outline generation, editing, version history, comparison, and approval.
- Implement structured script generation and scene/page/panel editing.
- Add section-level regeneration with locked-content preservation.
- Add production-run progress and realtime updates.

### Phase 3 - Character consistency and comic generation

- Build character and style-bible editors.
- Generate and approve character-reference sheets.
- Implement panel generation using approved references.
- Build page templates, page editor, version history, lettering, and individual-panel regeneration.
- Add outdated-state tracking after script or style changes.

### Phase 4 - Publication export

- Implement deterministic page rendering.
- Add PDF, CBZ, and page-image ZIP jobs.
- Add export preflight, history, Supabase Storage delivery, and signed downloads.
- Verify comic and manga reading directions.

### Phase 5 - Anime generation

- Implement anime preflight and cost estimates.
- Generate the shot plan, motion clips, voices, captions, and optional lip-sync.
- Add still-panel motion fallback for failed or intentionally static shots.
- Create a fully populated video project and timeline.
- Add shot review and regeneration.

### Phase 6 - Video editor hardening

- Introduce frame-based `TimelineDocument` version 2.
- Add server-side media probing, proxies, thumbnails, and waveforms.
- Complete reliable playhead, drag, trim, split, snapping, multi-track audio, captions, transitions, and autosave.
- Replace metadata-only frame instructions with real frame or shot-generation operations.
- Add story-panel and anime-shot lineage to inspector actions.
- Hide cloud export until its later release milestone.

### Phase 7 - Collaboration and production readiness

- Add comments on scripts, characters, pages, panels, shots, and timeline items.
- Add revision-conflict recovery and multi-browser testing.
- Complete responsive, keyboard, screen-reader, reduced-motion, performance, security, and load testing.
- Add monitoring and staged Railway rollout.

## Test and Acceptance Plan

### Unit tests

Test:

- Story, character, page, anime, and timeline schemas
- Stable-ID preservation
- Story version branching
- Approval and outdated-state rules
- Comic and manga reading order
- Balloon text layout and overflow detection
- Production-step dependency resolution
- Idempotent job and cost recording
- Timeline version-1 migration
- Frame-accurate split, trim, and source-in calculations
- Export checksums

### API integration tests

Cover every new endpoint with:

- Successful requests
- Validation failures
- Unauthenticated access
- Viewer/editor/admin permission differences
- Missing resources
- Revision conflicts
- Idempotent replay
- Cancellation
- Partial production failure
- Provider unavailability
- Retry without duplicated outputs or costs

### Provider tests

- Use recorded fixtures for every capability adapter.
- Validate structured text repair behavior.
- Verify character-reference payloads.
- Verify provider media is copied into Supabase Storage.
- Run credential-gated sandbox tests for every enabled capability.

### End-to-end acceptance scenario

A user must be able to:

1. Create an account and story project.
2. Enter one prompt.
3. Generate, revise, and approve an outline.
4. Generate and edit an 8-page script.
5. Approve characters and a visual style.
6. Generate all comic panels.
7. Regenerate one panel without affecting unrelated pages.
8. Correct dialogue without regenerating artwork.
9. Export a readable PDF and CBZ.
10. Start anime generation.
11. Recover from one deliberately failed shot using the visible still-motion fallback.
12. Open the assembled anime draft in the video editor.
13. Play, scrub, trim, split, reorder, caption, and autosave it.
14. Regenerate one shot and preserve its timeline placement.
15. Reopen the saved project without losing versions or lineage.

### Quality gates

- No placeholder or dummy media in production flows.
- No control presented as working unless it performs a real persisted action.
- No dialogue baked into generated artwork.
- No provider URLs used as permanent project storage.
- No destructive migration of existing projects.
- Clean type-check, lint, tests, production builds, security scan, and forbidden-brand scan.
- Keyboard-accessible guided workflow and page editor.
- PDF preview and final export match within defined rendering tolerances.

## Rollout and Success Measures

Release behind `STORY_WORKFLOW_ENABLED` and `ANIME_GENERATION_ENABLED` flags.

Track:

- Time from project creation to approved outline
- Percentage reaching approved script
- Percentage generating a complete comic
- Comic export completion rate
- Panel-regeneration rate
- Anime-run completion rate
- Percentage of generated anime drafts opened in the editor
- Production failure and fallback rates
- Repeat project creation
- Generation cost per completed page and per completed minute

Do not enable all users until one complete 8-24-page project can reliably reach PDF export and an editable anime draft without manual database intervention.

## Assumptions and Defaults

- Guided approvals are the default; expensive stages never start silently.
- Comic and manga are first-class; vertical webtoon layouts are deferred.
- The initial production target is 8-24 pages and a 1-3-minute anime draft.
- Provider selection remains capability-based and provider-neutral in the UI.
- English is the initial fully QA-tested writing language; storage and fonts are Unicode-ready.
- PDF, CBZ, and page-image ZIP export are included.
- Cloud MP4 export is deferred; the anime result must still be fully playable and editable in-browser.
- Existing roles, authentication, workspaces, Supabase Storage, collaboration, and observational cost tracking remain intact.
- Existing projects and timelines are preserved through additive migrations and compatibility adapters.
"""


class WorkflowBand(Flowable):
    labels = ["Prompt", "Script", "Characters", "Comic", "Export", "Anime", "Video Editor"]

    def __init__(self, width: float):
        super().__init__()
        self.width = width
        self.height = 23 * mm

    def draw(self):
        canvas = self.canv
        cell_width = self.width / len(self.labels)
        y = 5 * mm
        canvas.setLineWidth(1)
        for index, label in enumerate(self.labels):
            x = index * cell_width
            fill = TEAL if index in (0, 5) else CORAL if index in (3, 6) else CARBON_2
            canvas.setFillColor(fill)
            canvas.roundRect(x + 1.2 * mm, y, cell_width - 2.4 * mm, 12 * mm, 2.5 * mm, fill=1, stroke=0)
            canvas.setFillColor(colors.white)
            canvas.setFont("Helvetica-Bold", 6.7 if len(label) > 10 else 7.3)
            text_width = stringWidth(label, "Helvetica-Bold", 6.7 if len(label) > 10 else 7.3)
            canvas.drawString(x + (cell_width - text_width) / 2, y + 4.6 * mm, label)
            if index < len(self.labels) - 1:
                canvas.setStrokeColor(MUTED)
                canvas.line(x + cell_width - 0.8 * mm, y + 6 * mm, x + cell_width + 0.8 * mm, y + 6 * mm)


class PlanDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str, **kwargs):
        super().__init__(filename, **kwargs)
        self._bookmark_index = 0

    def beforeDocument(self):
        self._bookmark_index = 0

    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph):
            return
        levels = {"Heading1": 0, "Heading2": 1, "Heading3": 1}
        level = levels.get(flowable.style.name)
        if level is None:
            return
        self._bookmark_index += 1
        key = f"heading-{self._bookmark_index}"
        text = flowable.getPlainText()
        self.canv.bookmarkPage(key)
        self.canv.addOutlineEntry(text, key, level=level, closed=False)
        self.notify("TOCEntry", (level, text, self.page, key))


def cover_page(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(CARBON)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)

    canvas.setStrokeColor(colors.Color(0.125, 0.83, 0.76, alpha=0.15))
    canvas.setLineWidth(0.8)
    for offset in range(-4, 11):
        x = offset * 28 * mm
        canvas.line(x, 0, x + 85 * mm, height)

    canvas.setFillColor(TEAL)
    canvas.circle(24 * mm, height - 24 * mm, 5.4 * mm, fill=1, stroke=0)
    canvas.setFillColor(CARBON)
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawCentredString(24 * mm, height - 25.3 * mm, "O")
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(34 * mm, height - 25.5 * mm, "ORIGIN STUDIOS")

    canvas.setFillColor(CORAL)
    canvas.roundRect(20 * mm, 25 * mm, 50 * mm, 4 * mm, 2 * mm, fill=1, stroke=0)
    canvas.setFillColor(TEAL)
    canvas.roundRect(72 * mm, 25 * mm, 28 * mm, 4 * mm, 2 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#1A3143"))
    canvas.roundRect(102 * mm, 25 * mm, 85 * mm, 4 * mm, 2 * mm, fill=1, stroke=0)
    canvas.restoreState()


def content_page(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(colors.white)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(CARBON)
    canvas.setFont("Helvetica-Bold", 7.5)
    canvas.drawString(18 * mm, height - 12 * mm, "ORIGIN STUDIOS / PRODUCT DIRECTION")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawRightString(width - 18 * mm, height - 12 * mm, "ORIGIN FRAME")
    canvas.setStrokeColor(TEAL)
    canvas.setLineWidth(1.2)
    canvas.line(18 * mm, height - 15 * mm, 76 * mm, height - 15 * mm)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(76 * mm, height - 15 * mm, width - 18 * mm, height - 15 * mm)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7)
    canvas.drawString(18 * mm, 10 * mm, "Prompt to comic to anime implementation plan")
    canvas.drawRightString(width - 18 * mm, 10 * mm, f"{doc.page}")
    canvas.restoreState()


def styles():
    base = getSampleStyleSheet()
    return {
        "cover_kicker": ParagraphStyle(
            "CoverKicker", parent=base["Normal"], fontName="Helvetica-Bold", fontSize=9,
            leading=12, textColor=TEAL, spaceAfter=8 * mm, alignment=TA_LEFT,
        ),
        "cover_title": ParagraphStyle(
            "CoverTitle", parent=base["Title"], fontName="Helvetica-Bold", fontSize=31,
            leading=34, textColor=colors.white, spaceAfter=7 * mm, alignment=TA_LEFT,
        ),
        "cover_subtitle": ParagraphStyle(
            "CoverSubtitle", parent=base["Normal"], fontName="Helvetica", fontSize=13,
            leading=19, textColor=colors.HexColor("#BFD0DB"), spaceAfter=7 * mm,
        ),
        "cover_meta": ParagraphStyle(
            "CoverMeta", parent=base["Normal"], fontName="Helvetica", fontSize=8.5,
            leading=12, textColor=colors.HexColor("#90A6B4"),
        ),
        "toc_title": ParagraphStyle(
            "TocTitle", parent=base["Title"], fontName="Helvetica-Bold", fontSize=25,
            leading=30, textColor=CARBON, spaceAfter=7 * mm,
        ),
        "Heading1": ParagraphStyle(
            "Heading1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=22,
            leading=26, textColor=CARBON, spaceBefore=4 * mm, spaceAfter=4 * mm,
            keepWithNext=True,
        ),
        "Heading2": ParagraphStyle(
            "Heading2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=15,
            leading=19, textColor=TEAL_DARK, spaceBefore=5 * mm, spaceAfter=2.5 * mm,
            keepWithNext=True,
        ),
        "Heading3": ParagraphStyle(
            "Heading3", parent=base["Heading3"], fontName="Helvetica-Bold", fontSize=11,
            leading=14, textColor=CORAL, spaceBefore=4 * mm, spaceAfter=1.8 * mm,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body", parent=base["BodyText"], fontName="Helvetica", fontSize=9,
            leading=13.2, textColor=INK, spaceAfter=2.6 * mm, allowWidows=0, allowOrphans=0,
        ),
        "bullet": ParagraphStyle(
            "Bullet", parent=base["BodyText"], fontName="Helvetica", fontSize=8.8,
            leading=12.6, textColor=INK, leftIndent=5 * mm, firstLineIndent=-3.5 * mm,
            bulletIndent=1.2 * mm, spaceAfter=1.15 * mm, allowWidows=0, allowOrphans=0,
        ),
        "number": ParagraphStyle(
            "Number", parent=base["BodyText"], fontName="Helvetica", fontSize=8.8,
            leading=12.6, textColor=INK, leftIndent=6 * mm, firstLineIndent=-4.5 * mm,
            spaceAfter=1.15 * mm,
        ),
        "promise": ParagraphStyle(
            "Promise", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=11,
            leading=16, textColor=CARBON, leftIndent=6 * mm, rightIndent=6 * mm,
            spaceBefore=2 * mm, spaceAfter=2 * mm,
        ),
    }


def inline_markup(text: str) -> str:
    escaped = escape(text)
    pieces = escaped.split("`")
    if len(pieces) == 1:
        return escaped
    output = []
    for index, piece in enumerate(pieces):
        if index % 2:
            output.append(f'<font name="Courier" color="#0A887F" size="7.8">{piece}</font>')
        else:
            output.append(piece)
    return "".join(output)


def parse_plan(plan: str, style_map: dict[str, ParagraphStyle], body_width: float):
    story = []
    paragraph_lines: list[str] = []

    def flush_paragraph():
        if not paragraph_lines:
            return
        text = " ".join(line.strip() for line in paragraph_lines)
        paragraph_lines.clear()
        markup = inline_markup(text)
        if text.startswith('The core promise is:'):
            table = Table([[Paragraph(markup, style_map["promise"])]], colWidths=[body_width])
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), PALE_TEAL),
                ("BOX", (0, 0), (-1, -1), 0.8, TEAL),
                ("LEFTPADDING", (0, 0), (-1, -1), 2 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 2 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 2 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2 * mm),
            ]))
            story.extend([table, Spacer(1, 2.5 * mm)])
        else:
            story.append(Paragraph(markup, style_map["body"]))

    for raw in plan.strip().splitlines():
        line = raw.strip()
        if not line:
            flush_paragraph()
            continue
        if line == "[[WORKFLOW]]":
            flush_paragraph()
            story.extend([WorkflowBand(body_width), Spacer(1, 1.5 * mm)])
            continue
        if line.startswith("### "):
            flush_paragraph()
            story.append(Paragraph(inline_markup(line[4:]), style_map["Heading3"]))
            continue
        if line.startswith("## "):
            flush_paragraph()
            story.append(Paragraph(inline_markup(line[3:]), style_map["Heading1"]))
            continue
        if line.startswith("- "):
            flush_paragraph()
            story.append(Paragraph(f'<font color="#20AFA3">&#8226;</font> {inline_markup(line[2:])}', style_map["bullet"]))
            continue
        first, separator, rest = line.partition(". ")
        if separator and first.isdigit():
            flush_paragraph()
            story.append(Paragraph(f'<font color="#FF6B5E"><b>{first}.</b></font> {inline_markup(rest)}', style_map["number"]))
            continue
        paragraph_lines.append(line)

    flush_paragraph()
    return story


def build_pdf():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    style_map = styles()
    page_width, page_height = A4
    content_width = page_width - 36 * mm

    doc = PlanDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=21 * mm,
        bottomMargin=17 * mm,
        title="Origin Frame: Prompt-to-Comic-to-Anime Implementation Plan",
        author="Origin Studios",
        subject="Product direction and implementation plan",
        creator="Origin Studios PDF generator",
    )

    cover_frame = Frame(20 * mm, 30 * mm, page_width - 40 * mm, page_height - 60 * mm, id="cover-frame", showBoundary=0)
    content_frame = Frame(18 * mm, 17 * mm, content_width, page_height - 38 * mm, id="content-frame", showBoundary=0)
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[cover_frame], onPage=cover_page),
        PageTemplate(id="content", frames=[content_frame], onPage=content_page),
    ])

    generated = datetime.now().strftime("%d %B %Y")
    story = [
        Spacer(1, 40 * mm),
        Paragraph("PRODUCT DIRECTION / IMPLEMENTATION PLAN", style_map["cover_kicker"]),
        Paragraph("Origin Frame:<br/>Prompt-to-Comic-to-Anime", style_map["cover_title"]),
        Paragraph(
            "A focused production system for turning one story idea into a structured script, "
            "a professionally lettered comic or manga, and an editable animated episode.",
            style_map["cover_subtitle"],
        ),
        Spacer(1, 13 * mm),
        WorkflowBand(page_width - 40 * mm),
        Spacer(1, 18 * mm),
        Paragraph(f"Prepared for Origin Studios<br/>Generated {generated}<br/>Version 1.0", style_map["cover_meta"]),
        NextPageTemplate("content"),
        PageBreak(),
        Paragraph("Contents", style_map["toc_title"]),
        Paragraph(
            "This document preserves the approved product direction, architecture, implementation sequence, "
            "testing requirements, rollout measures, and operating assumptions.",
            style_map["body"],
        ),
        Spacer(1, 3 * mm),
    ]

    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle("TOC0", fontName="Helvetica-Bold", fontSize=9.5, leading=13, textColor=CARBON, leftIndent=0, firstLineIndent=0, spaceBefore=2 * mm),
        ParagraphStyle("TOC1", fontName="Helvetica", fontSize=8.3, leading=11.5, textColor=TEAL_DARK, leftIndent=5 * mm, firstLineIndent=0),
        ParagraphStyle("TOC2", fontName="Helvetica", fontSize=7.7, leading=10.2, textColor=MUTED, leftIndent=10 * mm, firstLineIndent=0),
    ]
    story.extend([toc, PageBreak()])
    story.extend(parse_plan(PLAN, style_map, content_width))

    doc.multiBuild(story)
    return OUTPUT


if __name__ == "__main__":
    result = build_pdf()
    print(result)
