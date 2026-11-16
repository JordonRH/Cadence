# Personal AI language learning system — research and proposed specification

Research date: 15 November 2026. Status: discovery/specification; nothing installed or deployed. Project capabilities below are documented claims, not hands-on validation. Product choices and acceptance criteria are proposals.

## Recommendation

Build toward a small personal learning app containing an AI tutor, using reusable teaching workflows shared with a skills prototype. Start with one language and a complete learning loop before expanding language coverage. Keep the software and stored progress portable, with optional local or paid AI providers.

Direct chat is useful immediately for explanations, writing feedback and roleplay. A dedicated app earns its place by maintaining reliable learning records, scheduling recall, playing audio, hiding answers and measuring independent performance. A prompt alone does not provide these capabilities. The important distinction is structured practice versus unstructured practice; an app is not automatically better at teaching.

Pending preferences: first language, current ability, target situations, daily time, main device, willingness to use paid AI, and preference for local processing. This draft assumes personal use on phone and desktop, English explanations initially, and no mandatory subscription or notifications. These assumptions are adjustable.

## Learning outcome

Define fluency through observable activities: hold a conversation, understand unfamiliar audio, read material of interest and write useful messages. Use CEFR-aligned can-do descriptors as planning aids, with separate estimates for each skill. Do not award a certified CEFR level from model impressions, word counts or app completion. The Council of Europe defines six levels A1–C2 through can-do descriptors: [official CEFR descriptions](https://www.coe.int/en/web/common-european-framework-reference-languages/level-descriptions).

An initial product target could be independent everyday communication, followed by stronger professional or academic ability if desired. No fixed fluency deadline is defensible before knowing the language, starting level, practice time and opportunities to use it. Real speakers and unfamiliar native material remain part of the learning plan.

Evidence supports investigating AI practice but does not establish this proposed app as a proven route to fluency. A review of 24 studies reports opportunities for speaking practice alongside limitations: [systematic review](https://doi.org/10.1016/j.caeai.2024.100230). A specific study suggests guided self-correction and a feedback interface separate from the conversational partner can improve the experience: [ChatBack](https://aclanthology.org/2023.bea-1.7/). These findings motivate design choices; they do not prove a universal best interface or feedback timing.

## Chat, skills or app

| Approach | Useful for | Missing work | Proposed role |
|---|---|---|---|
| General AI chat | Questions, examples, conversation, corrections | User must manage curriculum, reviews and reliable records; voice depends on the host | Immediate practice and baseline comparison |
| Reusable teaching skills | Consistent lesson methods, structured session output, personal coaching | Need scripts/storage for durable state and scheduling; cannot create voice features absent from the host | Validate teaching approach cheaply |
| Existing open source tools plus AI chat | Reading, dictionaries, recall and media practice | Fragmented interface and progress; integration effort | Try before committing to a full build |
| Small custom app with AI tutor | One learning record, coordinated practice, audio and honest progress | Development, content validation and maintenance | Preferred long-term direction if the pilot helps |

## Open source shortlist

| Project | Documented function | License shown in repository | Assessment for this project |
|---|---|---|---|
| [Lute v3](https://github.com/LuteOrg/lute-v3) | Python/Flask reading tool | MIT | Strong reading-tool candidate to trial; not a complete speaking curriculum |
| [LinguaCafe](https://github.com/simjanos-dev/LinguaCafe) | Self-hosted reading, word lookup and vocabulary review; lists supported languages | GPL-3.0 | Alternative reader to trial for the chosen language |
| [Anki](https://github.com/ankitects/anki) | Spaced repetition flashcards | See repository license and component notices | Useful existing review destination; integrate through export before attempting complex sync |
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | TypeScript spaced repetition scheduler | MIT | Preferred scheduler candidate for custom review screens; use a maintained compatible release |
| [asbplayer](https://github.com/asbplayer/asbplayer) | Browser media player and subtitle sentence mining extension | AGPL-3.0 | Useful optional companion for learning from video |
| [Yomitan](https://github.com/yomidevs/yomitan) | Popup dictionaries, pronunciation sources and Anki card creation | GPL-3.0 | Useful companion where appropriate dictionaries exist |
| [Lector](https://github.com/heuwels/lector) | Reader, cloze review, Anki integration and optional local/cloud AI tutor | AGPL-3.0 | Close functional candidate to trial before building; repository labels two-way Anki sync beta |
| [Lumen](https://github.com/LivingTwice/lumen) | Local AI reading/listening and lesson-aware chat | GPL-3.0 | Promising candidate, with installation instructions currently focused on macOS and Windows; Linux suitability needs validation |
| [Open Language Teacher](https://github.com/cyresearch/open-language-teacher) | Local speech pipeline, lesson notes and Discord voice messages | MIT | Experimental reference for a skills-style tutor; proactive messages conflict with the proposed default experience |
| [LibreLingo](https://github.com/kantord/LibreLingo) | Community language-course platform | AGPL-3.0 | Original repository is archived; do not choose it as the default maintained foundation |

This is a shortlist, not a ranking based on installation tests. Before adopting a codebase: verify recent maintenance, working installation, export, target-language quality, accessibility and release-specific dependency licenses. Repository code, dictionaries, course material and voice/model weights can have different terms; an engine's license does not settle the others. Keep companions separate initially rather than merging several applications into one.

## Core experience

One calm home screen offers Resume, a 5/15/30-minute practice choice, and a suggested next activity with a plain reason. Navigation: Today, Practise, Library, Progress. Settings holds provider and storage choices. Advanced controls stay out of the lesson.

Notifications are off by default. Optional reminders use user-chosen times and can be disabled in one place. No lost streaks, lives, leaderboards, shame messages or escalating reminders. Returning after a break presents a short re-entry session. A review budget caps work and reduces new material when recall becomes difficult; it does not pretend overdue material has been remembered.

Default feedback is a small number of useful corrections after a turn or activity. Intensive drill mode can correct immediately. Conversation mode prioritises completing the task and places explanations beside the conversation. Accept valid regional variants and distinguish errors from stylistic suggestions.

Example 20-minute session, adjustable rather than mandatory:

1. Three minutes recalling phrases encountered previously, before seeing answers.
2. Five minutes reading or listening to material selected for interests and current ability.
3. Eight minutes using those phrases in a practical conversation.
4. Three minutes addressing one recurring difficulty through a hint and retry.
5. One minute selecting useful phrases for future review and choosing a real-world activity.

The central loop is encounter → attempt → feedback → retry → delayed recall → use in a new context. Save selected phrases with context rather than automatically turning every transcript into hundreds of cards.

## First-version requirements

| Capability | Required behaviour | Acceptance example |
|---|---|---|
| Learner profile | Language/variant, goals, interests, available time and baseline evidence | Switching languages preserves independent progress |
| Session planner | Mixes input, output and due review using explicit rules | A listening weakness produces listening practice with an explanation |
| Tutor | Text and turn-based voice roleplay with adjustable support | Learner completes a task without being shown a complete response first |
| Reader/listener | Text and audio import, replay, optional transcript and contextual lookup | Learner attempts comprehension before revealing translation |
| Review | FSRS-backed phrase recall, production and listening cards | A review remains scheduled correctly after restart and export/restore |
| Error notebook | Stores original attempt, proposed correction, reason and retry | One recurring error is practised later in an unfamiliar example |
| Progress | Independent-task evidence separated from practice activity | Dashboard distinguishes minutes practised from demonstrated ability |
| Ownership | Export/delete learner data and select cloud/local processing | Profile, phrases, review history and assessment evidence export together |

Use push-to-talk first: record → transcribe → confirm uncertain text → tutor response → audio playback. Add streaming interruption and continuous conversation only after this works well. Microphone use needs a suitable browser context and device testing.

Speech recognition output is not a pronunciation score. Recognition can normalise learner mistakes. First-version pronunciation work should use listening discrimination, model audio, learner playback and cautious feedback. Do not issue numerical phoneme, tone or accent scores without a separately validated assessment pipeline. Prefer intelligibility over accent imitation as the default goal.

Defer social feeds, native mobile applications, automatic media discovery, handwriting recognition, a large course catalogue, custom model training and universal pronunciation scoring.

## Teaching workflows / proposed skills

Use one tutor workflow with selectable modes and a few focused companion workflows, rather than a large collection of overlapping personas. These are proposed modules, not installed skills.

| Workflow | Responsibility | Structured result |
|---|---|---|
| Learning planner | Converts goals and evidence into a weekly plan | Objectives, prerequisites, activity mix and next checkpoint |
| Session tutor | Conducts explanation, roleplay, writing or targeted drill | Attempts, help used, feedback and retry outcomes |
| Input coach | Guides reading/listening with progressively revealed support | Source, comprehension answers and selected phrases |
| Review builder | Drafts concise context-based recall items | Prompt, accepted answers, explanation, source and review type |
| Progress reviewer | Evaluates unseen tasks and adjusts the plan | Per-skill rubric, evidence, uncertainty and next priorities |

All workflows use the same learner record and output schema. The app owns stored state and scheduling; AI proposes changes through validated operations. A skills prototype uses explicit files and scripts for the same purpose. Persist meaningful outcomes rather than depending on conversational memory. Review card creation should be previewable and deduplicated.

## Language coverage

Make adding a language possible through a versioned pack: locale/script, variants, text segmentation, dictionaries, examples, grammar references, curriculum prerequisites, speech-recognition model, voice, and assessment tasks. Track text, voice and assessment support separately.

Validate one first language, then a second with substantially different needs. Chinese/Japanese segmentation, Arabic right-to-left layout, tone languages and rich inflection need specific handling. Do not advertise equivalent quality for every language just because a model can produce text in it. Lower-resource languages may need curated material and human review before useful teaching is possible. Multiple languages should retain separate plans and review queues, with one optional focus language to keep the workload manageable.

## Architecture proposal

Phone/desktop web app → backend API → learner database and media storage. Backend calls a replaceable text tutor, speech recognition and speech synthesis provider. A deterministic planner and scheduler operate outside the language model. Imported content is treated as learning material, never as executable instructions.

Suggested implementation: TypeScript UI/backend, SQLite for a personal server, and a separate optional Python audio service. This is a proposed stack, not a required dependency list. Keep an export format and database migrations from the beginning. Start with ordinary database queries; a vector database is unnecessary for the initial learner record.

Possible local components: [Ollama](https://github.com/ollama/ollama) for model serving, [faster-whisper](https://github.com/SYSTRAN/faster-whisper) for transcription and [Piper](https://github.com/OHF-Voice/piper1-gpl) for synthesis where the target voice is suitable. These are candidates; language quality, latency, hardware requirements and individual model/voice terms require benchmarking. Local processing reduces provider exposure but still uses disk, memory, compute and maintenance time.

Keep model choices open until tested against the first language. An optional paid provider can be the quality baseline while local options are evaluated on identical tasks. Server-held provider credentials never enter the browser. Store recordings only when enabled; give transcripts, recordings and progress separate deletion controls. Cloud processing must show which content leaves the device/server. Offline review and cached lessons are a later capability; full offline voice is a separate hardware-dependent requirement.

Core entities: LearnerProfile, LanguageProfile, Objective, ContentItem, Attempt, Correction, ReviewItem, ReviewEvent, Assessment and Session. Attempts record help level and modality. Review scheduling records actual recall ratings. Assessment records task/rubric versions and evidence so changes in models do not silently rewrite past progress.

## Progress and teaching quality

Keep reading comprehension, listening comprehension, spoken task completion and writing separate. Track recognition versus unaided production, repeated error patterns, delayed recall and amount of assistance. Avoid a single invented fluency percentage.

Weekly checkpoints use unfamiliar prompts and material with hints disabled initially. Repeated tasks with changed details test transfer. Periodic human conversation or tutor review checks whether performance carries beyond the app. Model scores are estimates; keep rubrics visible and retain examples supporting a judgment.

Use trusted references and dictionaries where possible. Treat acceptable alternatives fairly. On uncertainty, offer a tentative explanation or defer judgment. Have a proficient speaker review a sample of explanations and tasks for each language. A second model can catch some problems but is not ground truth.

## Build sequence and decision gates

1. Establish baseline: choose one language and 2–3 meaningful activities; record an unaided speaking, listening and writing sample. Pick a daily time budget.
2. Run a two-week pilot: compare structured tutor sessions plus existing review/reading tools against ordinary chat. Keep practice time comparable and alternate comparable topics. Compare next-week recall, unseen-task performance, friction and desire to return. This is a personal product experiment, not a controlled efficacy study.
3. Trial Lector and one of Lute/LinguaCafe for the selected language. Check whether their reading flow, export and interface already solve enough of the problem. Fork only if the fit is good; otherwise build a small custom shell around reusable components.
4. Build the smallest complete app: profile, tutor, one input mode, review, error notebook, evidence-based progress and export. Polish the daily experience before adding more modes.
5. Add turn-based voice, then improve responsiveness; validate a second language and optional local providers.

Go forward if delayed recall and unfamiliar task performance improve without excessive setup or review burden. If only practice time rises, revise the learning method before expanding features.

## Cost and effort

No vendor quote or implementation estimate is asserted yet. Cost depends on language, provider, voice minutes, context length, hardware and desired latency. Track text tokens, transcription minutes, synthesised audio and media storage independently. Show actual per-session usage and offer a user-set monthly limit; disable optional paid generation when the cap is reached.

Monthly variable cost = text input/output usage × their rates + transcription minutes × rate + speech generation usage × rate + storage/hosting. Recheck selected provider rates when choosing the implementation. A local setup trades per-call fees for hardware and operation costs; it is not cost-free. Budget engineering separately from AI usage.

## Recommended first milestone

A reusable structured tutor and one shared progress record, trialled with a reader and spaced repetition tool for two weeks. This validates the experience before a larger app investment. The intended destination is a calm app in which tutor conversations, meaningful input and scheduled recall use the same learning history.
