/**
 * Single source of truth for photoreal prompt section specifications.
 * Used by both analyze/route.ts (to build the extract prompt) and
 * remix/route.ts (to inject per-section contracts into the rewrite instruction).
 */

export const SECTION_SPEC_ORDER = [
  "Visual Hook",
  "Scene",
  "Genre",
  "Pose",
  "Lighting",
  "Camera",
  "Mood",
  "Color",
  "Clothing",
  "Makeup",
  "Composition",
  "Avoid",
] as const;

export type SectionLabel = (typeof SECTION_SPEC_ORDER)[number];

export type ExtractStyle = "photoreal" | "midjourney" | "sd" | "flux" | "nano" | "dalle";

/** Shared deep-analysis instructions for non-photoreal model output contracts. */
const ANALYSIS_CORE = `You are an expert AI image analyst and photographic art director.
Analyze the image and build a complete, faithful mental model of the scene before writing the final prompt.

Fidelity priority:
Describe exactly what is in this specific image, not an idealized or improved version of it. Be concrete and specific about the actual pose, head turn, body orientation, shoulder and hip alignment, crop, subject scale, camera angle, garment silhouette and construction (including open/closed areas and distinctive textures), lighting direction, background, color palette, and composition. State concrete geometry and spatial relationships before any mood or style language. Do not generalize a distinctive image into a generic fashion-editorial description. If a detail is unclear, give the most visually faithful estimate grounded in the image rather than inventing flattering details.

Magnitude fidelity (do not soften):
Report the actual degree and extremity of every bend, lean, and angle. If the torso is folded sharply at the hips (e.g. ~90 degrees), the hips/buttocks are raised high, the back is deeply arched, or a limb is fully extended, say so explicitly — never downgrade an extreme or provocative pose into a mild one (e.g. do not write "slightly leaning forward" for a deep hip-hinge). Preserve the real intensity of the pose.

Do not invent occluded or contact details:
For limb arrangement, hand/foot placement, and points of support/contact, describe ONLY what is actually visible. If a limb is hidden or occluded, write "not visible" instead of guessing a position. Do not invent crossings, contacts, or supports (e.g. do not claim ankles are crossed or a hand rests somewhere unless it is clearly visible).

Cross-aspect consistency (mandatory):
Pose, camera angle, and composition in your description must describe the SAME body orientation, head/gaze direction, and framing — they cannot contradict each other.
- Orientation: if the torso is rotated away from the lens (any three-quarter or back angle) or the head turns toward the lens, the horizontal viewing angle MUST reflect that same rotation. Never write "strict profile", "shot directly from the side", "no body rotation", or similar when the torso is turned or the subject gazes into the camera. Reserve "profile"/"near-profile" for a torso that is genuinely side-on to the lens.
- Gaze: the head-turn and gaze direction must match the camera angle (e.g. a subject looking into the lens cannot be photographed in pure profile).
- Framing: the crop MUST include every body region named in the pose. If hands rest on the floor and knees are down, the framing cannot crop at the waist — extend it to include those parts.

Capture all of these aspects in your understanding (you will format them per the output contract below):
- Visual hook: the single most distinctive creative feature of THIS image
- Scene: setting and action
- Genre: photographic genre
- Pose: full body geometry, orientation, gaze, spine curvature, limbs (only visible parts)
- Lighting: key/fill/rim, color temperature, shadows
- Camera: focal length class, framing scale, height, viewing angle, depth of field
- Mood: emotional tone
- Color: palette, grading, contrast
- Clothing: garments, jewelry, accessories, materials, fit, distinctive structural details
- Makeup: visible cosmetic application (or "no visible makeup" / "not visible")
- Composition: subject placement, crop, negative space, background
- Avoid: anti-drift constraints (different pose, wrong orientation, simplified outfit, changed crop, extra objects)`;

