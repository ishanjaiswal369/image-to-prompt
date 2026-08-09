/**
 * Shared prompt content for vision providers. Each provider packages this into
 * its own schema format (Gemini's uppercase-type schema vs. standard JSON
 * Schema for OpenAI-compatible providers), but the actual instructions and
 * field descriptions — the part that determines output quality — live here
 * once so adding a provider can't silently regress prompt richness.
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
};

export const FIELD_DESCRIPTIONS = {
  subject:
    "Every visible subject in precise physical detail: species/type, exact colors and textures, precise pose (position of each visible limb/part, facing direction), and every object it's holding, wearing, or touching, with exact spatial relationships (e.g. 'holding X in its right paw', 'Y resting on its belly'). 2-4 full sentences, not a label.",
  composition:
    "Camera angle (eye-level/high/low), shot type (close-up/medium/wide), where the subject sits in the frame (centered, rule-of-thirds, etc.), and how the frame is divided between foreground/subject/background (e.g. 'sofa occupying the bottom half, curtains filling the top half'). 1-3 full sentences.",
  style:
    "Medium and rendering style (photograph/illustration/3D render/painting), color treatment (full color/monochrome/high-contrast/muted), grain or texture quality, and sharpness/focus characteristics. 1-3 full sentences.",
  lighting:
    "Light direction (e.g. upper-left front, backlit), quality (soft/hard), color temperature if notable, and the resulting shadow behavior and tonal separation on surfaces. 1-2 full sentences.",
  mood: "The emotional or thematic atmosphere the image conveys, and why (what specifically creates it). 1-2 full sentences.",
  promptText:
    "A single dense, flowing paragraph (at least 80-120 words) that synthesizes subject, composition, style, lighting, and mood into one natural-language prompt ready to paste directly into a text-to-image model. No bullet points, no labels — continuous prose as specific and detailed as a professional prompt engineer would write, comparable in density to: 'A white rabbit lying on its back on a dark gray fabric sofa, wearing black sunglasses, holding a black remote control in its right front paw, left front paw extended outward, with a small pizza slice resting on its belly and a glass of dark beer with foam beside its right hind leg. Background features patterned leaf-vein curtains hanging vertically, with deep shadow on the right side. Monochrome high-contrast photographic style, light coming from upper-left front, creating soft shadows and clear tonal separation on fur and upholstery. Medium eye-level shot, subject centered slightly lower, sofa occupying bottom half, curtains filling top half. Film-like grainy texture, sharp focus on fur and fabric weave, emphasizing anthropomorphic humor and cozy domestic leisure atmosphere.'",
} as const;

export const FIELD_ORDER = ["subject", "composition", "style", "lighting", "mood", "promptText"] as const;

export function buildInstructionText(languages: string[]): string {
  const langList = languages.map((l) => LANGUAGE_NAMES[l] ?? l).join(", ");
  return [
    "You are an expert prompt engineer for text-to-image generation models, writing prompts detailed enough to precisely regenerate the attached image.",
    "Examine every visible detail before writing: exact colors, materials, textures, poses, spatial relationships between objects, background elements, camera framing, light direction and quality, and overall atmosphere.",
    "Be exhaustive and specific — never summarize with a short label or a single generic sentence. Prefer concrete, visually-grounded description over vague adjectives.",
    `Write your analysis in ${langList}, following the field-by-field detail level described in the schema.`,
  ].join(" ");
}

export interface PromptFields {
  subject: string;
  composition: string;
  style: string;
  lighting: string;
  mood: string;
  promptText: string;
}