const OUTPUT_CONTRACTS: Record<Exclude<ExtractStyle, "photoreal">, string> = {
  midjourney: `Using the full understanding above, output ONLY a single Midjourney prompt line (no labels, no markdown, no explanations).
Format: comma-separated descriptors covering subject and appearance, clothing, the faithful pose and body orientation, scene, lighting, mood, color/grade, composition and camera, photographic style, highly detailed, sharp focus, 8k.
End with --ar matching the image aspect ratio (2:3 for portrait, 3:2 for landscape, 1:1 for square) and --style raw.
Keep it faithful to the captured pose, orientation, and crop. Do not soften an extreme pose.`,

  sd: `Using the full understanding above, output ONLY a Stable Diffusion prompt (no labels, no markdown, no explanations).
First line: comma-separated positive tags covering subject, appearance, clothing, faithful pose and orientation, scene, lighting, color, composition, camera, plus quality boosters (masterpiece, best quality, ultra-detailed, sharp focus, 8k).
Then a line starting with "Negative prompt:" listing artifacts and anti-drift constraints to avoid (different pose, frontal portrait when source is turned away, distorted hands, plastic skin, extra objects, simplified outfit, changed crop).`,

  flux: `Using the full understanding above, output ONLY one natural-language paragraph (FLUX prefers prose, not tags). No labels, no markdown, no explanations.
Describe subject and appearance, clothing, the faithful pose and orientation, scene, lighting, color palette, mood, composition and camera in photorealistic style.
Preserve exact orientation, crop, and distinctive details. Do not soften an extreme pose.`,

  nano: `Using the full understanding above, output ONLY a natural-language image prompt for Google Nano Banana (Gemini image). No labels, no markdown, no explanations.
Write a clear conversational instruction describing subject and appearance, clothing, faithful pose and orientation, setting, lighting, color, mood, and composition.
Photorealistic, highly detailed. Keep identity and the exact pose faithful to the source. Do not soften an extreme pose.`,

  dalle: `Using the full understanding above, output ONLY one vivid descriptive natural-language paragraph prompt for DALL·E. No labels, no markdown, no explanations.
Describe subject and appearance, clothing, faithful pose and orientation, setting, lighting, color, mood, and composition.
Photorealistic, high detail. Preserve exact orientation, crop, and distinctive details. Do not soften an extreme pose.`,
};

const HEADER = `You are an expert AI image analyst and photographic art director.
Analyze the image and produce a structured scene description for an AI image generator.

Output ONLY the labeled sections below, in this exact order. Each label is on its own line,
the description starts on the next line. No extra commentary, no markdown fences.

Fidelity priority:
Describe exactly what is in this specific image, not an idealized or improved version of it. Be concrete and specific about the actual pose, head turn, body orientation, shoulder and hip alignment, crop, subject scale, camera angle, garment silhouette and construction (including open/closed areas and distinctive textures), lighting direction, background, color palette, and composition. State concrete geometry and spatial relationships before any mood or style language. Do not generalize a distinctive image into a generic fashion-editorial description. If a detail is unclear, give the most visually faithful estimate grounded in the image rather than inventing flattering details.

Magnitude fidelity (do not soften):
Report the actual degree and extremity of every bend, lean, and angle. If the torso is folded sharply at the hips (e.g. ~90 degrees), the hips/buttocks are raised high, the back is deeply arched, or a limb is fully extended, say so explicitly — never downgrade an extreme or provocative pose into a mild one (e.g. do not write "slightly leaning forward" for a deep hip-hinge). Preserve the real intensity of the pose.

Do not invent occluded or contact details:
For limb arrangement, hand/foot placement, and points of support/contact, describe ONLY what is actually visible. If a limb is hidden or occluded, write "not visible" instead of guessing a position. Do not invent crossings, contacts, or supports (e.g. do not claim ankles are crossed or a hand rests somewhere unless it is clearly visible).

Cross-section consistency (mandatory):
Pose, Camera, and Composition must describe the SAME body orientation, head/gaze direction, and framing — they cannot contradict each other.
- Orientation: if the torso is rotated away from the lens (any three-quarter or back angle) or the head turns toward the lens, Camera's horizontal viewing angle MUST reflect that same rotation. Never write "strict profile", "shot directly from the side", "no body rotation", or similar when the torso is turned or the subject gazes into the camera. Reserve "profile"/"near-profile" for a torso that is genuinely side-on to the lens.
- Gaze: the head-turn and gaze direction stated in Pose must match the camera angle described in Camera (e.g. a subject looking into the lens cannot be photographed in pure profile).
- Framing: Camera's framing scale and Composition's crop MUST include every body region named in Pose. If hands rest on the floor and knees are down, the framing cannot crop at the waist — extend it to include those parts.
Re-read Pose before writing Camera and Composition, and make them agree.

Completeness is mandatory. Always produce every section exactly once:
Visual Hook, Scene, Genre, Pose, Lighting, Camera, Mood, Color, Clothing, Makeup, Composition, Avoid.
Do not stop early, do not omit low-confidence sections, and do not end with an unfinished sentence.
If a detail is unclear, write a plausible visual estimate grounded in the image instead of skipping the section.`;

/**
 * Per-section body text (everything AFTER "Label:\n" in the analyze extract prompt).
 * Scene…Composition bodies match the original analyze route literal; Makeup was
 * added later as a dedicated appearance section.
 */
export const SECTION_SPECS: Record<SectionLabel, string> = {
  "Visual Hook": `One concise polished art-direction sentence describing the main visual idea that makes the image
compelling: contrast, silhouette, lighting concept, composition hook, mood, or fashion/editorial concept.
Do not catalogue scene details, pose geometry, clothing details, lighting setup, camera details, or
identity/biometric features. Do NOT name the location, furniture, props, or the literal action, and do not
paraphrase the Scene section — if you cannot phrase the hook without naming the chair/setting or the action
verb, that content belongs in Scene, not here. Keep it to the abstract aesthetic concept (silhouette idea,
contrast, mood, editorial concept); a silhouette may be referenced as an abstract shape (e.g. "a sculptural
deep-bend S-curve seen from behind") without listing individual body parts. This should summarize the image's
strongest creative hook for downstream image generation. Name the single most distinctive, must-survive feature
of THIS specific image (for example the exact silhouette, a deep bent-over-from-behind shape with raised hips, a
back-facing head turn, an open-back garment shape, or wing/feather geometry) instead of a generic "dramatic
fashion statement".`,

  Scene: `Where it is and what is happening — 1–2 sentences. Use a neutral subject label ("the subject",
"a person"). Do NOT describe hair color, hair length, hair texture, facial features, skin tone,
age, or body type here. Actions and props are fine.`,

  Genre: `The photographic genre (fashion editorial, street photography, portrait, boudoir, fitness, etc.)`,

  Pose: `One cohesive paragraph for IMAGE GENERATION describing ONLY the subject's physical pose and body
geometry. Start with an explicit, unambiguous statement of (a) which way the torso faces relative to the
lens (frontal / slight three-quarter / strong three-quarter / near-profile / back) and (b) the head-turn
and gaze direction (e.g. "head turned over the shoulder, gaze into the lens") — Camera and Composition
must later agree with these two facts. Then cover in order: (1) head vs torso facing direction and tilt relative to camera;
(2) shoulders and torso angle/lean; (3) spine and back line — the degree and direction of curvature as a
continuous line: pronounced lower-back arch (lordosis) with raised chest and backward-tilted pelvis,
neutral/straight, or rounded/hunched; name the overall body line (e.g. strong S-curve); (4) arms and hands
— positions, angles, contacts; (5) hips and legs if visible. End with one short posture label (e.g. "contrapposto", "upright
formal", "relaxed slouch"). Do NOT include focal length, camera height, or framing here. Stay faithful to the actual pose: state the exact facing direction, head-turn direction and angle, torso rotation and how much of the back is visible, shoulder line, spine/back curvature, hip shift, and visible arm/hand positions. State the magnitude of every bend and lean (e.g. a deep ~90-degree hip hinge with raised hips, a strongly arched back, fully extended legs) and never soften an extreme pose into a mild one. Describe only limbs, hands, feet, and contact/support points that are actually visible; if a limb is occluded write "not visible" and do not invent crossings, contacts, or supports. If the subject is shown from the back or three-quarter back, keep it that way — never convert a turned-away or back pose into a frontal portrait.`,

  Lighting: `Describe the lighting setup: key light direction and quality (hard/soft), fill and rim presence,
color temperature (warm/cool/neutral), visible shadows and highlights. Be specific (e.g.
"Rembrandt loop from camera-left, soft box, warm 4500 K").`,

  Camera: `One paragraph covering in order: (1) estimated focal length class with plausible full-frame mm
range; (2) framing scale (close-up / bust / waist-up / full body / environmental); (3) camera
height relative to subject's eyes (below / eye level / slightly above / clearly above);
(4) horizontal viewing angle (frontal / slight three-quarter / strong three-quarter / near-profile) — this MUST be consistent with the torso rotation and head-turn described in Pose: do not write "profile"/"near-profile" unless the torso is genuinely side-on to the lens, and never claim "no rotation"/"strict profile" when Pose has a turned torso or a gaze into the camera;
(5) depth of field (shallow / moderate / deep, what is sharp vs blurred). Preserve the original crop, subject scale, camera height, and horizontal viewing angle; describe how much of the body is included (e.g. waist-up vs full body) and do not re-frame the shot. The framing scale must include every body region named in Pose (e.g. do not crop at the waist if the hands and knees are part of the pose).`,

  Mood: `The emotional tone and atmosphere — adjectives plus brief interpretation.`,

  Color: `Color palette, grading style, contrast, saturation. Name dominant and accent colors, note any
cinematic grade (e.g. "teal-orange grade", "muted desaturated", "warm golden hour").`,

  Clothing: `One cohesive paragraph for IMAGE GENERATION. Describe garments, jewelry, and worn accessories on the
subject only (not pose, not body-shape commentary unless it affects how the cloth reads).
Cover in order (say "not visible" if a region is out of frame; use "" only if no clothing, jewelry, or
worn accessories are visible at all, e.g. a face-only crop with nothing worn visible):
(1) Upper body: garment type(s) (e.g. tank, tee, shirt, blouse, sweater, jacket, coat), neckline/collar,
sleeve length and cut, layers (under/over).
(2) Lower body if visible: pants, skirt, shorts, dress continuation — cut (wide, slim, straight),
rise if inferable.
(3) Colors and patterns: name dominant and accent colors; stripes, checks, solid, print motif if any.
(4) Material read: what the fabric looks like (denim, ribbed knit, leather, satin, mesh, fleece, linen,
suit wool, etc.) even if approximate.
(5) Fit and styling: tight / fitted / relaxed / oversized; cropped, tucked vs untucked, rolled cuffs,
undone buttons, off-shoulder, etc.
(6) Jewelry and piercings: earrings (studs, hoops, drops), necklaces/chokers/chains, rings,
bracelets/bangles, anklets, visible piercings, brooches, pins, body chains — metal color (gold, silver,
rose) and stones if any; say "none visible" if absent.
(7) Other worn accessories: footwear if visible; headwear (cap, beanie, headband); belt; watch;
eyeglasses/sunglasses; gloves; scarf; bag/handbag/clutch on body or strap crossing torso — one short
phrase each or "none visible".
Describe garment construction and silhouette before any styling adjectives, and preserve distinctive
structural features exactly (e.g. open-back cutout, wing/shoulder volume, feathers/beads/sequins, sleeve
transparency, separate lower garment, jewelry). Do not simplify a distinctive outfit into a generic top
or jacket.`,

  Makeup: `One cohesive paragraph for IMAGE GENERATION describing the subject's visible makeup. Cover in
order: (1) overall look (no-makeup/natural, everyday, soft glam, full glam, editorial, dramatic);
(2) complexion finish (bare, matte, dewy, full coverage); (3) eyes (liner, shadow, lashes,
intensity); (4) lips (color and finish); (5) brows and accents (blush, highlighter, contour).
Describe ONLY cosmetic application, not permanent facial features or identity. Say "no visible
makeup" if none is apparent, or "not visible" if the face is out of frame.`,

  Composition: `One cohesive paragraph for IMAGE GENERATION. Cover: (1) subject placement vs frame (centered,
rule-of-thirds, edge-weighted); (2) crop tightness and what is included; (3) vertical subject
position in frame and horizon placement; (4) foreground/midground/background emphasis;
(5) leading lines or framing elements; (6) notable negative space. Preserve the actual subject placement and crop boundaries: state whether the subject is left/right/center weighted, the head/torso position in frame, the negative space, and the background simplicity, rather than recomposing the shot.`,

  Avoid: `A compact comma-separated list or short sentence of visual mistakes and artifacts to avoid for this
specific photoreal image. Include only relevant negative constraints such as 3D render look, cartoon
styling, distorted hands, plastic skin, harsh over-retouching, extra objects, messy clothing, cheap
accessories, wrong era/style, or flat lighting when applicable. Do not add constraints that contradict
the positive prompt sections. Keep it short and generator-ready. Always include the anti-drift constraints relevant to this image: different pose, frontal portrait when the source is turned away, straightened or flattened back when the source is arched, lost lower-back arch / spine curvature, redesigned or simplified outfit, missing open-back or structural details, changed crop or camera angle, altered subject scale, and added props or background elements.`,
};

/**
 * Spec for the CRITICAL RULES section.
 * In analyze this block is a fixed output appended after Gemini's response,
 * not a per-section spec — so we write a remix-specific version here.
 */
export const CRITICAL_RULES_SPEC =
  `This is a fixed safety and quality rules block, not a creative description. ` +
  `Keep the existing rule lines about preserving identity, natural integration, and photorealistic high-detail output. ` +
  `Only add or adjust a rule if the edit clearly asks for it; never turn it into prose.`;

/**
 * Returns the section specification for remix injection, or null for unknown labels
 * (e.g. the "Prompt" fallback section or non-photoreal styles).
 */
export function getSectionSpec(label: string): string | null {
  if (label === "CRITICAL RULES") return CRITICAL_RULES_SPEC;
  return (SECTION_SPECS as Record<string, string>)[label] ?? null;
}

/**
 * Assembles the full photoreal extract prompt from HEADER + SECTION_SPECS.
 */
export function buildPhotorealExtractPrompt(): string {
  const sections = SECTION_SPEC_ORDER.map((label) => `${label}:\n${SECTION_SPECS[label]}`);
  return [HEADER, ...sections].join("\n\n");
}

/**
 * Assembles the extract prompt for any style.
 * photoreal → full 12-section structured output; other styles → shared analysis core + model output contract.
 */
export function buildExtractPrompt(style: ExtractStyle): string {
  if (style === "photoreal") return buildPhotorealExtractPrompt();
  return [ANALYSIS_CORE, OUTPUT_CONTRACTS[style]].join("\n\n");
}
